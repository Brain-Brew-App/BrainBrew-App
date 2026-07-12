/**
 * Route-level loading boundary — renders instantly under the (already-known)
 * admin shell while the page's server data streams in, preserving layout so there
 * is no jump. Beats a whole-page spinner.
 */
export default function Loading() {
  return (
    <>
      <div className="skeleton" style={{ height: 28, width: 220, marginBottom: 6 }} />
      <div className="skeleton" style={{ height: 14, width: 320, marginBottom: 20, opacity: 0.6 }} />
      <div className="grid cards">
        {Array.from({ length: 8 }).map((_, i) => <div key={i} className="card skeleton skeleton-card" />)}
      </div>
    </>
  );
}
