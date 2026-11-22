import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createStubTelephony, createTelephony } from "./index.js";

const request = { idempotencyKey: "action-1", to: "+919800000000", brief: "ask about Saturday" };

describe("stub telephony", () => {
  it("never reports that a call happened unless a test scripts it", async () => {
    const telephony = createStubTelephony();
    const call = await telephony.placeCall(request);
    assert.equal(call.status, "failed");
    assert.equal(call.transcript, undefined);
    assert.equal(call.startedAt, undefined);
    assert.deepEqual(await telephony.getCall(call.id), call);
    assert.equal(await telephony.getCall("missing"), undefined);
  });

  it("returns a scripted outcome for tests that need a completed call", async () => {
    const telephony = createStubTelephony({
      outcome: () => ({ status: "completed", transcript: "Saturday 7pm works" }),
    });
    const call = await telephony.placeCall(request);
    assert.equal(call.status, "completed");
    assert.equal(call.transcript, "Saturday 7pm works");
  });

  it("dials a repeated idempotency key only once", async () => {
    const telephony = createStubTelephony();
    const first = await telephony.placeCall(request);
    const retry = await telephony.placeCall(request);
    assert.deepEqual(retry, first);
    assert.equal(telephony.calls.length, 1);
  });

  it("rejects numbers that are not E.164", async () => {
    const telephony = createStubTelephony();
    for (const to of ["9800000000", "+0123456789", "+91 98000 00000", "+91-9800000000", ""]) {
      await assert.rejects(
        telephony.placeCall({ idempotencyKey: `k-${to}`, to, brief: "x" }),
        /E\.164/,
        to,
      );
    }
    assert.equal(telephony.calls.length, 0);
  });

  it("rejects an empty brief or key", async () => {
    const telephony = createStubTelephony();
    await assert.rejects(telephony.placeCall({ ...request, brief: " " }));
    await assert.rejects(telephony.placeCall({ ...request, idempotencyKey: "" }));
  });
});

describe("createTelephony", () => {
  it("builds the provider named in config", () => {
    assert.equal(createTelephony({ provider: "stub" }).name, "stub");
  });
});
