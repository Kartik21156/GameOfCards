import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { type PlayerRef, Rng, games } from '@goc/engine';
import type { RoomDetail, SeatInfo } from '@goc/shared';
import { clientGames } from './registry.ts';

/** Server-render each table at many points of a bot-played game to catch runtime errors in the UI. */
describe('game tables render every phase', () => {
  for (const game of Object.values(games)) {
    it(`${game.id} table renders`, () => {
      const ui = clientGames[game.id];
      expect(ui, `client registry is missing ${game.id}`).toBeDefined();
      const n = game.fillWithBots ? game.maxPlayers : Math.min(4, game.maxPlayers);
      const config = game.parseConfig({});
      const players: PlayerRef[] = Array.from({ length: n }, (_, i) => ({
        id: `p${i}`,
        name: `P${i}`,
        isBot: i > 0,
        stack: game.buyIn(config),
      }));
      const seats: SeatInfo[] = players.map((p, i) => ({
        seat: i,
        userId: i === 0 ? 'p0' : null,
        playerId: p.id,
        name: p.name,
        avatar: 'pieceBlue_single00',
        isBot: p.isBot,
        away: false,
      }));
      const room = { id: 'r', gameId: game.id, seats } as unknown as RoomDetail;
      const rng = new Rng(11);
      let s = game.setup(players, config, 11);
      const phases = new Set<string>();
      for (let step = 0; step < 3000 && !game.result(s); step++) {
        if (step % 7 === 0) {
          for (const you of ['p0', null]) {
            const html = renderToString(
              <ui.Table
                view={game.viewFor(s, you)}
                you={you}
                actors={game.actors(s)}
                deadlines={{ p0: Date.now() + 10_000 }}
                seats={seats}
                room={room}
                act={async () => ({ ok: true })}
              />,
            );
            expect(html.length).toBeGreaterThan(100);
          }
          phases.add((s as { phase: string }).phase);
        }
        const [a] = game.actors(s);
        if (a) {
          const r = game.applyAction(s, a, game.botAction(s, a, () => rng.next()));
          if (!r.ok) throw new Error(r.error);
          s = r.state;
        } else s = game.advance(s);
      }
      expect(phases.size).toBeGreaterThan(1);
    });
  }
});
