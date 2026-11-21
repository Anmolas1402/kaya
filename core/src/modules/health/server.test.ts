import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, it } from "node:test";
import { checkHealth, startHealthServer } from "./server.js";

describe("health server", () => {
  it("answers GET /health with ok", async () => {
    const server = await startHealthServer("127.0.0.1", 0);
    try {
      const res = await fetch(`http://127.0.0.1:${server.port}/health`);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("content-type"), "application/json");
      assert.deepEqual(await res.json(), { status: "ok" });
    } finally {
      await server.close();
    }
  });

  it("ignores the query string", async () => {
    const server = await startHealthServer("127.0.0.1", 0);
    try {
      await checkHealth(`http://127.0.0.1:${server.port}/health?probe=1`);
    } finally {
      await server.close();
    }
  });

  it("returns 404 for other paths and 405 for other methods", async () => {
    const server = await startHealthServer("127.0.0.1", 0);
    try {
      const base = `http://127.0.0.1:${server.port}`;
      assert.equal((await fetch(`${base}/nope`)).status, 404);
      const post = await fetch(`${base}/health`, { method: "POST" });
      assert.equal(post.status, 405);
      assert.equal(post.headers.get("allow"), "GET, HEAD");
    } finally {
      await server.close();
    }
  });

  it("stops answering after close", async () => {
    const server = await startHealthServer("127.0.0.1", 0);
    const url = `http://127.0.0.1:${server.port}/health`;
    await checkHealth(url);
    await server.close();
    await assert.rejects(checkHealth(url));
  });

  it("rejects when the port is taken", async () => {
    const server = await startHealthServer("127.0.0.1", 0);
    try {
      await assert.rejects(startHealthServer("127.0.0.1", server.port), { code: "EADDRINUSE" });
    } finally {
      await server.close();
    }
  });
});

describe("checkHealth", () => {
  it("fails on a non-200 answer", async () => {
    const other = createServer((_req, res) => res.writeHead(503).end());
    await new Promise<void>((resolve) => other.listen(0, "127.0.0.1", resolve));
    const { port } = other.address() as AddressInfo;
    try {
      await assert.rejects(checkHealth(`http://127.0.0.1:${port}/health`), /answered 503/);
    } finally {
      await new Promise((resolve) => other.close(resolve));
    }
  });
});
