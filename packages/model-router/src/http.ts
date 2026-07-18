import { ProviderError } from "./types.js";

export type Fetch = typeof globalThis.fetch;

export function mapHttpError(status: number): ProviderError {
  if (status === 401 || status === 403) return new ProviderError("authentication", false);
  if (status === 408) return new ProviderError("timeout", true);
  if (status === 429) return new ProviderError("rate_limited", true);
  if (status >= 500) return new ProviderError("unavailable", true);
  return new ProviderError("invalid_request", false);
}

export async function postStream(
  fetchImpl: Fetch,
  url: string,
  init: RequestInit,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetchImpl(url, init);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ProviderError("timeout", true);
    }
    throw new ProviderError("unavailable", true);
  }
  if (!response.ok) throw mapHttpError(response.status);
  if (!response.body) throw new ProviderError("invalid_response", false);
  return response;
}

const MAX_SSE_EVENT_CHARS = 1_000_000;

/** Parses SSE data payloads while ignoring comments and unknown event fields. */
export async function* readSseJson(response: Response): AsyncGenerator<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new ProviderError("invalid_response", false);

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done }).replaceAll("\r\n", "\n");
    if (buffer.length > MAX_SSE_EVENT_CHARS) {
      throw new ProviderError("invalid_response", false);
    }

    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = block
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (data && data !== "[DONE]") {
        try {
          yield JSON.parse(data) as unknown;
        } catch {
          throw new ProviderError("invalid_response", false);
        }
      }
      boundary = buffer.indexOf("\n\n");
    }

    if (done) break;
  }

  if (buffer.trim()) throw new ProviderError("invalid_response", false);
}
