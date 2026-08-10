export function EmptyState() {
  return (
    <div className="empty-state">
      <div className="empty-state__title">No contract changes yet</div>
      <div className="empty-state__body">
        Schema-Watch is running but hasn't seen a shape change since it started. Point your
        frontend at the proxy and keep working normally - nothing shows up here until a field's
        type, presence, or nullability actually shifts.
      </div>
      <div className="empty-state__code">SCHEMA_WATCH_TARGET=http://localhost:3001 npx schema-watch start</div>
    </div>
  );
}
