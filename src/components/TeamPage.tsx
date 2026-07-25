import { CONTACTS } from '../hubData'

export function TeamPage() {
  return (
    <main className="hub-page hub-page-inner" aria-label="Team contacts">
      <header className="hub-page-head">
        <p className="hub-eyebrow">Who to ping</p>
        <h2 className="hub-page-title">Team</h2>
        <p className="hub-page-lede">
          Roster for pad days, reviews, and logistics.
        </p>
      </header>

      <section className="hub-section">
        <ul className="hub-contact-list">
          {CONTACTS.map((contact) => (
            <li key={contact.id} className="hub-contact">
              <div className="hub-contact-main">
                <strong>{contact.name}</strong>
                <span className="hub-contact-role">{contact.role}</span>
              </div>
              <div className="hub-contact-links">
                <a href={`mailto:${contact.email}`}>{contact.email}</a>
                {contact.phone ? (
                  <a href={`tel:${contact.phone}`}>{contact.phone}</a>
                ) : null}
              </div>
              {contact.notes ? (
                <p className="hub-contact-notes">{contact.notes}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
