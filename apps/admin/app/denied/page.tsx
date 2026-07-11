export const dynamic = 'force-dynamic';

export default function DeniedPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <div className="card" style={{ maxWidth: 420, textAlign: 'center' }}>
        <h1>Access denied</h1>
        <p className="muted">Your admin role does not have permission for this area. This access
          attempt is recorded. If you believe this is a mistake, contact the Founder.</p>
        <a href="/">← Back to Overview</a>
      </div>
    </div>
  );
}
