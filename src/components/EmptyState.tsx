/** Sparse branded empty / zero-result state for list panels. */
export function EmptyState({
  title,
  detail,
}: {
  title: string
  detail?: string
}) {
  return (
    <div className="simple-empty">
      <strong>{title}</strong>
      {detail ? <p>{detail}</p> : null}
    </div>
  )
}
