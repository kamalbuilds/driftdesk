export interface GuestSession {
  token: string;
}

export interface TxLineCredentials {
  jwt: string;
  apiToken: string;
}

export interface Fixture {
  Ts?: number;
  StartTime?: number;
  Competition?: string;
  CompetitionId?: number;
  FixtureGroupId?: number;
  Participant1?: string;
  Participant2?: string;
  FixtureId: number;
  Participant1IsHome?: boolean;
}

export interface OddsSnapshot {
  FixtureId: number;
  MessageId?: string;
  Ts: number;
  Bookmaker?: string;
  BookmakerId?: number;
  SuperOddsType?: string;
  InRunning?: boolean;
  GameState?: string;
  MarketParameters?: string;
  MarketPeriod?: string;
  PriceNames?: string[];
  Prices?: number[];
  Pct?: string[];
}

export interface ScoreEvent {
  fixtureId?: number;
  FixtureId?: number;
  gameState?: string;
  GameState?: string;
  action?: string;
  Action?: string;
  id?: string | number;
  ts?: number;
  Ts?: number;
  seq?: number;
  Seq?: number;
  confirmed?: boolean;
  [key: string]: unknown;
}

export interface ActivationInput {
  txSig: string;
  walletSignature: string;
  leagues?: number[];
}

export interface SseMessage<T> {
  id?: string;
  event?: string;
  data: T;
}
