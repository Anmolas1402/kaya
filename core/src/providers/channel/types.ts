import type { Checker } from "../../modules/health/index.js";

export type IncomingMessage = Readonly<{ id: string; text: string; receivedAt: Date }>;

export type OutgoingMessage = Readonly<{
  idempotencyKey: string;
  text: string;
  replyTo?: string;
}>;

export type SentMessage = Readonly<{ id: string; sentAt: Date }>;

export type MessageHandler = (message: IncomingMessage) => Promise<void> | void;

export interface ChatChannel extends Checker {
  readonly name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  send(
    message: OutgoingMessage,
    options?: Readonly<{ signal?: AbortSignal }>,
  ): Promise<SentMessage>;
  onMessage(handler: MessageHandler): () => void;
}
