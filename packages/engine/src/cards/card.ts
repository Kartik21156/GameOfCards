/** A card is a 2-char code: suit + rank, e.g. "SA", "HT" (ten), "D7". */
export type Suit = 'S' | 'H' | 'D' | 'C';
export type Card = string;

export const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
export const RANKS = '23456789TJQKA';

export const suitOf = (c: Card) => c[0] as Suit;
/** 2..14 (ace high). */
export const rankOf = (c: Card) => RANKS.indexOf(c[1]) + 2;

export function makeDeck(decks = 1): Card[] {
  const out: Card[] = [];
  for (let d = 0; d < decks; d++) for (const s of SUITS) for (const r of RANKS) out.push(s + r);
  return out;
}

export const isCard = (v: unknown): v is Card =>
  typeof v === 'string' && v.length === 2 && SUITS.includes(v[0] as Suit) && RANKS.includes(v[1]);

/** Sort for display: by suit (S,H,C,D alternating colours) then rank descending. */
export function sortHand(cards: Card[]): Card[] {
  const order: Record<Suit, number> = { S: 0, H: 1, C: 2, D: 3 };
  return [...cards].sort((a, b) => order[suitOf(a)] - order[suitOf(b)] || rankOf(b) - rankOf(a));
}
