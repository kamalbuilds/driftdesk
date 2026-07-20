import { resolveNetwork, type Network, type NetworkConfig } from "../config";
import type { ActivationInput, Fixture, GuestSession, OddsSnapshot, ScoreEvent, SseMessage, TxLineCredentials } from "./types";
import { resilientFetch } from "./http";

export interface TxLineClientOptions {
  network?: Network;
  jwt?: string;
  apiToken?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  retries?: number;
}

export class TxLineClient {
  readonly config: NetworkConfig;
  private jwt?: string;
  private apiToken?: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs?: number;
  private readonly retries?: number;

  constructor(options: TxLineClientOptions = {}) {
    this.config = resolveNetwork(options.network);
    this.jwt = options.jwt;
    this.apiToken = options.apiToken;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs;
    this.retries = options.retries;
  }

  get credentials(): Partial<TxLineCredentials> {
    return { jwt: this.jwt, apiToken: this.apiToken };
  }

  async startGuestSession(): Promise<GuestSession> {
    const res = await resilientFetch(
      this.config.guestAuthUrl,
      { method: "POST" },
      { fetchImpl: this.fetchImpl, timeoutMs: this.timeoutMs, retries: this.retries },
    );
    if (!res.ok) throw new Error(`Guest session failed: ${res.status} ${await res.text()}`);
    const body = (await res.json()) as GuestSession;
    if (!body.token) throw new Error("Guest session response missing token");
    this.jwt = body.token;
    return body;
  }

  async activate(input: ActivationInput): Promise<string> {
    const jwt = this.requireJwt();
    const res = await resilientFetch(
      `${this.config.apiBaseUrl}/token/activate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ txSig: input.txSig, walletSignature: input.walletSignature, leagues: input.leagues ?? [] }),
      },
      { fetchImpl: this.fetchImpl, timeoutMs: this.timeoutMs, retries: 0 },
    );
    const text = await res.text();
    if (!res.ok) throw new Error(`Token activation failed: ${res.status} ${text}`);
    let token = text;
    try {
      const json = JSON.parse(text) as { token?: string };
      token = json.token ?? text;
    } catch {
      // Text/plain token is valid per docs.
    }
    token = token.replace(/^"|"$/g, "").trim();
    if (!token) throw new Error("Activation response missing API token");
    this.apiToken = token;
    return token;
  }

  async fixturesSnapshot(params: { startEpochDay?: number; competitionId?: number } = {}): Promise<Fixture[]> {
    const query = new URLSearchParams();
    if (params.startEpochDay !== undefined) query.set("startEpochDay", String(params.startEpochDay));
    if (params.competitionId !== undefined) query.set("competitionId", String(params.competitionId));
    return this.getJson<Fixture[]>(`/fixtures/snapshot${query.size ? `?${query}` : ""}`);
  }

  async oddsSnapshot(fixtureId: number, asOf?: number): Promise<OddsSnapshot[]> {
    const query = new URLSearchParams();
    if (asOf !== undefined) query.set("asOf", String(asOf));
    return this.getJson<OddsSnapshot[]>(`/odds/snapshot/${fixtureId}${query.size ? `?${query}` : ""}`);
  }

  async oddsUpdates(fixtureId: number): Promise<OddsSnapshot[]> {
    return this.getJson<OddsSnapshot[]>(`/odds/updates/${fixtureId}`);
  }

  async oddsIntervalUpdates(params: { epochDay: number; hourOfDay: number; interval: number }): Promise<OddsSnapshot[]> {
    return this.getJson<OddsSnapshot[]>(`/odds/updates/${params.epochDay}/${params.hourOfDay}/${params.interval}`);
  }

  async oddsValidation(params: { messageId: string; ts: number }): Promise<unknown> {
    const query = new URLSearchParams({ messageId: params.messageId, ts: String(params.ts) });
    return this.getJson<unknown>(`/odds/validation?${query}`);
  }

  async scoreSnapshot(fixtureId: number): Promise<ScoreEvent[]> {
    return this.getJson<ScoreEvent[]>(`/scores/snapshot/${fixtureId}`);
  }

  async scoreHistorical(fixtureId: number): Promise<ScoreEvent[]> {
    return this.getJson<ScoreEvent[]>(`/scores/historical/${fixtureId}`);
  }

  async scoreUpdates(fixtureId: number): Promise<ScoreEvent[]> {
    return this.getJson<ScoreEvent[]>(`/scores/updates/${fixtureId}`);
  }

  async scoreIntervalUpdates(params: { epochDay: number; hourOfDay: number; interval: number }): Promise<ScoreEvent[]> {
    return this.getJson<ScoreEvent[]>(`/scores/updates/${params.epochDay}/${params.hourOfDay}/${params.interval}`);
  }

  async statValidation(params: { fixtureId: number; seq: number; statKey?: number; statKeys?: number[] }): Promise<unknown> {
    const query = new URLSearchParams({ fixtureId: String(params.fixtureId), seq: String(params.seq) });
    if (params.statKey !== undefined) query.set("statKey", String(params.statKey));
    if (params.statKeys?.length) query.set("statKeys", params.statKeys.join(","));
    return this.getJson<unknown>(`/scores/stat-validation?${query}`);
  }

  async statValidationV3(params: { fixtureId: number; seq: number; statKeys: number[] }): Promise<unknown> {
    if (!params.statKeys.length || params.statKeys.length > 5) {
      throw new Error("statValidationV3 requires between 1 and 5 stat keys.");
    }
    const query = new URLSearchParams({
      fixtureId: String(params.fixtureId),
      seq: String(params.seq),
      statKeys: params.statKeys.join(","),
    });
    return this.getJson<unknown>(`/scores/stat-validation-v3?${query}`);
  }

  async fixtureValidation(params: { fixtureId: number; ts?: number }): Promise<unknown> {
    const query = new URLSearchParams({ fixtureId: String(params.fixtureId) });
    if (params.ts !== undefined) query.set("ts", String(params.ts));
    return this.getJson<unknown>(`/fixtures/validation?${query}`);
  }

  async fixtureBatchValidation(params: { epochDay: number; hourOfDay: number }): Promise<unknown> {
    const query = new URLSearchParams({ epochDay: String(params.epochDay), hourOfDay: String(params.hourOfDay) });
    return this.getJson<unknown>(`/fixtures/batch-validation?${query}`);
  }

  async *scoreStream(fixtureId?: number, signal?: AbortSignal): AsyncGenerator<SseMessage<ScoreEvent>> {
    const query = new URLSearchParams();
    if (fixtureId !== undefined) query.set("fixtureId", String(fixtureId));
    yield* this.stream<ScoreEvent>(`/scores/stream${query.size ? `?${query}` : ""}`, signal);
  }

  async *oddsStream(fixtureId?: number, signal?: AbortSignal): AsyncGenerator<SseMessage<OddsSnapshot>> {
    const query = new URLSearchParams();
    if (fixtureId !== undefined) query.set("fixtureId", String(fixtureId));
    yield* this.stream<OddsSnapshot>(`/odds/stream${query.size ? `?${query}` : ""}`, signal);
  }

  private async getJson<T>(path: string): Promise<T> {
    const res = await resilientFetch(
      `${this.config.apiBaseUrl}${path}`,
      { headers: this.authHeaders() },
      { fetchImpl: this.fetchImpl, timeoutMs: this.timeoutMs, retries: this.retries },
    );
    const text = await res.text();
    if (!res.ok) throw new Error(`TxLINE ${path} failed: ${res.status} ${text}`);
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`TxLINE ${path} returned invalid JSON: ${text.slice(0, 200)}`);
    }
  }

  private authHeaders(): HeadersInit {
    const jwt = this.requireJwt();
    const apiToken = this.apiToken ?? process.env.TXLINE_API_TOKEN;
    if (!apiToken) throw new Error("Missing TxLINE API token. Run core:activate or set TXLINE_API_TOKEN.");
    return { Authorization: `Bearer ${jwt}`, "X-Api-Token": apiToken };
  }

  private requireJwt(): string {
    const jwt = this.jwt ?? process.env.TXLINE_JWT;
    if (!jwt) throw new Error("Missing TxLINE JWT. Start guest session or set TXLINE_JWT.");
    return jwt;
  }

  private async *stream<T>(path: string, signal?: AbortSignal): AsyncGenerator<SseMessage<T>> {
    const res = await this.fetchImpl(`${this.config.apiBaseUrl}${path}`, {
      headers: { ...this.authHeaders(), Accept: "text/event-stream" },
      signal,
    });
    if (!res.ok || !res.body) throw new Error(`TxLINE stream ${path} failed: ${res.status} ${await res.text()}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) >= 0) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const msg = parseSse<T>(raw);
        if (msg) yield msg;
      }
    }
  }
}

export function parseSse<T>(raw: string): SseMessage<T> | null {
  const lines = raw.split(/\r?\n/);
  let id: string | undefined;
  let event: string | undefined;
  const data: string[] = [];
  for (const line of lines) {
    if (!line || line.startsWith(":")) continue;
    const [field, ...rest] = line.split(":");
    const value = rest.join(":").trimStart();
    if (field === "id") id = value;
    if (field === "event") event = value;
    if (field === "data") data.push(value);
  }
  if (!data.length) return null;
  const joined = data.join("\n");
  try {
    return { id, event, data: JSON.parse(joined) as T };
  } catch {
    return { id, event, data: joined as T };
  }
}
