import { expect, test } from "bun:test";
import { route, startPostProd } from "./server.ts";

test("042 POST /api/v1/post-production responde na porta", async () => {
  expect(route("POST", "/api/v1/post-production").status).toBe(202);
  const server = await startPostProd(0);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("porta");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/post-production`, { method: "POST" });
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ accepted: true });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
