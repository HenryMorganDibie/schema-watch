// Consumes /api/health, so a change to that contract lands here.
export async function useHealth() {
  const res = await fetch("/api/health");
  const { ok, uptimeSeconds } = await res.json();
  return { healthy: ok.status === "up", uptimeSeconds };
}
