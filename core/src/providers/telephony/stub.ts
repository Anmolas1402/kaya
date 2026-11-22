import { randomUUID } from "node:crypto";
import {
  type Call,
  type CallRequest,
  type CallStatus,
  e164,
  type TelephonyProvider,
} from "./types.js";

export type StubTelephony = TelephonyProvider & Readonly<{ calls: readonly CallRequest[] }>;

export type StubCallOutcome = Readonly<{ status: CallStatus; transcript?: string }>;

export type StubTelephonyOptions = Readonly<{
  outcome?: (request: CallRequest) => StubCallOutcome;
}>;

const noCallPlaced: StubCallOutcome = { status: "failed" };

export function createStubTelephony(options: StubTelephonyOptions = {}): StubTelephony {
  const requests: CallRequest[] = [];
  const calls = new Map<string, Call>();
  const byKey = new Map<string, Call>();
  const outcome = options.outcome ?? (() => noCallPlaced);

  return Object.freeze({
    name: "stub",
    calls: requests,
    async placeCall(request: CallRequest, callOptions: Readonly<{ signal?: AbortSignal }> = {}) {
      callOptions.signal?.throwIfAborted();
      if (request.idempotencyKey.trim() === "") throw new Error("idempotency key is empty");
      const earlier = byKey.get(request.idempotencyKey);
      if (earlier) return earlier;
      if (!e164.test(request.to))
        throw new Error("call target must be an E.164 number like +919812345678");
      if (request.brief.trim() === "") throw new Error("call brief is empty");
      requests.push(request);
      const now = new Date();
      const result = outcome(request);
      const call: Call = {
        id: randomUUID(),
        to: request.to,
        status: result.status,
        endedAt: now,
        ...(result.transcript === undefined ? {} : { transcript: result.transcript }),
      };
      calls.set(call.id, call);
      byKey.set(request.idempotencyKey, call);
      return call;
    },
    async getCall(id: string) {
      return calls.get(id);
    },
  });
}
