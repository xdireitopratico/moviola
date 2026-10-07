import { expect, test } from "bun:test";
import { publishedRelease } from "./releaseCheck.ts";

test("100 o lançamento enxerga a release publicada", async () => {
  const fetchImpl = async () =>
    new Response(
      JSON.stringify({
        tag_name: "v0.1.0-beta.001",
        assets: [{ name: "Moviola Setup 0.1.0-beta.1.exe" }],
      }),
      { status: 200 },
    );
  const seen = await publishedRelease(fetchImpl);
  expect(seen?.tag).toBe("v0.1.0-beta.001");
  expect(seen?.asset.endsWith(".exe")).toBe(true);
});
