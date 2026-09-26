import { describe, expect, it } from 'vitest';
import { games } from '../registry.ts';
import { Rng } from '../rng.ts';
import type { GameModule, PlayerRef } from '../types.ts';

/** Drive a game with bots only until it produces a result. */
export function simulate(game: GameModule, nPlayers: number, seed: number, maxSteps = 20_000) {
  const config = game.parseConfig({});
  const players: PlayerRef[] = Array.from({ length: nPlayers }, (_, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    isBot: true,
    stack: game.buyIn(config),
  }));
  const rng = new Rng(seed);
  const rand = () => rng.next();
  let s = game.setup(players, config, seed);
  for (let step = 0; step < maxSteps; step++) {
    const res = game.result(s);
    if (res) return { state: s, result: res, steps: step };
    const actors = game.actors(s);
    if (actors.length) {
      const id = actors[Math.floor(rand() * actors.length)];
      const action = game.botAction(s, id, rand);
      const r = game.applyAction(s, id, action);
      if (!r.ok) throw new Error(`${game.id} seed ${seed}: bot made illegal move ${JSON.stringify(action)}: ${r.error}`);
      s = r.state;
    } else if (game.autoAdvance(s) !== null) {
      s = game.advance(s);
    } else {
      throw new Error(`${game.id} seed ${seed}: stuck with no actors and no auto-advance`);
    }
  }
  throw new Error(`${game.id} seed ${seed}: did not finish in ${maxSteps} steps`);
}

describe('bot-only simulations', () => {
  for (const game of Object.values(games)) {
    const sizes = [...new Set([game.minPlayers, Math.ceil((game.minPlayers + game.maxPlayers) / 2), game.maxPlayers])];
    for (const n of sizes) {
      it(`${game.id} with ${n} players always terminates and conserves chips`, () => {
        for (let seed = 1; seed <= 60; seed++) {
          const { result } = simulate(game, n, seed * 7919);
          expect(result.standings).toHaveLength(n);
          const buyIn = game.buyIn(game.parseConfig({}));
          const paid = result.standings.reduce((sum, st) => sum + st.payout, 0);
          if (game.id === 'poker') expect(paid).toBe(buyIn * n);
          if (game.id === 'callbreak') expect(paid).toBe(0);
          for (const st of result.standings) expect(st.payout).toBeGreaterThanOrEqual(0);
        }
      });
    }
  }
});
