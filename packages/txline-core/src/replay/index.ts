import type { OddsSnapshot, ScoreEvent } from "../client/types";
import { eventTimestamp, isMeaningfulFootballEvent, probabilityMove } from "../math/index";

export type ReplayItem =
  | { kind: "score"; at: number; event: ScoreEvent }
  | { kind: "odds"; at: number; before?: OddsSnapshot; after: OddsSnapshot; move: number };

export function buildReplayTimeline(scores: ScoreEvent[], odds: OddsSnapshot[], minOddsMove = 0.06): ReplayItem[] {
  const items: ReplayItem[] = [];
  for (const event of scores) {
    if (isMeaningfulFootballEvent(event)) items.push({ kind: "score", at: eventTimestamp(event), event });
  }
  const sortedOdds = [...odds].sort((a, b) => a.Ts - b.Ts);
  for (let i = 0; i < sortedOdds.length; i += 1) {
    const after = sortedOdds[i];
    if (!after) continue;
    const before = sortedOdds[i - 1];
    const move = before ? probabilityMove(before, after) : 0;
    if (!before || move >= minOddsMove) items.push({ kind: "odds", at: after.Ts, before, after, move });
  }
  return items.sort((a, b) => a.at - b.at);
}

export async function* replayTimeline(items: ReplayItem[], speed = 20): AsyncGenerator<ReplayItem> {
  let previous = items[0]?.at ?? 0;
  for (const item of items) {
    const delta = Math.max(0, item.at - previous);
    const waitMs = Math.min(3000, delta / speed);
    if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
    yield item;
    previous = item.at;
  }
}
