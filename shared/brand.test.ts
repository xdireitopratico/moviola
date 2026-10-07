import { expect, test } from "bun:test";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, basename } from "node:path";

const forbidden = ["Direito", "Prático"].join(" ");

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir);
  const files: string[] = [];
  for (const name of entries) {
    if (name === "node_modules" || name === ".git" || name === "app" || name === "docs") continue;
    const path = join(dir, name);
    const info = await stat(path);
    if (info.isDirectory()) files.push(...(await walk(path)));
    else if (/\.(ts|js|json|cjs|html|css)$/.test(name) && basename(path) !== "brand.test.ts") files.push(path);
  }
  return files;
}

test("081 busca no código não acha a marca antiga", async () => {
  const rootDir = new URL("..", import.meta.url).pathname;
  const files = await walk(rootDir);
  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    const text = await readFile(file, "utf8");
    expect(text.includes(forbidden)).toBe(false);
  }
});
