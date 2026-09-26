import { type Card, makeDeck, rankOf, sortHand, suitOf } from '../../cards/card.ts';
import { Rng } from '../../rng.ts';
import { type GameModule, clone, rankStandings } from '../../types.ts';

export interface CallbreakConfig {
  rounds: number;
  maxBid: number;
}

export interface Play {
  seat: number;
  card: Card;
}

export interface CallbreakState {
  config: CallbreakConfig;
  rng: number;
  round: number;
  dealer: number;
  phase: 'bidding' | 'playing' | 'trickDone' | 'roundDone' | 'over';
  players: { id: string; name: string; isBot: boolean }[];
  hands: Card[][];
  bids: (number | null)[];
  won: number[];
  trick: Play[];
  turn: number;
  lastTrick: { plays: Play[]; winner: number } | null;
  /** Score per round per seat, in tenths (so 3.2 is stored as 32). */
  scores: number[][];
}

export type CallbreakAction = { type: 'bid'; value: number } | { type: 'play'; card: Card };

export interface CallbreakView {
  phase: CallbreakState['phase'];
  round: number;
  rounds: number;
  dealer: number;
  mySeat: number | null;
  players: { id: string; name: string; isBot: boolean; bid: number | null; won: number; cardCount: number; total: number }[];
  hand: Card[];
  trick: Play[];
  lastTrick: CallbreakState['lastTrick'];
  turn: number;
  /** scores[round][seat] as decimals. */
  scores: number[][];
  legal: { bid?: { min: number; max: number }; cards?: Card[] } | null;
}

const TRUMP = 'S';
const SEATS = 4;

export function winningPlay(trick: Play[]): Play {
  let best = trick[0];
  for (const p of trick.slice(1)) {
    const sameSuit = suitOf(p.card) === suitOf(best.card);
    if ((sameSuit && rankOf(p.card) > rankOf(best.card)) || (suitOf(p.card) === TRUMP && suitOf(best.card) !== TRUMP))
      best = p;
  }
  return best;
}

/**
 * Callbreak's forced-play rules: follow suit and beat the table if you can;
 * if void, trump (overtrumping any spade already played) if you can;
 * otherwise play anything.
 */
export function legalCards(hand: Card[], trick: Play[]): Card[] {
  if (trick.length === 0) return hand;
  const led = suitOf(trick[0].card);
  const win = winningPlay(trick).card;
  const follow = hand.filter((c) => suitOf(c) === led);
  if (follow.length) {
    if (suitOf(win) === led) {
      const beat = follow.filter((c) => rankOf(c) > rankOf(win));
      if (beat.length) return beat;
    }
    return follow;
  }
  const trumps = hand.filter((c) => suitOf(c) === TRUMP);
  if (!trumps.length) return hand;
  if (suitOf(win) !== TRUMP) return trumps;
  const over = trumps.filter((c) => rankOf(c) > rankOf(win));
  return over.length ? over : hand;
}

/** Round score in tenths: bid + 0.1 per overtrick when made, -bid when missed. */
export const roundScore = (bid: number, won: number) => (won >= bid ? bid * 10 + (won - bid) : -bid * 10);

function dealRound(s: CallbreakState) {
  const rng = new Rng(s.rng);
  const deck = rng.shuffle(makeDeck());
  s.rng = rng.state;
  s.hands = [0, 1, 2, 3].map((i) => sortHand(deck.slice(i * 13, i * 13 + 13)));
  s.bids = [null, null, null, null];
  s.won = [0, 0, 0, 0];
  s.trick = [];
  s.lastTrick = null;
  s.turn = (s.dealer + 1) % SEATS;
  s.phase = 'bidding';
}

const clampInt = (v: unknown, lo: number, hi: number, dflt: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : dflt;

function seatOf(s: CallbreakState, playerId: string) {
  return s.players.findIndex((p) => p.id === playerId);
}

function legalFor(s: CallbreakState, seat: number): CallbreakView['legal'] {
  if (seat < 0 || seat !== s.turn) return null;
  if (s.phase === 'bidding') return { bid: { min: 1, max: s.config.maxBid } };
  if (s.phase === 'playing') return { cards: legalCards(s.hands[seat], s.trick) };
  return null;
}

/** Rough trick estimate used by bots when bidding. */
export function estimateTricks(hand: Card[]): number {
  let e = 0;
  const bySuit = (suit: string) => hand.filter((c) => suitOf(c) === suit).map(rankOf);
  for (const suit of ['H', 'D', 'C']) {
    const r = bySuit(suit);
    if (r.includes(14)) e += 1;
    if (r.includes(13) && r.length >= 2 && r.length <= 5) e += r.includes(14) ? 0.8 : 0.5;
    if (r.length <= 1) e += 0.3; // shortness lets spades ruff
  }
  const sp = bySuit(TRUMP);
  if (sp.includes(14)) e += 1;
  if (sp.includes(13)) e += sp.length >= 2 ? 1 : 0.4;
  if (sp.includes(12)) e += sp.length >= 3 ? 0.7 : 0.2;
  if (sp.length > 3) e += (sp.length - 3) * 0.8;
  return e;
}

export const callbreak: GameModule<CallbreakState, CallbreakAction, CallbreakView, CallbreakConfig> = {
  id: 'callbreak',
  name: 'Callbreak',
  description: 'Four players, spades are trump. Bid your tricks, then make them — or lose your bid.',
  minPlayers: 4,
  maxPlayers: 4,
  fillWithBots: true,
  defaultConfig: { rounds: 5, maxBid: 8 },

  parseConfig(input) {
    const c = (input ?? {}) as Partial<CallbreakConfig>;
    return {
      rounds: clampInt(c.rounds, 1, 20, this.defaultConfig.rounds),
      maxBid: clampInt(c.maxBid, 1, 13, this.defaultConfig.maxBid),
    };
  },

  buyIn: () => 0,

  setup(players, config, seed) {
    if (players.length !== SEATS) throw new Error('Callbreak needs exactly 4 players');
    const s: CallbreakState = {
      config,
      rng: seed,
      round: 1,
      dealer: new Rng(seed).int(SEATS),
      phase: 'bidding',
      players: players.map((p) => ({ id: p.id, name: p.name, isBot: p.isBot })),
      hands: [],
      bids: [],
      won: [],
      trick: [],
      turn: 0,
      lastTrick: null,
      scores: [],
    };
    dealRound(s);
    return s;
  },

  actors(s) {
    return s.phase === 'bidding' || s.phase === 'playing' ? [s.players[s.turn].id] : [];
  },

  applyAction(state, playerId, action) {
    const seat = seatOf(state, playerId);
    const legal = legalFor(state, seat);
    if (!legal) return { ok: false, error: 'Not your turn' };
    const s = clone(state);

    if (action?.type === 'bid' && legal.bid) {
      const v = action.value;
      if (!Number.isInteger(v) || v < legal.bid.min || v > legal.bid.max)
        return { ok: false, error: `Bid must be ${legal.bid.min}–${legal.bid.max}` };
      s.bids[seat] = v;
      s.turn = (seat + 1) % SEATS;
      if (s.bids.every((b) => b !== null)) {
        s.phase = 'playing';
        s.turn = (s.dealer + 1) % SEATS;
      }
      return { ok: true, state: s };
    }

    if (action?.type === 'play' && legal.cards) {
      if (!legal.cards.includes(action.card)) return { ok: false, error: 'You cannot play that card' };
      s.hands[seat] = s.hands[seat].filter((c) => c !== action.card);
      s.trick.push({ seat, card: action.card });
      if (s.trick.length === SEATS) {
        s.phase = 'trickDone';
        s.lastTrick = { plays: s.trick, winner: winningPlay(s.trick).seat };
      } else {
        s.turn = (seat + 1) % SEATS;
      }
      return { ok: true, state: s };
    }

    return { ok: false, error: 'Invalid action' };
  },

  autoAdvance(s) {
    if (s.phase === 'trickDone') return 1400;
    if (s.phase === 'roundDone') return 6000;
    return null;
  },

  advance(state) {
    const s = clone(state);
    if (s.phase === 'trickDone') {
      const winner = s.lastTrick!.winner;
      s.won[winner]++;
      s.trick = [];
      s.turn = winner;
      if (s.hands[0].length === 0) {
        s.scores.push(s.bids.map((b, i) => roundScore(b!, s.won[i])));
        s.phase = 'roundDone';
      } else {
        s.phase = 'playing';
      }
    } else if (s.phase === 'roundDone') {
      if (s.round >= s.config.rounds) {
        s.phase = 'over';
      } else {
        s.round++;
        s.dealer = (s.dealer + 1) % SEATS;
        dealRound(s);
      }
    }
    return s;
  },

  endEarly(state) {
    return { ...clone(state), phase: 'over' };
  },

  result(s) {
    if (s.phase !== 'over') return null;
    const totals = s.players.map((_, i) => s.scores.reduce((sum, r) => sum + r[i], 0));
    const standings = rankStandings(s.players.map((p, i) => ({ playerId: p.id, score: totals[i] / 10, payout: 0 })));
    const winner = s.players.find((p) => p.id === standings[0].playerId)!;
    return { standings, summary: `${winner.name} wins with ${standings[0].score.toFixed(1)} points` };
  },

  viewFor(s, playerId) {
    const mySeat = playerId ? seatOf(s, playerId) : -1;
    return {
      phase: s.phase,
      round: s.round,
      rounds: s.config.rounds,
      dealer: s.dealer,
      mySeat: mySeat >= 0 ? mySeat : null,
      players: s.players.map((p, i) => ({
        ...p,
        bid: s.bids[i],
        won: s.won[i],
        cardCount: s.hands[i].length,
        total: s.scores.reduce((sum, r) => sum + r[i], 0) / 10,
      })),
      hand: mySeat >= 0 ? s.hands[mySeat] : [],
      trick: s.trick,
      lastTrick: s.lastTrick,
      turn: s.turn,
      scores: s.scores.map((r) => r.map((v) => v / 10)),
      legal: legalFor(s, mySeat),
    };
  },

  botAction(s, playerId) {
    const seat = seatOf(s, playerId);
    const hand = s.hands[seat];
    if (s.phase === 'bidding') {
      return { type: 'bid', value: Math.min(s.config.maxBid, Math.max(1, Math.round(estimateTricks(hand)))) };
    }
    const legal = legalCards(hand, s.trick);
    const low = (cards: Card[]) =>
      [...cards].sort((a, b) => (suitOf(a) === TRUMP ? 1 : 0) - (suitOf(b) === TRUMP ? 1 : 0) || rankOf(a) - rankOf(b))[0];
    const need = s.bids[seat]! - s.won[seat];

    if (s.trick.length === 0) {
      const aces = legal.filter((c) => rankOf(c) === 14 && suitOf(c) !== TRUMP);
      if (need > 0 && aces.length) return { type: 'play', card: aces[0] };
      return { type: 'play', card: low(legal) };
    }
    const winners = legal.filter((c) => winningPlay([...s.trick, { seat, card: c }]).seat === seat);
    if (need > 0 && winners.length) {
      const byRank = [...winners].sort((a, b) => rankOf(a) - rankOf(b));
      const last = s.trick.length === SEATS - 1;
      return { type: 'play', card: last ? byRank[0] : byRank[byRank.length - 1] };
    }
    const losers = legal.filter((c) => !winners.includes(c));
    return { type: 'play', card: low(losers.length ? losers : legal) };
  },

  timeoutAction(s, playerId) {
    return this.botAction(s, playerId, Math.random);
  },
};
