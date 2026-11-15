/*!
 * Octopus public stats embed — shows BSZ's public numbers and countdowns on any website.
 *
 * Paste where you want them to appear:
 *
 *   <div data-octopus="numbers"></div>
 *   <div data-octopus="countdowns"></div>
 *   <script src="https://ops.beyondstagezero.com/embed.js" defer></script>
 *
 * Optional attributes on either div:
 *   data-theme="light"     dark text for light backgrounds (default: inherits the page's colours)
 *   data-limit="3"         show at most this many items
 *   data-builds="off"      (numbers only) leave out the automatic "Parts built" figure
 *
 * Everything is styled with low-specificity classes prefixed "octo-" so the host site
 * can restyle it. Numbers refresh every minute; countdowns tick every second.
 */
(function () {
  var script = document.currentScript
  var origin = script ? new URL(script.src).origin : 'https://ops.beyondstagezero.com'
  var FEED = origin + '/api/public/stats'
  var REFRESH_MS = 60000

  var css =
    '.octo{font-variant-numeric:tabular-nums;color:inherit}' +
    '.octo-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:24px}' +
    '.octo-item{display:flex;flex-direction:column;gap:4px}' +
    '.octo-value{font-size:2.5em;font-weight:700;line-height:1;letter-spacing:-.02em}' +
    '.octo-suffix{font-size:.5em;margin-left:.15em;opacity:.7}' +
    '.octo-label{font-size:.8em;letter-spacing:.12em;text-transform:uppercase;opacity:.7}' +
    '.octo-caption{font-size:.85em;opacity:.6}' +
    '.octo-clock{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:1.9em;font-weight:600;white-space:nowrap}' +
    '.octo-t{color:#ff5a1f;margin-right:.3em}' +
    '.octo-unit{font-size:.55em;opacity:.6;margin:0 .35em 0 .05em}' +
    '.octo-when{font-size:.85em;opacity:.6}' +
    '.octo[data-theme=light]{color:#0b0d0f}' +
    '.octo[data-theme=dark]{color:#f3f3ee}'

  function injectCss() {
    if (document.getElementById('octo-embed-css')) return
    var s = document.createElement('style')
    s.id = 'octo-embed-css'
    s.textContent = css
    document.head.appendChild(s)
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag)
    if (cls) e.className = cls
    if (text != null) e.textContent = text
    return e
  }

  function fmt(n) {
    return Number(n).toLocaleString('en-AU', { maximumFractionDigits: 2 })
  }

  // Accepts "14:30" or "2:30 pm"; returns [hours24, minutes] or null.
  function parseTime(t) {
    var m = /^\s*(\d{1,2})(?:[:.h]?(\d{2}))?\s*([ap])?\.?\s*m?\.?\s*$/i.exec(t || '')
    if (!m) return null
    var h = +m[1], min = m[2] ? +m[2] : 0, ap = m[3] && m[3].toLowerCase()
    if (ap === 'a') h = h === 12 ? 0 : h
    else if (ap === 'p') h = h === 12 ? 12 : h + 12
    return h > 23 || min > 59 ? null : [h, min]
  }

  function time12(t) {
    var p = parseTime(t)
    if (!p) return t
    return (p[0] % 12 || 12) + ':' + pad(p[1]) + ' ' + (p[0] < 12 ? 'am' : 'pm')
  }

  function targetOf(c) {
    var d = c.date.split('-').map(Number)
    var t = parseTime(c.time) || [0, 0]
    return new Date(d[0], d[1] - 1, d[2], t[0], t[1]).getTime()
  }

  function pad(n) {
    return (n < 10 ? '0' : '') + n
  }

  function renderNumbers(root, feed) {
    var limit = Number(root.getAttribute('data-limit')) || Infinity
    var items = feed.numbers.slice()
    if (root.getAttribute('data-builds') !== 'off' && feed.builds && feed.builds.partsBuilt > 0) {
      items.push({ label: 'Parts built', value: feed.builds.partsBuilt, suffix: null, description: null })
    }
    var grid = el('div', 'octo-grid')
    items.slice(0, limit).forEach(function (n) {
      var item = el('div', 'octo-item')
      var v = el('span', 'octo-value', fmt(n.value))
      if (n.suffix) v.appendChild(el('span', 'octo-suffix', n.suffix))
      item.appendChild(v)
      item.appendChild(el('span', 'octo-label', n.label))
      if (n.description) item.appendChild(el('span', 'octo-caption', n.description))
      grid.appendChild(item)
    })
    root.replaceChildren(grid)
  }

  var clocks = []

  function renderCountdowns(root, feed) {
    var limit = Number(root.getAttribute('data-limit')) || 3
    var now = Date.now()
    var upcoming = feed.countdowns
      .map(function (c) { return { c: c, at: targetOf(c) } })
      .filter(function (x) { return x.at > now - 3600000 })
      .slice(0, limit)
    var grid = el('div', 'octo-grid')
    clocks = clocks.filter(function (k) { return document.contains(k.node) && !root.contains(k.node) })
    upcoming.forEach(function (x) {
      var item = el('div', 'octo-item')
      item.appendChild(el('span', 'octo-label', x.c.name))
      var clock = el('span', 'octo-clock')
      item.appendChild(clock)
      var d = new Date(x.at)
      item.appendChild(
        el('span', 'octo-when', d.toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' }) + (x.c.time ? ' · ' + time12(x.c.time) : '')),
      )
      grid.appendChild(item)
      clocks.push({ node: clock, at: x.at })
    })
    root.replaceChildren(grid)
    tick()
  }

  function tick() {
    var now = Date.now()
    clocks.forEach(function (k) {
      var diff = k.at - now
      var s = Math.floor(Math.abs(diff) / 1000)
      var days = Math.floor(s / 86400)
      s -= days * 86400
      var html =
        '<span class="octo-t">T' + (diff >= 0 ? '−' : '+') + '</span>' +
        (days ? days + '<span class="octo-unit">d</span>' : '') +
        pad(Math.floor(s / 3600)) + ':' + pad(Math.floor((s % 3600) / 60)) + ':' + pad(s % 60)
      k.node.innerHTML = html
    })
  }

  function load() {
    var roots = document.querySelectorAll('[data-octopus]')
    if (!roots.length) return
    fetch(FEED)
      .then(function (r) { return r.ok ? r.json() : null })
      .then(function (feed) {
        if (!feed) return
        roots.forEach(function (root) {
          root.classList.add('octo')
          var kind = root.getAttribute('data-octopus')
          if (kind === 'numbers') renderNumbers(root, feed)
          else if (kind === 'countdowns') renderCountdowns(root, feed)
        })
      })
      .catch(function () { /* leave whatever was there */ })
  }

  injectCss()
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load)
  else load()
  setInterval(load, REFRESH_MS)
  setInterval(tick, 1000)
})()
