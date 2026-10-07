import { expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const banned = ["publicar", "compartilhar", "instagram", "tiktok", "youtube", "linkedin"];

async function files(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const found: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await files(path)));
    else if (/\.(html|js|css)$/.test(entry.name)) found.push(path);
  }
  return found;
}

test("093 a tela não tem ação de publicar", async () => {
  const root = new URL("../app", import.meta.url).pathname;
  const list = await files(root);
  expect(list.length).toBeGreaterThan(0);
  const hits: string[] = [];
  for (const file of list) {
    const text = (await readFile(file, "utf8")).toLowerCase();
    for (const word of banned) {
      if (text.includes(word)) hits.push(file + ":" + word);
    }
  }
  expect(hits).toEqual([]);
});
