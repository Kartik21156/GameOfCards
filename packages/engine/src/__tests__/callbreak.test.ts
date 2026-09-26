import { describe, expect, it } from 'vitest';
import { callbreak, legalCards, roundScore, winningPlay, type CallbreakState } from '../games/callbreak/index.ts';
import type { PlayerRef } from '../types.ts';

const h = (s: string) => s.split(' ');
const trick = (s: string) => h(s).map((card, seat) => ({ seat, card }));

describe('winningPlay', () => {
  it('highest of the led suit wins without trumps', () => {
    expect(winningPlay(trick('H5 HK H9 DA')).card).toBe('HK');
  });
  it('any spade beats the led suit; highest spade wins', () => {
    expect(winningPlay(trick('HA S2 HK')).card).toBe('S2');
    expect(winningPlay(trick('HA S2 S9 S5')).card).toBe('S9');
  });
});

describe('legalCards', () => {
  it('leading allows anything', () => {
    expect(legalCards(h('HA S2 D3'), [])).toEqual(h('HA S2 D3'));
  });
  it('must follow suit and beat the table when possible', () => {
    expect(legalCards(h('H2 HQ HA D3'), trick('HK'))).toEqual(h('HA'));
  });
  it('must follow even if it cannot beat', () => {
    expect(legalCards(h('H2 H3 SA'), trick('HK'))).toEqual(h('H2 H3'));
  });
  it('need not beat when the trick is already trumped', () => {
    expect(legalCards(h('H2 HA'), trick('HK S2'))).toEqual(h('H2 HA'));
  });
  it('void in the led suit must trump', () => {
    expect(legalCards(h('S2 S9 D3'), trick('HK'))).toEqual(h('S2 S9'));
  });
  it('must overtrump when possible', () => {
    expect(legalCards(h('S2 S9 D3'), trick('HK S5'))).toEqual(h('S9'));
  });
  it('cannot overtrump: play anything', () => {
    expect(legalCards(h('S2 S3 D3'), trick('HK S5'))).toEqual(h('S2 S3 D3'));
  });
  it('void with no trumps: free discard', () => {
    expect(legalCards(h('D2 C3'), trick('HK'))).toEqual(h('D2 C3'));
  });
});

describe('roundScore (tenths)', () => {
  it('made exactly', () => expect(roundScore(3, 3)).toBe(30));
  it('overtricks add 0.1 each', () => expect(roundScore(3, 5)).toBe(32));
  it('missed loses the bid', () => expect(roundScore(4, 3)).toBe(-40));
});

describe('callbreak flow', () => {
  const players: PlayerRef[] = [0, 1, 2, 3].map((i) => ({ id: `p${i}`, name: `P${i}`, isBot: true, stack: 0 }));

  it('deals 13 each and rejects out-of-turn or invalid bids', () => {
    const s = callbreak.setup(players, callbreak.defaultConfig, 42);
    expect(s.hands.map((x) => x.length)).toEqual([13, 13, 13, 13]);
    expect(new Set(s.hands.flat()).size).toBe(52);
    const other = s.players[(s.turn + 1) % 4].id;
    expect(callbreak.applyAction(s, other, { type: 'bid', value: 2 }).ok).toBe(false);
    expect(callbreak.applyAction(s, s.players[s.turn].id, { type: 'bid', value: 0 }).ok).toBe(false);
    expect(callbreak.applyAction(s, s.players[s.turn].id, { type: 'bid', value: 3 }).ok).toBe(true);
  });

  it('bots play a full match of 5 rounds', () => {
    let s: CallbreakState = callbreak.setup(players, callbreak.defaultConfig, 7);
    while (!callbreak.result(s)) {
      const [a] = callbreak.actors(s);
      if (a) {
        const r = callbreak.applyAction(s, a, callbreak.botAction(s, a, Math.random));
        if (!r.ok) throw new Error(r.error);
        s = r.state;
      } else s = callbreak.advance(s);
    }
    expect(s.scores).toHaveLength(5);
    expect(callbreak.result(s)!.standings[0].placement).toBe(1);
  });

  it('views never show other hands', () => {
    const s = callbreak.setup(players, callbreak.defaultConfig, 3);
    const v = callbreak.viewFor(s, 'p1');
    expect(v.hand).toEqual(s.hands[1]);
    for (const seat of [0, 2, 3]) for (const c of s.hands[seat]) expect(JSON.stringify(v)).not.toContain(`"${c}"`);
    expect(callbreak.viewFor(s, null).hand).toEqual([]);
  });
});
