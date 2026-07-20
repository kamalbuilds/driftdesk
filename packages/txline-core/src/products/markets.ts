import type { Fixture } from "../client/types";
import { makeFixtureLabel } from "./proofcast";
import { defaultPropMarkets, resolveMarketWithStats, type PropMarket, type ProvenSettlement, type StatValidationResponse } from "./varifiable";

export type MarketStatus = "open" | "settled";
export type Side = "yes" | "no";

export interface Position {
  id: string;
  userId: string;
  userName: string;
  marketId: string;
  side: Side;
  stake: number;
}

export interface MarketBook {
  id: string;
  fixtureId: number;
  fixtureLabel: string;
  label: string;
  status: MarketStatus;
  prop: PropMarket;
  positions: Position[];
  settlement?: ProvenSettlement;
}

export interface Payout {
  userId: string;
  userName: string;
  marketId: string;
  side: Side;
  stake: number;
  won: boolean;
  payout: number;
}

export function createMarketBook(fixture: Fixture): MarketBook[] {
  return defaultPropMarkets(fixture).map((prop) => ({
    id: prop.id,
    fixtureId: fixture.FixtureId,
    fixtureLabel: makeFixtureLabel(fixture),
    label: prop.label,
    status: "open",
    prop,
    positions: [],
  }));
}

export function placePosition(book: MarketBook, input: Omit<Position, "id" | "marketId">): Position {
  if (book.status !== "open") throw new Error("Market is not open.");
  if (!Number.isFinite(input.stake) || input.stake <= 0) throw new Error("Stake must be positive.");
  const position: Position = {
    id: `${book.id}-${input.userId}-${book.positions.length + 1}`,
    marketId: book.id,
    ...input,
  };
  book.positions.push(position);
  return position;
}

export function poolTotals(book: MarketBook): Record<Side, number> {
  return book.positions.reduce<Record<Side, number>>(
    (totals, position) => {
      totals[position.side] += position.stake;
      return totals;
    },
    { yes: 0, no: 0 },
  );
}

export function settleMarketBook(book: MarketBook, validation: StatValidationResponse): { book: MarketBook; payouts: Payout[] } {
  const settlement = resolveMarketWithStats(book.prop, validation);
  if (settlement.outcome === "pending") throw new Error("Market settlement is still pending.");
  const settled: MarketBook = { ...book, status: "settled", settlement };
  const totals = poolTotals(book);
  const winningPool = totals[settlement.outcome];
  const losingPool = settlement.outcome === "yes" ? totals.no : totals.yes;
  const payouts = book.positions.map((position) => {
    const won = position.side === settlement.outcome;
    const share = won && winningPool > 0 ? position.stake / winningPool : 0;
    return {
      userId: position.userId,
      userName: position.userName,
      marketId: book.id,
      side: position.side,
      stake: position.stake,
      won,
      payout: won ? Number((position.stake + losingPool * share).toFixed(3)) : 0,
    };
  });
  return { book: settled, payouts };
}

export function demoMarketBooks(fixture: Fixture): MarketBook[] {
  const books = createMarketBook(fixture);
  for (const book of books) {
    placePosition(book, { userId: "u1", userName: "Kamal", side: "yes", stake: 10 });
    placePosition(book, { userId: "u2", userName: "Mina", side: "no", stake: 8 });
    placePosition(book, { userId: "u3", userName: "Leo", side: "yes", stake: 5 });
  }
  return books;
}
