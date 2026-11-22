export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = Readonly<{ role: ChatRole; content: string }>;

export type ModelTier = "routine" | "heavy";

export type CompletionRequest = Readonly<{
  tier: ModelTier;
  messages: readonly ChatMessage[];
  maxTokens?: number;
  temperature?: number;
}>;

export type Usage = Readonly<{ inputTokens: number; outputTokens: number }>;

export type FinishReason = "stop" | "length" | "tool_calls" | "content_filter";

export type Completion = Readonly<{
  text: string;
  model: string;
  finishReason: FinishReason;
  usage: Usage;
}>;

export type CallOptions = Readonly<{ signal?: AbortSignal }>;

export interface LlmProvider {
  readonly name: string;
  complete(request: CompletionRequest, options?: CallOptions): Promise<Completion>;
}
