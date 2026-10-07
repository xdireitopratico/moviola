import { expect, test } from "bun:test";

test("053 script percorre tema sessão cenas clipes mp4 e exportação", async () => {
  const proc = Bun.spawn(["bun", "scripts/e2e-053.ts"], {
    cwd: new URL("..", import.meta.url).pathname,
    stdout: "pipe",
    stderr: "pipe",
  });
  const code = await proc.exited;
  const out = await new Response(proc.stdout).text();
  const err = await new Response(proc.stderr).text();
  expect(code).toBe(0);
  expect(out).toContain("E2E_053_OK");
  expect(err).not.toContain("E2E_053_FAIL");
});
