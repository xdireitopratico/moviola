import { updateFeed } from "./updateConfig.ts";

export async function publishedRelease(
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response> = fetch,
): Promise<{ tag: string; asset: string } | null> {
  const tag = `v${updateFeed.version}`;
  const url = `https://api.github.com/repos/${updateFeed.owner}/${updateFeed.repo}/releases/tags/${tag}`;
  const response = await fetchImpl(url, {
    headers: { accept: "application/vnd.github+json", "user-agent": "moviola" },
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { tag_name?: string; assets?: { name?: string }[] };
  const asset = body.assets?.find((item) => typeof item.name === "string" && item.name.endsWith(".exe"))?.name;
  if (body.tag_name !== tag || !asset) return null;
  return { tag: body.tag_name, asset };
}
