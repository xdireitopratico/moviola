import { expect, test } from "bun:test";
import { updateFeed } from "./updateConfig.ts";

test("lê dono, repositório e versão sem publicar", () => {
  expect(updateFeed.owner.length).toBeGreaterThan(0);
  expect(updateFeed.repo).toBe("moviola");
  expect(updateFeed.version).toBe("0.1.0-beta.001");
  expect(updateFeed.publish).toBe(false);
});
