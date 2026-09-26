import type { ClientGame } from './types.ts';
import { BlackjackTable } from './blackjack/Table.tsx';
import { CallbreakTable } from './callbreak/Table.tsx';
import { PokerTable } from './poker/Table.tsx';

/**
 * UI for each game mode, keyed by the engine module id. To add a game:
 * implement its GameModule in @goc/engine, then add its Table here.
 */
export const clientGames: Record<string, ClientGame> = {
  callbreak: {
    Table: CallbreakTable,
    tagline: 'Four players · spades trump · bid and deliver',
    showcase: ['SA', 'SK', 'HA', 'DQ'],
    chips: false,
    rules: [
      'Four players, 13 cards each. Spades are always trump.',
      'Everyone bids how many tricks they will win (1–8).',
      'Follow suit and beat the card on the table if you can; if you are out of that suit you must trump (and overtrump).',
      'Make your bid: score the bid plus 0.1 per extra trick. Miss it: lose your bid.',
      'Highest total after the last round wins. Empty seats are filled with bots.',
    ],
    configFields: [
      { key: 'rounds', label: 'Rounds', min: 1, max: 20 },
      { key: 'maxBid', label: 'Max bid', min: 1, max: 13 },
    ],
  },
  poker: {
    Table: PokerTable,
    tagline: "No-limit Texas Hold'em · 2–9 players",
    showcase: ['HA', 'HK', 'HQ', 'HJ', 'HT'],
    chips: true,
    rules: [
      'Everyone buys in from their chip balance and cashes out what is left at the end.',
      'Two hole cards each, five shared cards: flop, turn, river.',
      'Check, bet, call, raise or fold; no-limit means you can go all-in any time.',
      'Best five-card hand wins; side pots are handled automatically.',
      'The game ends after the hand limit or when one player has every chip.',
    ],
    configFields: [
      { key: 'smallBlind', label: 'Small blind', min: 1, max: 10000 },
      { key: 'bigBlind', label: 'Big blind', min: 2, max: 20000 },
      { key: 'buyIn', label: 'Buy-in', min: 100, max: 1000000, step: 100, hint: 'At least 10 big blinds' },
      { key: 'maxHands', label: 'Hands', min: 1, max: 500 },
    ],
  },
  blackjack: {
    Table: BlackjackTable,
    tagline: 'Beat the dealer · 3:2 blackjack · up to 7 seats',
    showcase: ['SA', 'DK'],
    chips: true,
    rules: [
      'Buy in from your chip balance; everyone plays against the dealer.',
      'Bet, then hit or stand. Double down on any two cards; split pairs up to four hands.',
      'Dealer draws to 16 and stands on all 17s (including soft 17).',
      'Blackjack pays 3:2, wins pay 1:1, ties push.',
      'Chips you have at the end go back to your balance.',
    ],
    configFields: [
      { key: 'rounds', label: 'Rounds', min: 1, max: 100 },
      { key: 'minBet', label: 'Min bet', min: 1, max: 10000 },
      { key: 'maxBet', label: 'Max bet', min: 1, max: 100000 },
      { key: 'buyIn', label: 'Buy-in', min: 10, max: 1000000, step: 50 },
    ],
  },
};
