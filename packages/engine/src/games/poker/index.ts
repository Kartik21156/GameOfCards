import { type Card, makeDeck, rankOf, suitOf } from '../../cards/card.ts';
import { bestHand, compareScores } from '../../cards/pokerEval.ts';
import { Rng } from '../../rng.ts';
import { type GameModule, clone, rankStandings } from '../../types.ts';

export interface PokerConfig {
  smallBlind: number;
  bigBlind: number;
  buyIn: number;
  maxHands: number;
}

export interface PokerPlayer {
  id: string;
  name: string;
  isBot: boolean;
  stack: number;
  hole: Card[];
  /** Chips put in on the current street. */
  bet: number;
  /** Chips put in over the whole hand (drives side pots). */
  committed: number;
  inHand: boolean;
  folded: boolean;
  allIn: boolean;
  acted: boolean;
  lastAction: string | null;
}

type Street = 'preflop' | 'flop' | 'turn' | 'river';

export interface PokerState {
  config: PokerConfig;
  rng: number;
  handNo: number;
  button: number;
  phase: Street | 'handDone' | 'over';
  deck: Card[];
  board: Card[];
  players: PokerPlayer[];
  toAct: number | null;
  currentBet: number;
  minRaise: number;
  showdown: boolean;
  winners: { playerId: string; amount: number; hand: string | null }[];
}

export type PokerAction = { type: 'fold' } | { type: 'check' } | { type: 'call' } | { type: 'raise'; to: number };

export interface PokerLegal {
  fold: boolean;
  check: boolean;
  call: number;
  raise: { min: number; max: number } | null;
}

export interface PokerView {
  phase: PokerState['phase'];
  handNo: number;
  maxHands: number;
  smallBlind: number;
  bigBlind: number;
  button: number;
  board: Card[];
  pot: number;
  currentBet: number;
  toAct: string | null;
  players: (Omit<PokerPlayer, 'hole'> & { hole: (Card | null)[]; handName: string | null })[];
  winners: PokerState['winners'];
  showdown: boolean;
  myHand: string | null;
  legal: PokerLegal | null;
}

const STREETS: Street[] = ['preflop', 'flop', 'turn', 'river'];
const isStreet = (p: PokerState['phase']): p is Street => (STREETS as string[]).includes(p);

const actionable = (p: PokerPlayer) => p.inHand && !p.folded && !p.allIn;
const contenders = (s: PokerState) => s.players.filter((p) => p.inHand && !p.folded);

function nextSeat(s: PokerState, from: number, pred: (p: PokerPlayer) => boolean): number | null {
  const n = s.players.length;
  for (let k = 1; k <= n; k++) {
    const i = (from + k) % n;
    if (pred(s.players[i])) return i;
  }
  return null;
}

function needsAction(s: PokerState, p: PokerPlayer) {
  if (!actionable(p)) return false;
  const others = s.players.filter((o) => o !== p && actionable(o)).length;
  if (others === 0 && p.bet >= s.currentBet) return false;
  return !p.acted || p.bet < s.currentBet;
}

function put(p: PokerPlayer, amount: number) {
  const amt = Math.min(amount, p.stack);
  p.stack -= amt;
  p.bet += amt;
  p.committed += amt;
  if (p.stack === 0) p.allIn = true;
}

function startHand(s: PokerState) {
  const live = s.players.filter((p) => p.stack > 0);
  if (live.length < 2 || s.handNo >= s.config.maxHands) {
    s.phase = 'over';
    s.toAct = null;
    return;
  }
  s.handNo++;
  const rng = new Rng(s.rng);
  s.deck = rng.shuffle(makeDeck());
  s.rng = rng.state;
  s.board = [];
  s.showdown = false;
  s.winners = [];
  for (const p of s.players) {
    Object.assign(p, { hole: [], bet: 0, committed: 0, folded: false, allIn: false, acted: false, lastAction: null });
    p.inHand = p.stack > 0;
  }
  const inHand = (p: PokerPlayer) => p.inHand;
  s.button = nextSeat(s, s.button, inHand)!;
  for (const p of s.players) if (p.inHand) p.hole = [s.deck.pop()!, s.deck.pop()!];

  const headsUp = live.length === 2;
  const sb = headsUp ? s.button : nextSeat(s, s.button, inHand)!;
  const bb = nextSeat(s, sb, inHand)!;
  put(s.players[sb], s.config.smallBlind);
  s.players[sb].lastAction = 'SB';
  put(s.players[bb], s.config.bigBlind);
  s.players[bb].lastAction = 'BB';
  s.currentBet = s.config.bigBlind;
  s.minRaise = s.config.bigBlind;
  s.phase = 'preflop';
  s.toAct = nextSeat(s, bb, (p) => needsAction(s, p));
}

function nextStreet(s: PokerState) {
  for (const p of s.players) {
    p.bet = 0;
    p.acted = false;
  }
  s.currentBet = 0;
  s.minRaise = s.config.bigBlind;
  if (s.phase === 'river') return showdown(s);
  s.phase = STREETS[STREETS.indexOf(s.phase as Street) + 1];
  s.board.push(...s.deck.splice(-(s.phase === 'flop' ? 3 : 1)));
  // If at most one player can still bet, the rest of the board runs out automatically.
  s.toAct = nextSeat(s, s.button, (p) => needsAction(s, p));
}

export interface Pot {
  amount: number;
  eligible: string[];
}

/** Split committed chips into main + side pots. */
export function buildPots(players: Pick<PokerPlayer, 'id' | 'committed' | 'folded'>[]): Pot[] {
  const levels = [...new Set(players.map((p) => p.committed).filter((c) => c > 0))].sort((a, b) => a - b);
  const pots: Pot[] = [];
  let prev = 0;
  for (const level of levels) {
    const amount = players.reduce((sum, p) => sum + Math.max(0, Math.min(p.committed, level) - prev), 0);
    const eligible = players.filter((p) => !p.folded && p.committed >= level).map((p) => p.id);
    const last = pots[pots.length - 1];
    if (last && last.eligible.join() === eligible.join()) last.amount += amount;
    else pots.push({ amount, eligible });
    prev = level;
  }
  return pots;
}

function showdown(s: PokerState) {
  s.showdown = true;
  s.toAct = null;
  const hands = new Map(contenders(s).map((p) => [p.id, bestHand([...p.hole, ...s.board])]));
  const won = new Map<string, number>();
  const n = s.players.length;
  // Odd chips go to the first winner left of the button.
  const order = s.players.map((_, k) => s.players[(s.button + 1 + k) % n].id);
  for (const pot of buildPots(s.players)) {
    if (pot.eligible.length === 0) continue;
    let best: number[] | null = null;
    let winners: string[] = [];
    for (const id of pot.eligible) {
      const sc = hands.get(id)!.score;
      const cmp = best ? compareScores(sc, best) : 1;
      if (cmp > 0) [best, winners] = [sc, [id]];
      else if (cmp === 0) winners.push(id);
    }
    winners.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    const share = Math.floor(pot.amount / winners.length);
    winners.forEach((id, i) => won.set(id, (won.get(id) ?? 0) + share + (i === 0 ? pot.amount % winners.length : 0)));
  }
  finishHand(s, won, (id) => hands.get(id)?.name ?? null);
}

function finishHand(s: PokerState, won: Map<string, number>, handName: (id: string) => string | null) {
  s.winners = [];
  for (const [id, amount] of won) {
    s.players.find((p) => p.id === id)!.stack += amount;
    s.winners.push({ playerId: id, amount, hand: handName(id) });
  }
  s.phase = 'handDone';
  s.toAct = null;
}

function legalFor(s: PokerState, playerId: string): PokerLegal | null {
  if (!isStreet(s.phase) || s.toAct === null || s.players[s.toAct].id !== playerId) return null;
  const p = s.players[s.toAct];
  const toCall = s.currentBet - p.bet;
  const maxTo = p.bet + p.stack;
  const othersCanAct = s.players.some((o) => o !== p && actionable(o));
  // `acted` is only cleared by a full raise, so a player who already acted and now
  // faces just a short all-in raise may call or fold but not re-raise.
  const canRaise = maxTo > s.currentBet && othersCanAct && !p.acted;
  return {
    fold: true,
    check: toCall === 0,
    call: Math.min(toCall, p.stack),
    raise: canRaise ? { min: Math.min(s.currentBet + s.minRaise, maxTo), max: maxTo } : null,
  };
}

const clampInt = (v: unknown, lo: number, hi: number, dflt: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : dflt;

/** 0..1 rough hand strength for bots. */
function strength(hole: Card[], board: Card[]): number {
  if (board.length === 0) {
    const [a, b] = hole.map(rankOf).sort((x, y) => y - x);
    let v = (a + b) / 28; // 0.14..1
    if (a === b) v = 0.55 + a / 30;
    if (suitOf(hole[0]) === suitOf(hole[1])) v += 0.06;
    if (a - b === 1) v += 0.04;
    return Math.min(1, v);
  }
  const mine = bestHand([...hole, ...board]).score[0];
  const boardOnly = board.length >= 5 ? bestHand(board).score[0] : 0;
  const base = [0.15, 0.5, 0.72, 0.82, 0.88, 0.9, 0.95, 0.99, 1][mine];
  return mine <= boardOnly ? base * 0.5 : base;
}

export const poker: GameModule<PokerState, PokerAction, PokerView, PokerConfig> = {
  id: 'poker',
  name: "Texas Hold'em",
  description: 'No-limit Texas Hold’em with blinds, side pots and showdowns.',
  minPlayers: 2,
  maxPlayers: 9,
  defaultConfig: { smallBlind: 5, bigBlind: 10, buyIn: 1000, maxHands: 50 },

  parseConfig(input) {
    const c = (input ?? {}) as Partial<PokerConfig>;
    const d = this.defaultConfig;
    const smallBlind = clampInt(c.smallBlind, 1, 10_000, d.smallBlind);
    const bigBlind = clampInt(c.bigBlind, smallBlind, 20_000, Math.max(d.bigBlind, smallBlind * 2));
    return {
      smallBlind,
      bigBlind,
      buyIn: clampInt(c.buyIn, bigBlind * 10, 1_000_000, Math.max(d.buyIn, bigBlind * 10)),
      maxHands: clampInt(c.maxHands, 1, 500, d.maxHands),
    };
  },

  buyIn: (config) => config.buyIn,

  setup(players, config, seed) {
    const s: PokerState = {
      config,
      rng: seed,
      handNo: 0,
      button: new Rng(seed ^ 0x9e3779b9).int(players.length),
      phase: 'preflop',
      deck: [],
      board: [],
      players: players.map((p) => ({
        id: p.id,
        name: p.name,
        isBot: p.isBot,
        stack: p.stack,
        hole: [],
        bet: 0,
        committed: 0,
        inHand: false,
        folded: false,
        allIn: false,
        acted: false,
        lastAction: null,
      })),
      toAct: null,
      currentBet: 0,
      minRaise: config.bigBlind,
      showdown: false,
      winners: [],
    };
    startHand(s);
    return s;
  },

  actors(s) {
    return isStreet(s.phase) && s.toAct !== null ? [s.players[s.toAct].id] : [];
  },

  applyAction(state, playerId, action) {
    const legal = legalFor(state, playerId);
    if (!legal) return { ok: false, error: 'Not your turn' };
    const s = clone(state);
    const i = s.toAct!;
    const p = s.players[i];

    switch (action?.type) {
      case 'fold':
        p.folded = true;
        p.lastAction = 'Fold';
        break;
      case 'check':
        if (!legal.check) return { ok: false, error: 'Cannot check facing a bet' };
        p.lastAction = 'Check';
        break;
      case 'call':
        if (legal.check) return { ok: false, error: 'Nothing to call' };
        put(p, legal.call);
        p.lastAction = p.allIn ? 'All-in' : 'Call';
        break;
      case 'raise': {
        if (!legal.raise) return { ok: false, error: 'Cannot raise' };
        const to = Math.min(Math.floor(action.to), legal.raise.max);
        if (!Number.isFinite(to) || to < legal.raise.min)
          return { ok: false, error: `Raise must be at least ${legal.raise.min}` };
        const increment = to - s.currentBet;
        put(p, to - p.bet);
        if (increment >= s.minRaise) {
          s.minRaise = increment;
          for (const o of s.players) if (o !== p) o.acted = false;
        }
        p.lastAction = p.allIn ? 'All-in' : s.currentBet === 0 ? `Bet ${to}` : `Raise ${to}`;
        s.currentBet = to;
        break;
      }
      default:
        return { ok: false, error: 'Unknown action' };
    }
    p.acted = true;

    const left = contenders(s);
    if (left.length === 1) {
      const pot = s.players.reduce((sum, x) => sum + x.committed, 0);
      finishHand(s, new Map([[left[0].id, pot]]), () => null);
      return { ok: true, state: s };
    }
    const next = nextSeat(s, i, (x) => needsAction(s, x));
    if (next === null) nextStreet(s);
    else s.toAct = next;
    return { ok: true, state: s };
  },

  autoAdvance(s) {
    if (isStreet(s.phase) && s.toAct === null) return 1200; // all-in runout
    if (s.phase === 'handDone') return s.showdown ? 5000 : 2500;
    return null;
  },

  advance(state) {
    const s = clone(state);
    if (isStreet(s.phase) && s.toAct === null) nextStreet(s);
    else if (s.phase === 'handDone') startHand(s);
    return s;
  },

  endEarly(state) {
    const s = clone(state);
    // Return chips from an unfinished hand.
    if (isStreet(s.phase)) for (const p of s.players) p.stack += p.committed;
    s.phase = 'over';
    s.toAct = null;
    return s;
  },

  result(s) {
    if (s.phase !== 'over') return null;
    const standings = rankStandings(
      s.players.map((p) => ({ playerId: p.id, score: p.stack - s.config.buyIn, payout: p.stack })),
    );
    const top = s.players.find((p) => p.id === standings[0].playerId)!;
    return { standings, summary: `${top.name} leads with ${top.stack} chips after ${s.handNo} hands` };
  },

  viewFor(s, playerId) {
    const reveal = (p: PokerPlayer) => p.id === playerId || (s.showdown && p.inHand && !p.folded);
    const me = s.players.find((p) => p.id === playerId);
    return {
      phase: s.phase,
      handNo: s.handNo,
      maxHands: s.config.maxHands,
      smallBlind: s.config.smallBlind,
      bigBlind: s.config.bigBlind,
      button: s.button,
      board: s.board,
      pot: s.players.reduce((sum, p) => sum + p.committed, 0),
      currentBet: s.currentBet,
      toAct: s.toAct !== null ? s.players[s.toAct].id : null,
      players: s.players.map((p) => ({
        ...p,
        hole: reveal(p) ? p.hole : p.hole.map(() => null),
        handName: reveal(p) && s.board.length >= 3 ? bestHand([...p.hole, ...s.board]).name : null,
      })),
      winners: s.winners,
      showdown: s.showdown,
      myHand: me && me.hole.length && s.board.length >= 3 ? bestHand([...me.hole, ...s.board]).name : null,
      legal: playerId ? legalFor(s, playerId) : null,
    };
  },

  botAction(s, playerId, rand) {
    const legal = legalFor(s, playerId)!;
    const p = s.players.find((x) => x.id === playerId)!;
    const pot = s.players.reduce((sum, x) => sum + x.committed, 0);
    const st = strength(p.hole, s.board) + (rand() - 0.5) * 0.15;
    const toCall = legal.call;
    const odds = toCall / (pot + toCall || 1);

    if (legal.raise && st > 0.75 && rand() < 0.7) {
      const target = s.currentBet + Math.max(s.minRaise, Math.round(pot * (0.5 + rand() * 0.5)));
      return { type: 'raise', to: Math.max(legal.raise.min, Math.min(legal.raise.max, target)) };
    }
    if (legal.check) {
      if (legal.raise && st > 0.55 && rand() < 0.35) return { type: 'raise', to: legal.raise.min };
      return { type: 'check' };
    }
    if (st >= odds + 0.15 || (toCall <= s.config.bigBlind && st > 0.3)) return { type: 'call' };
    return { type: 'fold' };
  },

  timeoutAction(s, playerId) {
    return legalFor(s, playerId)?.check ? { type: 'check' } : { type: 'fold' };
  },
};
