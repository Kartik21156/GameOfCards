import type { GameModule } from './types.ts';
import { blackjack } from './games/blackjack/index.ts';
import { callbreak } from './games/callbreak/index.ts';
import { poker } from './games/poker/index.ts';

/** Every playable game mode. To add a game, implement GameModule and list it here. */
export const games: Record<string, GameModule> = {
  [callbreak.id]: callbreak,
  [poker.id]: poker,
  [blackjack.id]: blackjack,
};

export const getGame = (id: string): GameModule | undefined => games[id];

export interface GameInfo {
  id: string;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  fillWithBots: boolean;
  defaultConfig: unknown;
}

export const listGames = (): GameInfo[] =>
  Object.values(games).map((g) => ({
    id: g.id,
    name: g.name,
    description: g.description,
    minPlayers: g.minPlayers,
    maxPlayers: g.maxPlayers,
    fillWithBots: !!g.fillWithBots,
    defaultConfig: g.defaultConfig,
  }));
