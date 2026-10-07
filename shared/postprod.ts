import { buildPostProdRequest, type Session } from "./contract.ts";
import { applyCallback } from "./callback.ts";

export async function callWorker(
  session: Session,
  workerUrl: string | null,
  destPath: string,
  now: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Session> {
  if (!workerUrl) {
    return applyCallback(session, { ok: false, reason: "sem url" }, destPath, now);
  }
  const built = buildPostProdRequest(session, "app://callback");
  if (!built.ok) {
    return applyCallback(session, { ok: false, reason: built.reason }, destPath, now);
  }
  try {
    const response = await fetchImpl(workerUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session, callback: "app://callback" }),
    });
    if (!response.ok) {
      return applyCallback(session, { ok: false, reason: `http ${response.status}` }, destPath, now);
    }
    const type = response.headers.get("content-type") ?? "";
    if (!type.includes("video/mp4")) {
      return applyCallback(session, { ok: false, reason: "resposta sem mp4" }, destPath, now);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    return applyCallback(session, { ok: true, bytes }, destPath, now);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "falha de rede";
    return applyCallback(session, { ok: false, reason }, destPath, now);
  }
}