import { describe, expect, it } from 'vitest';
import { buildPots, poker, type PokerAction, type PokerState } from '../games/poker/index.ts';
import type { PlayerRef } from '../types.ts';

const cfg = { smallBlind: 5, bigBlind: 10, buyIn: 1000, maxHands: 50 };
const mk = (stacks: number[]): PlayerRef[] =>
  stacks.map((stack, i) => ({ id: `p${i}`, name: `P${i}`, isBot: false, stack }));
/** Chips on the table; `committed` is only live until the hand is paid out. */
const total = (s: PokerState) =>
  s.players.reduce((sum, p) => sum + p.stack + (s.phase === 'handDone' || s.phase === 'over' ? 0 : p.committed), 0);
const act = (s: PokerState, action: PokerAction) => {
  const r = poker.applyAction(s, s.players[s.toAct!].id, action);
  if (!r.ok) throw new Error(r.error);
  return r.state;
};

describe('buildPots', () => {
  it('splits three all-ins and a fold into main and side pots', () => {
    const pots = buildPots([
      { id: 'a', committed: 100, folded: false },
      { id: 'b', committed: 300, folded: false },
      { id: 'c', committed: 500, folded: false },
      { id: 'd', committed: 200, folded: true },
    ]);
    expect(pots).toEqual([
      { amount: 400, eligible: ['a', 'b', 'c'] },
      { amount: 500, eligible: ['b', 'c'] },
      { amount: 200, eligible: ['c'] },
    ]);
  });
});

describe('poker hands', () => {
  it('heads-up: the button posts the small blind and acts first preflop', () => {
    const s = poker.setup(mk([1000, 1000]), cfg, 5);
    expect(s.players[s.button].lastAction).toBe('SB');
    expect(s.toAct).toBe(s.button);
  });

  it('folding to one player awards the pot', () => {
    let s = poker.setup(mk([1000, 1000, 1000]), cfg, 9);
    s = act(act(s, { type: 'fold' }), { type: 'fold' });
    expect(s.phase).toBe('handDone');
    expect(s.winners).toEqual([expect.objectContaining({ amount: 15 })]);
    expect(total(s)).toBe(3000);
  });

  it('a short all-in raise does not reopen betting for players who already acted', () => {
    let s = poker.setup(mk([1000, 1000, 1000]), cfg, 11);
    const utg = s.toAct!; // three-handed: the button is first to act
    const sb = (utg + 1) % 3;
    s.players[sb].stack = 125; // 5 posted + 125 = all-in for 130
    s = act(s, { type: 'raise', to: 100 });
    s = act(s, { type: 'raise', to: 130 }); // only 30 over 100: not a full raise
    expect(s.players[sb].allIn).toBe(true);
    s = act(s, { type: 'call' }); // BB
    expect(s.toAct).toBe(utg);
    const legal = poker.viewFor(s, s.players[utg].id).legal!;
    expect(legal.call).toBe(30);
    expect(legal.raise).toBeNull();
  });

  it('a split pot gives the odd chip to the first winner left of the button', () => {
    let s = poker.setup(mk([1000, 1000, 1000]), cfg, 21);
    const btn = s.button;
    const sb = (btn + 1) % 3;
    const bb = (btn + 2) % 3;
    // Button calls, SB folds its 5, BB checks: a 25-chip pot between button and BB.
    s = act(act(act(s, { type: 'call' }), { type: 'fold' }), { type: 'check' });
    expect(s.phase).toBe('flop');
    // Royal flush on the board plays for everyone.
    s.board = ['SA', 'SK', 'SQ'];
    s.deck.push('ST', 'SJ'); // turn pops SJ, river pops ST
    s.players[btn].hole = ['H2', 'H3'];
    s.players[sb].hole = ['D2', 'D3'];
    s.players[bb].hole = ['C2', 'C4'];
    while (s.phase !== 'handDone') s = s.toAct !== null ? act(s, { type: 'check' }) : poker.advance(s);
    expect(s.showdown).toBe(true);
    const amounts = Object.fromEntries(s.winners.map((w) => [w.playerId, w.amount]));
    expect(amounts).toEqual({ [s.players[bb].id]: 13, [s.players[btn].id]: 12 });
  });

  it('views hide other hole cards until showdown and never include the deck', () => {
    const s = poker.setup(mk([1000, 1000, 1000]), cfg, 3);
    const v = poker.viewFor(s, 'p0');
    expect(v.players[0].hole).toEqual(s.players[0].hole);
    expect(v.players[1].hole).toEqual([null, null]);
    const json = JSON.stringify(v);
    for (const c of [...s.players[1].hole, ...s.players[2].hole]) expect(json).not.toContain(`"${c}"`);
    expect(JSON.stringify(poker.viewFor(s, null))).not.toContain('deck');
  });

  it('conserves chips through all-in runouts', () => {
    let s = poker.setup(mk([300, 1000, 50]), cfg, 77);
    for (let i = 0; i < 500 && !poker.result(s); i++) {
      if (s.toAct !== null) {
        const legal = poker.viewFor(s, s.players[s.toAct].id).legal!;
        s = act(s, legal.raise ? { type: 'raise', to: legal.raise.max } : legal.check ? { type: 'check' } : { type: 'call' });
      } else s = poker.advance(s);
      expect(total(s)).toBe(1350);
    }
    expect(poker.result(s)).not.toBeNull();
  });
});
