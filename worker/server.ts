import { createServer, type Server } from "node:http";

export function route(method: string, path: string): { status: number; body: Record<string, unknown> } {
  if (method === "POST" && path === "/api/v1/post-production") {
    return { status: 202, body: { accepted: true } };
  }
  return { status: 404, body: { error: "não encontrado" } };
}

export function startPostProd(port: number, hostname = "127.0.0.1"): Promise<Server> {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const result = route(req.method ?? "GET", url.pathname);
    res.writeHead(result.status, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(result.body));
  });
  return new Promise((resolve) => {
    server.listen(port, hostname, () => resolve(server));
  });
}

const invoked = process.argv[1]?.includes("worker/server") ?? false;
if (invoked) {
  const port = Number(process.env.MOVIOLA_POSTPROD_PORT ?? 8085);
  startPostProd(port).then(() => {
    console.log(`MOVIOLA_POSTPROD ${port}`);
  });
}
