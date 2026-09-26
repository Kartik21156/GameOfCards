import { type Card, makeDeck, rankOf } from '../../cards/card.ts';
import { Rng } from '../../rng.ts';
import { type GameModule, type PlayerRef, clone, rankStandings } from '../../types.ts';

export interface BlackjackConfig {
  rounds: number;
  minBet: number;
  maxBet: number;
  buyIn: number;
  decks: number;
}

export type Outcome = 'win' | 'lose' | 'push' | 'blackjack' | 'bust';

export interface BJHand {
  cards: Card[];
  bet: number;
  done: boolean;
  doubled: boolean;
  fromSplit: boolean;
  outcome?: Outcome;
  payout?: number;
}

export interface BJPlayer {
  id: string;
  name: string;
  isBot: boolean;
  stack: number;
  /** Bet placed this round, null while still deciding. */
  bet: number | null;
  hands: BJHand[];
  active: number;
  sittingOut: boolean;
}

export interface BlackjackState {
  config: BlackjackConfig;
  rng: number;
  round: number;
  phase: 'betting' | 'playing' | 'dealer' | 'settled' | 'over';
  shoe: Card[];
  dealer: Card[];
  players: BJPlayer[];
  turn: number | null;
  buyIn: number;
}

export type BlackjackAction =
  | { type: 'bet'; amount: number }
  | { type: 'hit' }
  | { type: 'stand' }
  | { type: 'double' }
  | { type: 'split' };

export interface BlackjackLegal {
  bet?: { min: number; max: number };
  hit?: boolean;
  stand?: boolean;
  double?: boolean;
  split?: boolean;
}

export interface BlackjackView {
  phase: BlackjackState['phase'];
  round: number;
  rounds: number;
  minBet: number;
  maxBet: number;
  shoeLeft: number;
  dealer: { cards: (Card | null)[]; total: number | null };
  players: (Omit<BJPlayer, 'hands'> & {
    hands: (BJHand & { total: number; soft: boolean })[];
  })[];
  turn: string | null;
  legal: BlackjackLegal | null;
}

const cardValue = (c: Card) => {
  const r = rankOf(c);
  return r === 14 ? 11 : Math.min(r, 10);
};

export function handValue(cards: Card[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += cardValue(c);
    if (rankOf(c) === 14) aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

const isBlackjack = (h: { cards: Card[]; fromSplit?: boolean }) =>
  h.cards.length === 2 && !h.fromSplit && handValue(h.cards).total === 21;

function draw(s: BlackjackState): Card {
  if (s.shoe.length === 0) {
    const rng = new Rng(s.rng);
    s.shoe = rng.shuffle(makeDeck(s.config.decks));
    s.rng = rng.state;
  }
  return s.shoe.pop()!;
}

const clampInt = (v: unknown, lo: number, hi: number, dflt: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : dflt;

function startRound(s: BlackjackState) {
  s.phase = 'betting';
  s.dealer = [];
  s.turn = null;
  if (s.shoe.length < s.config.decks * 52 * 0.25) {
    const rng = new Rng(s.rng);
    s.shoe = rng.shuffle(makeDeck(s.config.decks));
    s.rng = rng.state;
  }
  for (const p of s.players) {
    p.bet = null;
    p.hands = [];
    p.active = 0;
    p.sittingOut = p.stack < s.config.minBet;
  }
  if (s.players.every((p) => p.sittingOut)) s.phase = 'over';
}

function deal(s: BlackjackState) {
  for (const p of s.players) {
    if (p.sittingOut) continue;
    p.hands = [{ cards: [draw(s), draw(s)], bet: p.bet!, done: false, doubled: false, fromSplit: false }];
    if (isBlackjack(p.hands[0])) p.hands[0].done = true;
  }
  s.dealer = [draw(s), draw(s)];
  s.phase = 'playing';
  if (isBlackjack({ cards: s.dealer })) {
    // Dealer peeks: round is over immediately.
    s.phase = 'dealer';
    return;
  }
  s.turn = -1;
  moveTurn(s);
}

/** Move to the next unfinished hand, or to the dealer when none remain. */
function moveTurn(s: BlackjackState) {
  if (s.turn !== null && s.turn >= 0) {
    const p = s.players[s.turn];
    while (p.active < p.hands.length && p.hands[p.active].done) p.active++;
    if (p.active < p.hands.length) return;
  }
  for (let i = (s.turn ?? -1) + 1; i < s.players.length; i++) {
    const p = s.players[i];
    p.active = p.hands.findIndex((h) => !h.done);
    if (p.active >= 0) {
      s.turn = i;
      return;
    }
    p.active = 0;
  }
  s.turn = null;
  s.phase = 'dealer';
}

function settle(s: BlackjackState) {
  const dealer = handValue(s.dealer).total;
  const dealerBJ = isBlackjack({ cards: s.dealer });
  for (const p of s.players)
    for (const h of p.hands) {
      const v = handValue(h.cards).total;
      let outcome: Outcome;
      if (v > 21) outcome = 'bust';
      else if (isBlackjack(h) && !dealerBJ) outcome = 'blackjack';
      else if (dealerBJ) outcome = isBlackjack(h) ? 'push' : 'lose';
      else if (dealer > 21 || v > dealer) outcome = 'win';
      else if (v === dealer) outcome = 'push';
      else outcome = 'lose';
      const payout =
        outcome === 'blackjack' ? h.bet + Math.floor(h.bet * 1.5)
        : outcome === 'win' ? h.bet * 2
        : outcome === 'push' ? h.bet
        : 0;
      h.outcome = outcome;
      h.payout = payout;
      p.stack += payout;
    }
  s.phase = 'settled';
}

function legalFor(s: BlackjackState, playerId: string): BlackjackLegal | null {
  const idx = s.players.findIndex((p) => p.id === playerId);
  if (idx < 0) return null;
  const p = s.players[idx];
  if (s.phase === 'betting' && !p.sittingOut && p.bet === null)
    return { bet: { min: s.config.minBet, max: Math.min(s.config.maxBet, p.stack) } };
  if (s.phase !== 'playing' || s.turn !== idx) return null;
  const h = p.hands[p.active];
  const two = h.cards.length === 2;
  const splittable = two && cardValue(h.cards[0]) === cardValue(h.cards[1]) && p.hands.length < 4;
  return {
    hit: true,
    stand: true,
    double: two && p.stack >= h.bet,
    split: splittable && p.stack >= h.bet,
  };
}

export const blackjack: GameModule<BlackjackState, BlackjackAction, BlackjackView, BlackjackConfig> = {
  id: 'blackjack',
  name: 'Blackjack',
  description: 'Beat the dealer to 21. 6-deck shoe, dealer stands on soft 17, blackjack pays 3:2.',
  minPlayers: 1,
  maxPlayers: 7,
  defaultConfig: { rounds: 10, minBet: 10, maxBet: 500, buyIn: 1000, decks: 6 },

  parseConfig(input) {
    const c = (input ?? {}) as Partial<BlackjackConfig>;
    const d = this.defaultConfig;
    const minBet = clampInt(c.minBet, 1, 10_000, d.minBet);
    return {
      rounds: clampInt(c.rounds, 1, 100, d.rounds),
      minBet,
      maxBet: clampInt(c.maxBet, minBet, 100_000, Math.max(d.maxBet, minBet)),
      buyIn: clampInt(c.buyIn, minBet, 1_000_000, Math.max(d.buyIn, minBet)),
      decks: clampInt(c.decks, 1, 8, d.decks),
    };
  },

  buyIn: (config) => config.buyIn,

  setup(players: PlayerRef[], config, seed) {
    const rng = new Rng(seed);
    const s: BlackjackState = {
      config,
      rng: 0,
      round: 1,
      phase: 'betting',
      shoe: rng.shuffle(makeDeck(config.decks)),
      dealer: [],
      players: players.map((p) => ({
        id: p.id,
        name: p.name,
        isBot: p.isBot,
        stack: p.stack,
        bet: null,
        hands: [],
        active: 0,
        sittingOut: false,
      })),
      turn: null,
      buyIn: config.buyIn,
    };
    s.rng = rng.state;
    startRound(s);
    return s;
  },

  actors(s) {
    if (s.phase === 'betting') return s.players.filter((p) => !p.sittingOut && p.bet === null).map((p) => p.id);
    if (s.phase === 'playing' && s.turn !== null) return [s.players[s.turn].id];
    return [];
  },

  applyAction(state, playerId, action) {
    const legal = legalFor(state, playerId);
    if (!legal) return { ok: false, error: 'Not your turn' };
    const s = clone(state);
    const p = s.players.find((x) => x.id === playerId)!;

    if (action?.type === 'bet') {
      if (!legal.bet) return { ok: false, error: 'Cannot bet now' };
      const amt = action.amount;
      if (!Number.isInteger(amt) || amt < legal.bet.min || amt > legal.bet.max)
        return { ok: false, error: `Bet must be between ${legal.bet.min} and ${legal.bet.max}` };
      p.bet = amt;
      p.stack -= amt;
      if (s.players.every((x) => x.sittingOut || x.bet !== null)) deal(s);
      return { ok: true, state: s };
    }

    const type = action?.type;
    if (type !== 'hit' && type !== 'stand' && type !== 'double' && type !== 'split') {
      return { ok: false, error: 'Unknown action' };
    }
    if (!legal[type]) return { ok: false, error: `Cannot ${type} now` };
    const h = p.hands[p.active];
    if (type === 'hit') {
      h.cards.push(draw(s));
      if (handValue(h.cards).total >= 21) h.done = true;
    } else if (type === 'stand') {
      h.done = true;
    } else if (type === 'double') {
      p.stack -= h.bet;
      h.bet *= 2;
      h.doubled = true;
      h.cards.push(draw(s));
      h.done = true;
    } else {
      p.stack -= h.bet;
      const aces = rankOf(h.cards[0]) === 14;
      const second: BJHand = { cards: [h.cards.pop()!], bet: h.bet, done: false, doubled: false, fromSplit: true };
      h.fromSplit = true;
      p.hands.splice(p.active + 1, 0, second);
      for (const nh of [h, second]) {
        nh.cards.push(draw(s));
        if (aces || handValue(nh.cards).total === 21) nh.done = true;
      }
    }
    moveTurn(s);
    return { ok: true, state: s };
  },

  autoAdvance(s) {
    if (s.phase === 'dealer') return 800;
    if (s.phase === 'settled') return 3500;
    return null;
  },

  advance(state) {
    const s = clone(state);
    if (s.phase === 'dealer') {
      const anyLive = s.players.some((p) => p.hands.some((h) => handValue(h.cards).total <= 21));
      const needsCard = handValue(s.dealer).total < 17 && anyLive && !isBlackjack({ cards: s.dealer });
      if (needsCard) s.dealer.push(draw(s));
      else settle(s);
    } else if (s.phase === 'settled') {
      s.round++;
      if (s.round > s.config.rounds) s.phase = 'over';
      else startRound(s);
    }
    return s;
  },

  endEarly(state) {
    const s = clone(state);
    // Refund anything still riding on an unsettled round.
    if (s.phase === 'betting') for (const p of s.players) p.stack += p.bet ?? 0;
    if (s.phase === 'playing' || s.phase === 'dealer')
      for (const p of s.players) for (const h of p.hands) p.stack += h.bet;
    s.phase = 'over';
    return s;
  },

  result(s) {
    if (s.phase !== 'over') return null;
    const standings = rankStandings(
      s.players.map((p) => ({ playerId: p.id, score: p.stack - s.buyIn, payout: p.stack })),
    );
    const top = s.players.find((p) => p.id === standings[0].playerId)!;
    return { standings, summary: `${top.name} finished with ${top.stack} chips` };
  },

  viewFor(s, playerId) {
    const hideHole = s.phase === 'playing';
    const dealerCards = s.dealer.map((c, i) => (hideHole && i === 1 ? null : c));
    const visible = dealerCards.filter((c): c is Card => c !== null);
    return {
      phase: s.phase,
      round: s.round,
      rounds: s.config.rounds,
      minBet: s.config.minBet,
      maxBet: s.config.maxBet,
      shoeLeft: s.shoe.length,
      dealer: { cards: dealerCards, total: visible.length ? handValue(visible).total : null },
      players: s.players.map((p) => ({
        ...p,
        hands: p.hands.map((h) => ({ ...h, ...handValue(h.cards) })),
      })),
      turn: s.turn !== null ? s.players[s.turn].id : null,
      legal: playerId ? legalFor(s, playerId) : null,
    };
  },

  botAction(s, playerId, rand) {
    const legal = legalFor(s, playerId)!;
    if (legal.bet) {
      const mult = 1 + Math.floor(rand() * 4);
      return { type: 'bet', amount: Math.min(legal.bet.max, Math.max(legal.bet.min, s.config.minBet * mult)) };
    }
    // Simplified basic strategy.
    const p = s.players.find((x) => x.id === playerId)!;
    const h = p.hands[p.active];
    const { total, soft } = handValue(h.cards);
    const up = cardValue(s.dealer[0]);
    if (legal.split && [11, 8].includes(cardValue(h.cards[0]))) return { type: 'split' };
    if (legal.double && !soft && (total === 11 || (total === 10 && up < 10))) return { type: 'double' };
    if (soft) return { type: total <= 17 ? 'hit' : 'stand' };
    if (total <= 11) return { type: 'hit' };
    if (total <= 16) return { type: up >= 7 ? 'hit' : 'stand' };
    return { type: 'stand' };
  },

  timeoutAction(s, playerId) {
    const legal = legalFor(s, playerId);
    if (legal?.bet) return { type: 'bet', amount: legal.bet.min };
    return { type: 'stand' };
  },
};
