import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export type HealthServer = Readonly<{
  port: number;
  close(graceMs?: number): Promise<void>;
}>;

function handle(req: IncomingMessage, res: ServerResponse): void {
  const path = new URL(req.url ?? "/", "http://localhost").pathname;
  if (path !== "/health") {
    res.writeHead(404).end();
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { allow: "GET, HEAD" }).end();
    return;
  }
  res
    .writeHead(200, { "content-type": "application/json" })
    .end(`${JSON.stringify({ status: "ok" })}\n`);
}

export async function startHealthServer(host: string, port: number): Promise<HealthServer> {
  const server = createServer(handle);
  server.headersTimeout = 5_000;
  server.requestTimeout = 10_000;
  server.keepAliveTimeout = 5_000;

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  return Object.freeze({
    port: (server.address() as AddressInfo).port,
    close: (graceMs = 10_000) =>
      new Promise<void>((resolve, reject) => {
        const force = setTimeout(() => server.closeAllConnections(), graceMs);
        force.unref();
        server.close((error) => {
          clearTimeout(force);
          if (error) reject(error);
          else resolve();
        });
        server.closeIdleConnections();
      }),
  });
}

export async function checkHealth(url: string, timeoutMs = 3_000): Promise<void> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  await res.body?.cancel();
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
}
