#!/usr/bin/env python3
"""
Beyond Stage Zero range sender.

Reads sensor values (e.g. chamber pressure) from the test-stand Arduino over USB, saves every
reading to a CSV on this laptop, and streams them to Octopus so the team sees them live and
beyondstagezero.space can show them (with the delay set in Octopus).

  pip install pyserial
  python3 range_sender.py --port COM3 --key bszr_...            # Windows
  python3 range_sender.py --port /dev/ttyACM0 --key bszr_...    # Linux / Raspberry Pi
  python3 range_sender.py --simulate --key bszr_...             # no hardware: fake hot-fire curve

The key comes from Octopus -> .space -> Live sensor data -> Range laptop. You can also put it in
the OCTOPUS_RANGE_KEY environment variable instead of passing --key.

What the Arduino should print, one reading per line (115200 baud by default):
  98.4                          -> chamber pressure
  chamber=98.4,tank=150.2       -> named channels (also "chamber:98.4 tank:150.2")
  98.4,150.2                    -> unnamed; named by --channels (default: chamber,tank,...)
Lines that aren't numbers (e.g. "ARMED") are written to the CSV but not sent.

Readings go to whichever test is Live or on Hold in Octopus. The full-rate CSV is the real
record: the internet copy is thinned to --rate readings a second per channel and can drop out.
"""

import argparse
import csv
import json
import math
import os
import queue
import random
import re
import sys
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime

DEFAULT_URL = "https://ops.beyondstagezero.com"
NAME_OK = re.compile(r"^[a-z][a-z0-9_]{0,23}$")


def now_ms():
    return int(time.time() * 1000)


def parse_line(line, channels):
    """Turns one line from the Arduino into {channel: value}, or None if it has no numbers."""
    line = line.strip()
    if not line:
        return None
    out = {}
    if "=" in line or ":" in line:
        for part in re.split(r"[,\s;]+", line):
            m = re.match(r"^([A-Za-z][A-Za-z0-9_]*)[=:](-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)$", part)
            if m:
                name = m.group(1).lower()
                if NAME_OK.match(name):
                    out[name] = float(m.group(2))
        return out or None
    parts = [p for p in re.split(r"[,\s;\t]+", line) if p]
    try:
        values = [float(p) for p in parts]
    except ValueError:
        return None
    for i, v in enumerate(values[:8]):
        name = channels[i] if i < len(channels) else "ch%d" % (i + 1)
        out[name] = v
    return out or None


class Sender(threading.Thread):
    """Posts batches to Octopus in the background, keeping a backlog if the connection drops."""

    def __init__(self, url, key, units, test=None, every=0.25):
        super().__init__(daemon=True)
        self.url = url.rstrip("/") + "/api/range/ingest"
        self.key = key
        self.units = units
        self.test = test
        self.every = every
        self.q = queue.Queue()
        self.backlog = []
        self.status = "starting"
        self.sent = 0
        self.stop = False

    def run(self):
        while not self.stop:
            time.sleep(self.every)
            while True:
                try:
                    self.backlog.append(self.q.get_nowait())
                except queue.Empty:
                    break
            if len(self.backlog) > 60000:  # ~50 min at 20/s: drop the oldest, the CSV still has it
                self.backlog = self.backlog[-60000:]
            if not self.backlog:
                continue
            batch = self.backlog[:1500]
            body = {"samples": batch, "units": self.units}
            if self.test:
                body["test"] = self.test
            req = urllib.request.Request(
                self.url,
                data=json.dumps(body).encode(),
                headers={"Content-Type": "application/json", "Authorization": "Bearer " + self.key},
                method="POST",
            )
            try:
                with urllib.request.urlopen(req, timeout=5) as r:
                    reply = json.loads(r.read() or b"{}")
                self.backlog = self.backlog[len(batch):]
                self.sent += len(batch)
                name = (reply.get("test") or {}).get("name", "")
                self.status = "live -> " + name if name else "live"
            except urllib.error.HTTPError as e:
                try:
                    msg = json.loads(e.read() or b"{}").get("error", "")
                except Exception:
                    msg = ""
                if e.code == 401:
                    self.status = "WRONG KEY: " + (msg or "check --key")
                elif e.code == 409:
                    self.status = "waiting: " + (msg or "no test is Live or on Hold")
                    # Hold readings taken before the test went Live for up to 2 minutes, then let them go.
                    cutoff = now_ms() - 120000
                    self.backlog = [s for s in self.backlog if s["t"] >= cutoff]
                else:
                    self.status = "error %d %s" % (e.code, msg)
            except Exception as e:  # network down, timeout...
                self.status = "offline, retrying (%s)" % e.__class__.__name__


class Thinner:
    """Averages readings into --rate slots a second for the upload (the CSV keeps every reading)."""

    def __init__(self, rate):
        self.slot_ms = 1000.0 / rate if rate > 0 else 0
        self.slot = None
        self.acc = {}

    def add(self, t, values):
        if not self.slot_ms:
            return [dict(t=t, **values)]
        slot = int(t // self.slot_ms)
        out = []
        if self.slot is not None and slot != self.slot and self.acc:
            out.append(self.flush())
        self.slot = slot
        for k, v in values.items():
            s = self.acc.setdefault(k, [0.0, 0, t])
            s[0] += v
            s[1] += 1
            s[2] = t
        return out

    def flush(self):
        t = max(s[2] for s in self.acc.values())
        sample = {"t": t}
        for k, (total, n, _) in self.acc.items():
            sample[k] = round(total / n, 3)
        self.acc = {}
        return sample


def simulated(rate_hz=200):
    """A fake hot fire: 10 s idle, ignition, ~8 s burn at ~280 psi with some roughness, tail-off, repeat."""
    start = time.time()
    while True:
        t = time.time() - start
        cycle = t % 40
        if cycle < 10:
            p = 0.0
        elif cycle < 10.4:
            p = 285 * ((cycle - 10) / 0.4) ** 1.5
        elif cycle < 18.4:
            p = 280 + 6 * math.sin(cycle * 23) - (cycle - 10.4) * 1.2
        elif cycle < 19.4:
            p = 270 * math.exp(-(cycle - 18.4) * 5)
        else:
            p = 0.0
        p += random.gauss(0, 1.2)
        tank = 500 - min(max(cycle - 10, 0), 9.4) * 32 + random.gauss(0, 0.8)
        yield "chamber=%.2f,tank=%.2f" % (max(p, -2), tank)
        time.sleep(1.0 / rate_hz)


def serial_lines(port, baud):
    try:
        import serial  # pyserial
    except ImportError:
        sys.exit("pyserial isn't installed. Run:  pip install pyserial")
    while True:
        try:
            with serial.Serial(port, baud, timeout=1) as ser:
                print("Connected to %s at %d baud" % (port, baud))
                while True:
                    raw = ser.readline()
                    if raw:
                        yield raw.decode("utf-8", "replace")
        except serial.SerialException as e:
            print("\nSerial port problem (%s). Retrying in 2 s..." % e)
            time.sleep(2)


def main():
    ap = argparse.ArgumentParser(description="Stream test-stand sensor readings to Octopus.")
    ap.add_argument("--port", help="Serial port of the Arduino, e.g. COM3 or /dev/ttyACM0")
    ap.add_argument("--baud", type=int, default=115200)
    ap.add_argument("--key", default=os.environ.get("OCTOPUS_RANGE_KEY"), help="Range key from Octopus")
    ap.add_argument("--url", default=DEFAULT_URL, help="Octopus address (default %(default)s)")
    ap.add_argument("--test", help="Send to this test id instead of whichever is Live/Hold")
    ap.add_argument("--channels", default="chamber,tank", help="Names for unnamed columns (default %(default)s)")
    ap.add_argument("--units", default="chamber=psi,tank=psi", help="Units shown on the sites (default %(default)s)")
    ap.add_argument("--rate", type=float, default=20, help="Readings per second sent online (default 20; 0 = all)")
    ap.add_argument("--out", default=".", help="Folder for the CSV log (default: current folder)")
    ap.add_argument("--simulate", action="store_true", help="No hardware: send a fake hot-fire curve")
    args = ap.parse_args()

    if not args.key:
        sys.exit("Missing --key. Make one in Octopus -> .space -> Live sensor data -> Range laptop.")
    if not args.simulate and not args.port:
        sys.exit("Say which serial port the Arduino is on with --port (or use --simulate).")

    channels = [c.strip().lower() for c in args.channels.split(",") if c.strip()]
    units = {}
    for part in args.units.split(","):
        if "=" in part:
            k, v = part.split("=", 1)
            if NAME_OK.match(k.strip().lower()):
                units[k.strip().lower()] = v.strip()[:12]

    os.makedirs(args.out, exist_ok=True)
    path = os.path.join(args.out, "range-%s.csv" % datetime.now().strftime("%Y%m%d-%H%M%S"))
    f = open(path, "w", newline="")
    log = csv.writer(f)
    log.writerow(["time_iso", "epoch_ms", "raw_line", "values_json"])
    print("Saving every reading to %s" % os.path.abspath(path))

    sender = Sender(args.url, args.key, units, args.test)
    sender.start()
    thinner = Thinner(args.rate)
    lines = simulated() if args.simulate else serial_lines(args.port, args.baud)
    count = 0
    last_print = 0.0
    last_flush = time.time()
    latest = {}
    try:
        for line in lines:
            t = now_ms()
            values = parse_line(line, channels)
            log.writerow([datetime.fromtimestamp(t / 1000).isoformat(timespec="milliseconds"), t, line.strip(),
                          json.dumps(values) if values else ""])
            if values:
                count += 1
                latest = values
                for sample in thinner.add(t, values):
                    sender.q.put(sample)
            now = time.time()
            if now - last_flush > 1:
                f.flush()
                last_flush = now
            if now - last_print > 0.5:
                shown = "  ".join("%s %.1f%s" % (k, v, units.get(k, "")) for k, v in latest.items())
                sys.stdout.write("\r%-46s | %d read, %d sent | %s   " % (shown[:46], count, sender.sent, sender.status[:60]))
                sys.stdout.flush()
                last_print = now
    except KeyboardInterrupt:
        pass
    finally:
        print("\nStopping. Sending what's left...")
        if thinner.acc:
            sender.q.put(thinner.flush())
        deadline = time.time() + 5
        while (sender.backlog or not sender.q.empty()) and time.time() < deadline:
            time.sleep(0.25)
        sender.stop = True
        f.close()
        print("Saved %d readings to %s" % (count, os.path.abspath(path)))


if __name__ == "__main__":
    main()
