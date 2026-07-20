/**
 * Resilient fetch wrapper for TxLINE network calls. Adds a timeout, a small
 * number of retries for transient failures, and consistent error messages so
 * production callers do not hang forever on a slow or flaky upstream.
 */

export interface ResilientFetchOptions {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  fetchImpl?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 400;
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUS.has(status);
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Perform a fetch with an abort-based timeout and bounded retries. The caller's
 * own AbortSignal is respected and never overridden. Streaming callers should
 * pass retries=0 because a streamed body cannot be safely replayed.
 */
export async function resilientFetch(
  url: string,
  init: RequestInit,
  options: ResilientFetchOptions = {},
): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = Math.max(0, options.retries ?? DEFAULT_RETRIES);
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const externalSignal = init.signal ?? undefined;
    const onAbort = () => controller.abort();
    if (externalSignal) {
      if (externalSignal.aborted) controller.abort();
      else externalSignal.addEventListener("abort", onAbort, { once: true });
    }

    try {
      const res = await fetchImpl(url, { ...init, signal: controller.signal });
      if (isRetryableStatus(res.status) && attempt < retries) {
        lastError = new Error(`Upstream ${res.status} on ${url}`);
        await delay(retryDelayMs * (attempt + 1));
        continue;
      }
      return res;
    } catch (error) {
      lastError = error;
      if (externalSignal?.aborted) {
        throw new Error(`Request aborted by caller: ${url}`);
      }
      if (attempt < retries) {
        await delay(retryDelayMs * (attempt + 1));
        continue;
      }
    } finally {
      clearTimeout(timer);
      if (externalSignal) externalSignal.removeEventListener("abort", onAbort);
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`TxLINE request failed after ${retries + 1} attempt(s): ${url}. ${detail}`);
}
