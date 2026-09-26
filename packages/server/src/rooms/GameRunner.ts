import { type GameModule, type GameResult, randomSeed } from '@goc/engine';
import { type GameUpdate, TURN_SECONDS } from '@goc/shared';

export interface RunnerSeat {
  playerId: string;
  /** Null for bots. */
  userId: string | null;
  name: string;
  isBot: boolean;
  /** Human who disconnected or left: a bot plays for them. */
  away: boolean;
}

export interface RunnerHooks {
  /** State changed: push fresh views to everyone. */
  changed(): void;
  /** Game finished; settle chips and stats. */
  over(result: GameResult): void;
}

const BOT_DELAY = () => 600 + Math.floor(Math.random() * 500);
/** A human marked away gets a bot move quickly, but not instantly, so the table stays readable. */
const AWAY_DELAY = 900;

/**
 * Drives one game: applies intents through the engine, runs auto-advance
 * timers, bot moves and turn timers. Knows nothing about sockets or the db.
 */
export class GameRunner {
  state: unknown;
  readonly startedAt = new Date();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private deadlines = new Map<string, { at: number; timer: ReturnType<typeof setTimeout> }>();
  private finished = false;

  constructor(
    readonly game: GameModule,
    readonly seats: RunnerSeat[],
    readonly config: unknown,
    private hooks: RunnerHooks,
  ) {
    const stack = game.buyIn(config);
    const players = seats.map((s) => ({ id: s.playerId, name: s.name, isBot: s.isBot, stack }));
    this.state = game.setup(players, config, randomSeed());
  }

  get isOver() {
    return this.finished;
  }

  start() {
    this.step();
  }

  /** A human's intent. Returns an error message, or null on success. */
  act(playerId: string, action: unknown): string | null {
    if (this.finished) return 'The game is over';
    const r = this.guard(() => this.game.applyAction(this.state, playerId, action));
    if (!r) return 'Something went wrong';
    if (!r.ok) return r.error;
    this.state = r.state;
    this.clearDeadline(playerId);
    this.step();
    return null;
  }

  setAway(playerId: string, away: boolean) {
    // Seats may be shared with the caller, so always reschedule rather than
    // skipping when the flag already matches.
    const seat = this.seats.find((s) => s.playerId === playerId);
    if (!seat || this.finished) return;
    seat.away = away;
    this.clearDeadline(playerId);
    this.step();
  }

  endEarly() {
    if (this.finished) return;
    this.state = this.guard(() => this.game.endEarly(this.state)) ?? this.state;
    this.step();
  }

  dispose() {
    this.finished = true;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    for (const id of [...this.deadlines.keys()]) this.clearDeadline(id);
  }

  update(playerId: string | null): GameUpdate {
    const actors = this.finished ? [] : this.game.actors(this.state);
    return {
      gameId: this.game.id,
      view: this.game.viewFor(this.state, playerId),
      you: playerId,
      actors,
      deadlines: Object.fromEntries([...this.deadlines].map(([id, d]) => [id, d.at])),
    };
  }

  private botControlled(playerId: string) {
    const seat = this.seats.find((s) => s.playerId === playerId);
    return !seat || seat.isBot || seat.away;
  }

  private step() {
    if (this.finished) return;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();

    const result = this.guard(() => this.game.result(this.state));
    if (result) return this.finish(result);

    const actors = this.game.actors(this.state);
    for (const id of [...this.deadlines.keys()]) if (!actors.includes(id)) this.clearDeadline(id);

    for (const id of actors) {
      if (this.botControlled(id)) {
        const human = !this.seats.find((s) => s.playerId === id)?.isBot;
        this.later(human ? AWAY_DELAY : BOT_DELAY(), () => this.autoMove(id, 'bot'));
      } else if (!this.deadlines.has(id)) {
        const at = Date.now() + TURN_SECONDS * 1000;
        const timer = setTimeout(() => {
          this.deadlines.delete(id);
          this.autoMove(id, 'timeout');
        }, TURN_SECONDS * 1000);
        this.deadlines.set(id, { at, timer });
      }
    }

    const delay = actors.length ? null : this.guard(() => this.game.autoAdvance(this.state));
    if (delay !== null && delay !== undefined) {
      this.later(delay, () => {
        const next = this.guard(() => this.game.advance(this.state));
        if (next) this.state = next;
        this.step();
      });
    } else if (!actors.length) {
      // Nobody to act and nothing scheduled: the module is stuck, so stop cleanly.
      console.error(`[${this.game.id}] stuck state, ending early`);
      this.state = this.game.endEarly(this.state);
      const r = this.game.result(this.state);
      if (r) return this.finish(r);
    }

    this.hooks.changed();
  }

  private autoMove(playerId: string, why: 'bot' | 'timeout') {
    if (this.finished || !this.game.actors(this.state).includes(playerId)) return;
    const pick = () =>
      why === 'timeout'
        ? this.game.timeoutAction(this.state, playerId)
        : this.game.botAction(this.state, playerId, Math.random);
    let r = this.guard(() => this.game.applyAction(this.state, playerId, pick()));
    if (!r?.ok) {
      // Fall back to the bot if the timeout move was rejected.
      r = this.guard(() => this.game.applyAction(this.state, playerId, this.game.botAction(this.state, playerId, Math.random)));
    }
    if (!r?.ok) {
      console.error(`[${this.game.id}] no legal auto move for ${playerId}: ${r && !r.ok ? r.error : 'threw'}`);
      this.state = this.game.endEarly(this.state);
    } else {
      this.state = r.state;
    }
    this.step();
  }

  private finish(result: GameResult) {
    this.dispose();
    this.hooks.changed();
    this.hooks.over(result);
  }

  private later(ms: number, fn: () => void) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
  }

  private clearDeadline(id: string) {
    const d = this.deadlines.get(id);
    if (d) clearTimeout(d.timer);
    this.deadlines.delete(id);
  }

  /** Engine code should never throw, but a bug must not take the server down. */
  private guard<T>(fn: () => T): T | null {
    try {
      return fn();
    } catch (err) {
      console.error(`[${this.game.id}] engine error`, err);
      return null;
    }
  }
}
