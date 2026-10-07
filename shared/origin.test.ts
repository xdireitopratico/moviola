import { expect, test } from "bun:test";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, basename } from "node:path";

const forbidden = ["video-", "engineer"].join("");

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir);
  const files: string[] = [];
  for (const name of entries) {
    if (name === "node_modules" || name === ".git" || name === "release") continue;
    const path = join(dir, name);
    const info = await stat(path);
    if (info.isDirectory()) files.push(...(await walk(path)));
    else if (/\.(ts|js|json|cjs|html|css|md)$/.test(name) && basename(path) !== "origin.test.ts") files.push(path);
  }
  return files;
}

test("096 busca não acha cópia nem import do clone antigo", async () => {
  const rootDir = new URL("..", import.meta.url).pathname;
  const files = await walk(rootDir);
  expect(files.length).toBeGreaterThan(0);
  const hits: string[] = [];
  for (const file of files) {
    const text = await readFile(file, "utf8");
    if (text.includes(forbidden)) hits.push(file);
  }
  expect(hits).toEqual([]);
});
