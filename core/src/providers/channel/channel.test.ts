import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ChannelNotStartedError, createChannel, createStubChannel } from "./index.js";

describe("stub channel", () => {
  it("records what it sends once started", async () => {
    const channel = createStubChannel();
    await channel.start();
    const sent = await channel.send({ idempotencyKey: "k1", text: "hello DJ" });
    assert.ok(sent.id);
    assert.ok(sent.sentAt instanceof Date);
    assert.deepEqual(channel.sent, [{ idempotencyKey: "k1", text: "hello DJ" }]);
  });

  it("sends a repeated idempotency key only once", async () => {
    const channel = createStubChannel();
    await channel.start();
    const first = await channel.send({ idempotencyKey: "same", text: "hi" });
    const again = await channel.send({ idempotencyKey: "same", text: "hi" });
    assert.deepEqual(again, first);
    assert.equal(channel.sent.length, 1);
  });

  it("refuses to send or receive before start and after stop", async () => {
    const channel = createStubChannel();
    await assert.rejects(channel.send({ idempotencyKey: "k", text: "x" }), ChannelNotStartedError);
    await channel.start();
    await channel.stop();
    await assert.rejects(channel.send({ idempotencyKey: "k", text: "x" }), ChannelNotStartedError);
    await assert.rejects(channel.receive("x"), ChannelNotStartedError);
  });

  it("reports through its health check whether it is started", async () => {
    const channel = createStubChannel();
    await assert.rejects(channel.check(AbortSignal.timeout(100)), ChannelNotStartedError);
    await channel.start();
    await channel.check(AbortSignal.timeout(100));
  });

  it("refuses an empty message or key", async () => {
    const channel = createStubChannel();
    await channel.start();
    await assert.rejects(channel.send({ idempotencyKey: "k", text: "  " }));
    await assert.rejects(channel.send({ idempotencyKey: " ", text: "x" }));
  });

  it("delivers received messages to every handler until it unsubscribes", async () => {
    const channel = createStubChannel();
    await channel.start();
    const seen: string[] = [];
    const off = channel.onMessage((m) => {
      seen.push(`a:${m.text}`);
    });
    channel.onMessage(async (m) => {
      seen.push(`b:${m.text}`);
    });

    await channel.receive("one");
    off();
    await channel.receive("two");
    assert.deepEqual(seen, ["a:one", "b:one", "b:two"]);
  });

  it("still delivers to the other handlers when one fails, then reports every failure", async () => {
    const channel = createStubChannel();
    await channel.start();
    const seen: string[] = [];
    channel.onMessage(() => {
      throw new Error("first broke");
    });
    channel.onMessage((m) => {
      seen.push(m.text);
    });
    channel.onMessage(async () => {
      throw new Error("third broke");
    });

    await assert.rejects(
      channel.receive("x"),
      (err: unknown) => err instanceof AggregateError && err.errors.length === 2,
    );
    assert.deepEqual(seen, ["x"]);
  });
});

describe("createChannel", () => {
  it("builds the channel named in config", () => {
    assert.equal(createChannel({ provider: "stub" }).name, "stub");
  });
});
