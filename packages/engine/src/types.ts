/**
 * The contract every game mode implements. The server drives games purely
 * through this interface, so adding a mode never requires server changes.
 *
 * Modules are pure: every function takes a state and returns a new one
 * (applyAction/advance clone before mutating). All randomness comes from the
 * seeded RNG stored inside the state, so games are replayable.
 */

export interface PlayerRef {
  id: string;
  name: string;
  isBot: boolean;
  /** Chips brought to the table (the game's buy-in); 0 for games without chips. */
  stack: number;
}

export interface Standing {
  playerId: string;
  /** 1 = winner. Ties share a placement. */
  placement: number;
  /** Game-specific score shown on the results screen. */
  score: number;
  /** Chips returned to the player's account when the game ends. */
  payout: number;
}

export interface GameResult {
  standings: Standing[];
  summary: string;
}

export type ActionResult<S> = { ok: true; state: S } | { ok: false; error: string };

export interface GameModule<S = any, A = any, V = any, C = any> {
  id: string;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  /** When true the room is topped up with bots to maxPlayers at start. */
  fillWithBots?: boolean;
  defaultConfig: C;
  /** Validate and normalise a user-supplied config, falling back to defaults. */
  parseConfig(input: unknown): C;
  /** Chips each human must bring to the table (0 = no chips involved). */
  buyIn(config: C): number;

  setup(players: PlayerRef[], config: C, seed: number): S;
  /** Players who may act right now (several at once is allowed, e.g. blackjack betting). */
  actors(state: S): string[];
  applyAction(state: S, playerId: string, action: A): ActionResult<S>;
  /**
   * If the game is waiting on nobody but should move on by itself (showing a
   * finished trick, dealer drawing, next hand), the delay in ms before
   * `advance` should be called. Null otherwise.
   */
  autoAdvance(state: S): number | null;
  advance(state: S): S;
  /** Stop the game now (host ended it); result() must be non-null afterwards. */
  endEarly(state: S): S;
  result(state: S): GameResult | null;

  /** Per-player redacted view; playerId null = spectator. */
  viewFor(state: S, playerId: string | null): V;
  botAction(state: S, playerId: string, rand: () => number): A;
  /** What to do when a human's turn timer runs out. */
  timeoutAction(state: S, playerId: string): A;
}

/** Utility: deep-clone plain JSON state before mutating it. */
export const clone = <T>(v: T): T => structuredClone(v);

/** Assign placements (ties share) from a score, higher is better. */
export function rankStandings(rows: Omit<Standing, 'placement'>[]): Standing[] {
  const sorted = [...rows].sort((a, b) => b.score - a.score);
  return sorted.map((r) => ({ ...r, placement: 1 + sorted.filter((o) => o.score > r.score).length }));
}
