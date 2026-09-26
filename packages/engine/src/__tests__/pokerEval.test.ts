import { describe, expect, it } from 'vitest';
import { bestHand, compareScores, eval5 } from '../cards/pokerEval.ts';

const h = (s: string) => s.split(' ');
const cmp = (a: string, b: string) => Math.sign(compareScores(eval5(h(a)), eval5(h(b))));

describe('eval5', () => {
  it('ranks every category in order', () => {
    const ladder = [
      'S2 H5 D9 CJ SK', // high card
      'S2 H2 D9 CJ SK', // pair
      'S2 H2 D9 C9 SK', // two pair
      'S2 H2 D2 C9 SK', // trips
      'S5 H6 D7 C8 S9', // straight
      'H2 H5 H9 HJ HK', // flush
      'S2 H2 D2 C9 S9', // full house
      'S2 H2 D2 C2 SK', // quads
      'H5 H6 H7 H8 H9', // straight flush
    ];
    ladder.forEach((hand, i) => expect(eval5(h(hand))[0]).toBe(i));
    for (let i = 1; i < ladder.length; i++) expect(cmp(ladder[i], ladder[i - 1])).toBe(1);
  });

  it('treats A-2-3-4-5 as a five-high straight', () => {
    expect(eval5(h('SA H2 D3 C4 S5'))).toEqual([4, 5]);
    expect(cmp('S2 H3 D4 C5 S6', 'SA H2 D3 C4 S5')).toBe(1);
    expect(cmp('ST HJ DQ CK SA', 'S9 HT DJ CQ SK')).toBe(1);
  });

  it('breaks ties with kickers', () => {
    expect(cmp('SA HA DK C7 S2', 'CA DA HQ SJ ST')).toBe(1);
    expect(cmp('SK HK D5 C5 S9', 'CK DK H5 S5 C8')).toBe(1);
    expect(cmp('SK HK D5 C5 S9', 'CK DK H5 S5 D9')).toBe(0);
    expect(cmp('S3 H3 D3 C2 S2', 'S2 H2 D2 CA SA')).toBe(1);
  });
});

describe('bestHand', () => {
  it('picks the best five of seven', () => {
    const b = bestHand(h('HA HK HQ HJ HT S2 D3'));
    expect(b.name).toBe('Straight Flush');
    expect([...b.cards].sort()).toEqual(h('HA HJ HK HQ HT'));
    expect(bestHand(h('S9 H9 D9 C4 S4 H4 D2')).score).toEqual([6, 9, 4]);
  });
});
