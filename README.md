# Game of Cards

A multiplayer card-game site to play with friends in the browser. It has accounts, profiles, persistent chips and bots, and three game modes:

- **Callbreak**: 4 players, spades are trump. You bid how many tricks you'll take, then try to make it. Bots fill any empty seats.
- **Texas Hold'em**: no-limit, 2–9 players, with side pots.
- **Blackjack**: 1–7 players against the dealer. 6-deck shoe, S17, blackjack pays 3:2, double and split.

## Quick start

Requires Node 22+ (developed on Node 24).

```bash
npm install
npm run db:setup     # creates the SQLite database (packages/server/dev.db)
npm run dev          # API on :3001, web app on http://localhost:5173
```

Open http://localhost:5173 and create an account (new players get 5,000 chips, plus 1,000 free chips a day). Then create a table in the lobby.

**Playing with friends on your network:** `npm run dev` already listens on all interfaces. Vite prints a `Network:` URL such as `http://192.168.x.x:5173`; friends on the same Wi-Fi open it. Private tables have an invite code, and a link like `/join/ABC123` joins directly.

**Production-style single server:** run `npm run build && npm start`. The API server then serves the built client on http://localhost:3001.

| Env var | Default | |
|---|---|---|
| `PORT` | `3001` | API/app port |
| `DATABASE_URL` | `file:packages/server/dev.db` | SQLite file |
| `JWT_SECRET` | random, saved to `packages/server/.jwt-secret` | Session signing key |

## Scripts

- `npm test`: runs the engine rule tests, randomized bot-vs-bot simulations of every game, and a render test for every game table
- `npm run typecheck`: typechecks all packages
- `node scripts/smoke.mjs [url]`: runs an end-to-end API/socket check against a running server

## Layout

```
packages/
  engine/   pure game logic — one GameModule per game + registry (no I/O)
  shared/   REST/socket types and asset helpers shared by server and client
  server/   Fastify + Socket.IO + Prisma (SQLite); authoritative game runner
  client/   React + Vite + Tailwind + Zustand + Motion
boardgamePack_v2/   Kenney card assets (CC0), copied into the client by `npm run assets`
```

**The server is authoritative.** Clients send intents such as `{ type: 'play', card: 'SA' }`. The server checks each one with the engine, then sends every player their own redacted view (`viewFor`), so hidden cards, decks and shoes never leave the server.

**Bots, disconnects and leaving:**
- If a player disconnects mid-game, a bot plays their seat after 5 seconds. They get the seat back when they reconnect.
- If a player leaves a running game, a bot plays their seat until the game ends, and their final chips are still paid out to them.
- Turn timers are 30 seconds. When time runs out, the game makes a safe move for you: check or fold, stand, or a bot's pick.

**Chips:**
- Poker and Blackjack buy-ins are deducted from your balance when the game starts. Whatever you finish with is credited back when it ends.
- Every change is logged in `ChipTransaction`.
- Callbreak is played for points and doesn't use chips.

## How to add a game mode

1. **Engine:** create `packages/engine/src/games/<id>/index.ts` that exports a `GameModule` (see `packages/engine/src/types.ts`):
   - `setup`: deal from the seeded RNG
   - `actors`: who may act now
   - `applyAction`: validate an intent and return a new state
   - `autoAdvance` / `advance`: timed transitions, such as showing a finished trick
   - `result`: standings and chip payouts
   - `viewFor`: redaction. Never include hidden cards for other players.
   - `botAction`, `timeoutAction`
   - `parseConfig`, `buyIn`

   Keep it pure: clone the state, then mutate the clone.
2. Register it in `packages/engine/src/registry.ts`. The bot simulation in `packages/engine/src/__tests__/sim.test.ts` automatically starts playing it to completion.
3. **Client:** add `packages/client/src/games/<id>/Table.tsx`, which receives `TableProps<YourView>` and calls `act(intent)`. Add an entry in `packages/client/src/games/registry.ts` with the rules text, config fields and showcase cards.
4. That's it. The server, lobby, rooms, chat, stats and leaderboard pick it up with no changes.

## Moving to Postgres

In `packages/server/prisma/schema.prisma`, change `provider = "sqlite"` to `"postgresql"`. Then:
1. Swap the adapter in `packages/server/src/db.ts` for `@prisma/adapter-pg`.
2. Set `DATABASE_URL`.
3. Run `npm run db:setup`.

## Credits

Card, chip and piece art, and sounds: [Kenney](https://kenney.nl) Boardgame Pack (CC0).
