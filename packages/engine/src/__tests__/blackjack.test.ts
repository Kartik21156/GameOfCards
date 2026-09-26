import { describe, expect, it } from 'vitest';
import { blackjack, handValue, type BlackjackAction, type BlackjackState } from '../games/blackjack/index.ts';

const h = (s: string) => s.split(' ');
const cfg = { ...blackjack.defaultConfig, rounds: 3 };

/** A one-player table in the betting phase whose next draws come out in the given order. */
function table(draws: string, stack = 1000): BlackjackState {
  const s = blackjack.setup([{ id: 'a', name: 'A', isBot: false, stack }], cfg, 1);
  // draw() pops from the end; pad the front so the shoe never runs dry.
  s.shoe = [...Array(200).fill('C2'), ...h(draws).reverse()];
  return s;
}
const act = (s: BlackjackState, action: BlackjackAction) => {
  const r = blackjack.applyAction(s, 'a', action);
  if (!r.ok) throw new Error(r.error);
  return r.state;
};
const runDealer = (s: BlackjackState) => {
  while (s.phase === 'dealer') s = blackjack.advance(s);
  return s;
};

describe('handValue', () => {
  it('counts soft and hard totals', () => {
    expect(handValue(h('SA S6'))).toEqual({ total: 17, soft: true });
    expect(handValue(h('SA S6 HT'))).toEqual({ total: 17, soft: false });
    expect(handValue(h('SA SA S9'))).toEqual({ total: 21, soft: true });
    expect(handValue(h('SK SQ S2'))).toEqual({ total: 22, soft: false });
  });
});

// Deal order is player, player, dealer up, dealer hole, then hits.
describe('blackjack rounds', () => {
  it('natural blackjack pays 3:2', () => {
    const s = runDealer(act(table('SA SK H9 H8'), { type: 'bet', amount: 100 }));
    expect(s.players[0].hands[0].outcome).toBe('blackjack');
    expect(s.players[0].stack).toBe(1150);
  });

  it('push returns the bet', () => {
    const s = runDealer(act(act(table('ST S8 HT H8'), { type: 'bet', amount: 100 }), { type: 'stand' }));
    expect(s.players[0].hands[0].outcome).toBe('push');
    expect(s.players[0].stack).toBe(1000);
  });

  it('dealer stands on soft 17', () => {
    const s = runDealer(act(act(table('ST S8 HA H6 C9'), { type: 'bet', amount: 100 }), { type: 'stand' }));
    expect(s.dealer).toEqual(h('HA H6'));
    expect(s.players[0].hands[0].outcome).toBe('win');
    expect(s.players[0].stack).toBe(1100);
  });

  it('double takes exactly one card and doubles the bet', () => {
    let s = act(act(table('S6 S5 HT H7 DK'), { type: 'bet', amount: 100 }), { type: 'double' });
    expect(s.players[0].hands[0].cards).toHaveLength(3);
    expect(s.players[0].hands[0].bet).toBe(200);
    s = runDealer(s);
    expect(s.players[0].stack).toBe(1200);
  });

  it('split aces get one card each, and 21 after a split is not a blackjack', () => {
    let s = act(act(table('SA HA D9 D8 SK H5'), { type: 'bet', amount: 100 }), { type: 'split' });
    const hands = s.players[0].hands;
    expect(hands).toHaveLength(2);
    expect(hands.every((x) => x.done && x.cards.length === 2)).toBe(true);
    s = runDealer(s);
    expect(s.players[0].hands[0].outcome).toBe('win'); // 21 vs 17 pays 1:1
    expect(s.players[0].hands[1].outcome).toBe('lose'); // 16 vs 17
    expect(s.players[0].stack).toBe(1000);
  });

  it('endEarly refunds live bets', () => {
    const s = act(table('ST S8 HT H7'), { type: 'bet', amount: 100 });
    expect(s.players[0].stack).toBe(900);
    expect(blackjack.result(blackjack.endEarly(s))!.standings[0].payout).toBe(1000);
  });

  it('hides the hole card while players act', () => {
    const v = blackjack.viewFor(act(table('ST S8 HT H7'), { type: 'bet', amount: 100 }), null);
    expect(v.dealer.cards).toEqual(['HT', null]);
    expect(JSON.stringify(v)).not.toContain('H7');
  });
});
