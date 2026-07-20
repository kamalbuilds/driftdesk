export type ProductHistoryKind = "clutch" | "varifiable" | "driftdesk" | "proofcast";

export interface ProductHistoryItem {
  id: string;
  product: ProductHistoryKind;
  title: string;
  body: string;
  timestamp: number;
  source: "live" | "sample" | "replay" | "derived";
  proofEndpoint?: string;
  status: "open" | "locked" | "settled" | "verified" | "backtest" | "receipt";
  meta: Record<string, string | number | boolean | null>;
}

export function sortHistory(items: ProductHistoryItem[]): ProductHistoryItem[] {
  return [...items].sort((a, b) => b.timestamp - a.timestamp || a.id.localeCompare(b.id));
}
