import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { generateContractTypes, generatedTypesPath } from "./generate-types.js";
import { ContractError, createContracts, newSendRequest } from "./index.js";
import { samplesDir } from "./schemas.js";

const contracts = createContracts();

function samples(schema: string, kind: "valid" | "invalid"): [string, string][] {
  const dir = `${samplesDir}${schema}/${kind}/`;
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  assert.ok(files.length > 0, `no samples in ${dir}`);
  return files.map((f) => [f.replace(/\.json$/, ""), readFileSync(`${dir}${f}`, "utf8")]);
}

describe("event contract", () => {
  for (const [name, raw] of samples("event", "valid")) {
    it(`accepts ${name} unchanged`, () => {
      const event = contracts.parseEvent(raw);
      assert.deepEqual(event, JSON.parse(raw));
    });
  }

  for (const [name, raw] of samples("event", "invalid")) {
    it(`rejects ${name}`, () => {
      assert.throws(() => contracts.parseEvent(raw), ContractError);
    });
  }

  it("narrows the data type by the event type", () => {
    const [, raw] = samples("event", "valid").find(([n]) => n === "message-stored-live") ?? [];
    const event = contracts.parseEvent(raw);
    assert.equal(event.type, "message.stored");
    if (event.type === "message.stored") assert.equal(event.data.message_id, 42);
  });

  it("rejects text that is not JSON with a clear problem", () => {
    assert.throws(
      () => contracts.parseEvent("{not json"),
      (err: unknown) => err instanceof ContractError && err.problems[0] === "not JSON",
    );
  });

  it("names the failing field", () => {
    const [, raw] = samples("event", "invalid").find(([n]) => n === "progress-over-100") ?? [];
    assert.throws(
      () => contracts.parseEvent(raw),
      (err: unknown) => err instanceof ContractError && err.message.includes("/data/progress"),
    );
  });
});

describe("send-request contract", () => {
  for (const [name, raw] of samples("send-request", "valid")) {
    it(`accepts ${name} unchanged`, () => {
      assert.deepEqual(contracts.parseSendRequest(raw), JSON.parse(raw));
      assert.deepEqual(contracts.parseSendRequest(Buffer.from(raw)), JSON.parse(raw));
    });
  }

  for (const [name, raw] of samples("send-request", "invalid")) {
    it(`rejects ${name}`, () => {
      assert.throws(() => contracts.parseSendRequest(raw), ContractError);
    });
  }

  it("builds requests that pass the contract, with a trimmed text and an expiry", () => {
    const now = new Date("2026-11-22T09:31:00.000Z");
    const request = newSendRequest(
      "919999999999@s.whatsapp.net",
      "  on my way \n",
      { kind: "confirmed", action_id: "5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d" },
      {
        now,
        ttlMs: 60_000,
        replyTo: { wa_id: "3EB0C767D26B5A7F2A1F", sender_jid: "911111111111@s.whatsapp.net" },
      },
    );
    assert.equal(request.content.text, "on my way");
    assert.equal(request.created_at, "2026-11-22T09:31:00.000Z");
    assert.equal(request.expires_at, "2026-11-22T09:32:00.000Z");
    assert.deepEqual(JSON.parse(contracts.encodeSendRequest(request)), request);
    assert.notEqual(newSendRequest("1@s.whatsapp.net", "x", { kind: "self_chat" }).id, request.id);
  });

  it("refuses to encode a request that breaks the contract", () => {
    for (const to of ["+919999999999", "status@broadcast", "1@newsletter"]) {
      assert.throws(
        () => contracts.encodeSendRequest(newSendRequest(to, "hi", { kind: "self_chat" })),
        ContractError,
        to,
      );
    }
    assert.throws(
      () =>
        contracts.encodeSendRequest(
          newSendRequest("1@s.whatsapp.net", "   ", { kind: "self_chat" }),
        ),
      ContractError,
    );
  });

  it("never puts payload values in its errors", () => {
    const [, raw] =
      samples("send-request", "invalid").find(([n]) => n === "phone-number-not-jid") ?? [];
    assert.throws(
      () => contracts.parseSendRequest(raw),
      (err: unknown) =>
        err instanceof ContractError &&
        err.message.includes("/to") &&
        !err.message.includes("+9199"),
    );
  });
});

describe("generated types", () => {
  it("match the schemas; run `make contracts` after changing a schema", async () => {
    assert.equal(readFileSync(generatedTypesPath, "utf8"), await generateContractTypes());
  });
});
