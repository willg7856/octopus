import { CONTACTS, contactIsReady } from '../hubData'

export function TeamPage() {
  const sorted = [...CONTACTS].sort(
    (a, b) => (a.escalateOrder ?? 99) - (b.escalateOrder ?? 99),
  )
  const missing = sorted.filter((c) => !contactIsReady(c)).length

  return (
    <main className="hub-page hub-page-inner" aria-label="Team contacts">
      <header className="hub-page-head">
        <h2 className="hub-page-title">Team</h2>
        <p className="hub-page-lede">
          Who to contact for pad days, reviews, and incidents.
        </p>
      </header>

      {missing > 0 ? (
        <p className="hub-banner" data-level="warn">
          {missing} contacts still need a name and email.
        </p>
      ) : null}

      <section className="hub-section">
        <ul className="team-list">
          {sorted.map((contact) => {
            const ready = contactIsReady(contact)
            return (
              <li
                key={contact.id}
                className="team-item"
                data-ready={ready ? 'true' : 'false'}
              >
                <div className="team-item-main">
                  <strong>{contact.name || 'Name needed'}</strong>
                  <span className="team-item-role">{contact.role}</span>
                </div>
                <div className="team-item-links">
                  {contact.email ? (
                    <a href={`mailto:${contact.email}`}>{contact.email}</a>
                  ) : (
                    <span className="team-missing">Email needed</span>
                  )}
                  {contact.phone ? (
                    <a href={`tel:${contact.phone}`}>{contact.phone}</a>
                  ) : (
                    <span className="team-missing">Phone optional</span>
                  )}
                  {contact.chat ? <span>{contact.chat}</span> : null}
                </div>
                {contact.notes ? (
                  <p className="team-item-notes">{contact.notes}</p>
                ) : null}
              </li>
            )
          })}
        </ul>
      </section>
    </main>
  )
}
