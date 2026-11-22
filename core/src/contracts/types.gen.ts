// Generated from contracts/schemas by core/src/contracts/generate-types.ts. Run `make contracts`; do not edit.

/**
 * Any payload in the gateway ↔ core contract
 */
export type ContractPayload = GatewayEvent | SendRequest;
/**
 * Something that happened in the gateway, sent to core. Core handles each id at most once.
 */
export type GatewayEvent = {
  type: "connection.state" | "message.stored" | "history.synced" | "send.result";
} & (ConnectionStateEvent | MessageStoredEvent | HistorySyncedEvent | SendResultEvent);
/**
 * RFC 3339 time in UTC with an uppercase T and Z, e.g. 2026-11-22T09:30:00Z or 2026-11-22T09:30:00.123Z
 */
export type Timestamp = string;
/**
 * Why this send is allowed. self_chat: Kaya replying in its own chat with DJ, only ever to DJ's own JID. confirmed: DJ said yes to pending action action_id, which must exist, be confirmed and target the same chat.
 */
export type Authorization = SelfChatAuthorization | ConfirmedAuthorization;

export interface ConnectionStateEvent {
  /**
   * Unique per emitted event. It deduplicates redelivery of the same outbox row only; see message.stored for how a repeated WhatsApp message is handled
   */
  id: string;
  version: 1;
  type: "connection.state";
  occurred_at: Timestamp;
  data: ConnectionState;
}
export interface ConnectionState {
  state: "connecting" | "pairing" | "connected" | "disconnected" | "logged_out";
  /**
   * DJ's own JID; present once paired
   */
  own_jid?: string;
  /**
   * Why the state changed, for disconnected and logged_out
   */
  reason?: string;
}
export interface MessageStoredEvent {
  /**
   * Unique per emitted event. It deduplicates redelivery of the same outbox row only; see message.stored for how a repeated WhatsApp message is handled
   */
  id: string;
  version: 1;
  type: "message.stored";
  occurred_at: Timestamp;
  data: MessageStored;
}
/**
 * A message row was inserted or changed. The gateway emits it only when the upsert actually inserted the row or changed it (a redelivered or overlapping copy emits nothing), and the body stays in the database; core reads it by message_id. Core keys command handling on (message_id, change), never on the event id.
 */
export interface MessageStored {
  /**
   * messages.id
   */
  message_id: number;
  /**
   * chats.id
   */
  chat_id: number;
  /**
   * contacts.id of the sender
   */
  sender_id: number;
  /**
   * WhatsApp message id
   */
  wa_id: string;
  from_me: boolean;
  kind:
    | "text"
    | "image"
    | "video"
    | "audio"
    | "voice"
    | "document"
    | "sticker"
    | "location"
    | "contact"
    | "poll"
    | "other";
  source: "live" | "history";
  change: "new" | "edited" | "deleted";
  sent_at: Timestamp;
}
export interface HistorySyncedEvent {
  /**
   * Unique per emitted event. It deduplicates redelivery of the same outbox row only; see message.stored for how a repeated WhatsApp message is handled
   */
  id: string;
  version: 1;
  type: "history.synced";
  occurred_at: Timestamp;
  data: HistorySynced;
}
/**
 * One batch of the history sync was stored
 */
export interface HistorySynced {
  chats: number;
  messages: number;
  /**
   * Percent of the sync WhatsApp reports as done
   */
  progress?: number;
  complete: boolean;
}
export interface SendResultEvent {
  /**
   * Unique per emitted event. It deduplicates redelivery of the same outbox row only; see message.stored for how a repeated WhatsApp message is handled
   */
  id: string;
  version: 1;
  type: "send.result";
  occurred_at: Timestamp;
  data: SendResult;
}
/**
 * What happened to a send request
 */
export interface SendResult {
  /**
   * Lowercase hyphenated UUID; the pattern pins the syntax so every validator agrees
   */
  request_id: string;
  status: "sent" | "failed";
  /**
   * WhatsApp message id
   */
  wa_id?: string;
  error?: ErrorDetail;
}
export interface ErrorDetail {
  code: string;
  message: string;
}
/**
 * A message core asks the gateway to send. The gateway checks the authorization before sending, never sends after expires_at (it reports send.result failed with code expired instead), sends each id at most once, and reports the outcome in a send.result event (see 'How services talk' in docs/ARCHITECTURE.md).
 */
export interface SendRequest {
  /**
   * Lowercase hyphenated UUID; the pattern pins the syntax so every validator agrees
   */
  id: string;
  version: 1;
  created_at: Timestamp;
  expires_at: Timestamp;
  /**
   * A chat Kaya may send to: a person (phone-number or LID JID) or a group. Status, broadcast lists, channels and bots are not allowed.
   */
  to: string;
  authorization: Authorization;
  content: TextContent;
  reply_to?: ReplyTo;
}
export interface SelfChatAuthorization {
  kind: "self_chat";
}
export interface ConfirmedAuthorization {
  kind: "confirmed";
  /**
   * Lowercase hyphenated UUID; the pattern pins the syntax so every validator agrees
   */
  action_id: string;
}
export interface TextContent {
  type: "text";
  /**
   * Must contain a character other than an ASCII space, tab or line break; core trims before building the request
   */
  text: string;
}
/**
 * The message this one quotes
 */
export interface ReplyTo {
  /**
   * WhatsApp message id
   */
  wa_id: string;
  /**
   * Any WhatsApp JID without a device part, as observed from whatsmeow: people (s.whatsapp.net, lid, hosted, hosted.lid), bots, groups, broadcast lists and channels
   */
  sender_jid: string;
}
