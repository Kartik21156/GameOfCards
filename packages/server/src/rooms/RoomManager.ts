import { randomBytes, randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import { type GameModule, type GameResult, getGame } from '@goc/engine';
import type {
  Ack,
  ChatMessage,
  ClientToServer,
  CreateRoomInput,
  GameOver,
  RoomDetail,
  RoomSummary,
  SeatInfo,
  ServerToClient,
} from '@goc/shared';
import { InsufficientChips, adjustChips } from '../chips.ts';
import { type User, db } from '../db.ts';
import { GameRunner } from './GameRunner.ts';

export interface SocketData {
  userId: string;
  /** Loaded by the auth middleware before the connection is accepted. */
  user: User;
}
type IO = Server<ClientToServer, ServerToClient, object, SocketData>;
type Sock = Socket<ClientToServer, ServerToClient, object, SocketData>;

interface Member {
  userId: string;
  name: string;
  avatar: string;
}

interface Seat {
  playerId: string;
  userId: string | null;
  name: string;
  avatar: string;
  isBot: boolean;
  /** Human who disconnected; a bot plays for them until they return. */
  away: boolean;
  /** Human who left a running game; removed when it ends. */
  left: boolean;
}

interface Room {
  id: string;
  name: string;
  game: GameModule;
  config: Record<string, unknown>;
  hostId: string;
  isPrivate: boolean;
  code: string;
  seats: Seat[];
  spectators: Map<string, Member>;
  chat: ChatMessage[];
  runner: GameRunner | null;
  lastResult: GameOver | null;
}

const BOT_NAMES = ['Ada', 'Bishop', 'Cleo', 'Dex', 'Echo', 'Fizz', 'Gus', 'Hex', 'Iris', 'Jax', 'Kit', 'Luna'];
const BOT_AVATARS = ['pieceWhite_single05', 'pieceBlack_single05', 'pieceWhite_single11', 'pieceBlack_single11'];
const CHAT_KEEP = 50;
/** How long a disconnected player keeps their spot before a bot takes over / they are removed. */
const GRACE_PLAYING_MS = 5_000;
const GRACE_WAITING_MS = 30_000;

const fail = (ack: Ack<any> | undefined, error: string) => ack?.({ ok: false, error });

export class RoomManager {
  private rooms = new Map<string, Room>();
  private userRoom = new Map<string, string>();
  private members = new Map<string, Member>();
  private connections = new Map<string, number>();
  private graceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private lobbyQueued = false;

  constructor(private io: IO) {}

  // ---------- connection lifecycle ----------

  /** Synchronous on purpose: handlers must be registered before the client's first emit arrives. */
  connect(socket: Sock) {
    const { user } = socket.data;
    const uid = user.id;
    this.members.set(uid, { userId: uid, name: user.displayName, avatar: user.avatar });
    this.connections.set(uid, (this.connections.get(uid) ?? 0) + 1);
    clearTimeout(this.graceTimers.get(uid));
    this.graceTimers.delete(uid);
    socket.join(`user:${uid}`);

    const room = this.roomOf(uid);
    if (room) {
      socket.join(`room:${room.id}`);
      const seat = room.seats.find((s) => s.userId === uid);
      if (seat?.away && !seat.left) {
        seat.away = false;
        room.runner?.setAway(seat.playerId, false);
        this.system(room, `${seat.name} is back`);
      }
      socket.emit('room:state', this.detail(room));
      socket.emit('chat:history', room.chat);
      if (room.runner) socket.emit('game:update', room.runner.update(seat && !seat.left ? seat.playerId : null));
      else if (room.lastResult) socket.emit('game:over', room.lastResult);
    }
    socket.emit('lobby:rooms', this.summaries());

    socket.on('lobby:list', (ack) => typeof ack === 'function' && ack(this.summaries()));
    socket.on('room:create', (input, ack) => this.safe(ack, (reply) => this.create(socket, input, reply)));
    socket.on('room:join', (target, ack) => this.safe(ack, (reply) => this.join(socket, target ?? {}, reply)));
    socket.on('room:spectate', (target, ack) => this.safe(ack, (reply) => this.spectate(socket, target?.roomId, reply)));
    socket.on('room:leave', (ack) => this.safe(ack, (reply) => this.leave(uid, reply)));
    socket.on('room:addBot', (ack) => this.safe(ack, (reply) => this.addBot(uid, reply)));
    socket.on('room:removeSeat', (seat, ack) => this.safe(ack, (reply) => this.removeSeat(uid, seat, reply)));
    socket.on('room:start', (ack) => this.safe(ack, (reply) => this.start(uid, reply)));
    socket.on('room:end', (ack) => this.safe(ack, (reply) => this.end(uid, reply)));
    socket.on('game:action', (action, ack) => this.safe(ack, (reply) => this.action(uid, action, reply)));
    socket.on('chat:send', (text) => this.chat(uid, text));
    socket.on('disconnect', () => this.disconnect(uid));
  }

  private disconnect(uid: string) {
    const n = (this.connections.get(uid) ?? 1) - 1;
    if (n > 0) return void this.connections.set(uid, n);
    this.connections.delete(uid);
    const room = this.roomOf(uid);
    if (!room) return;
    const wait = room.runner ? GRACE_PLAYING_MS : GRACE_WAITING_MS;
    this.graceTimers.set(
      uid,
      setTimeout(() => {
        this.graceTimers.delete(uid);
        if (this.connections.has(uid)) return;
        const r = this.roomOf(uid);
        if (!r) return;
        const seat = r.seats.find((s) => s.userId === uid);
        if (r.runner && seat) {
          seat.away = true;
          r.runner.setAway(seat.playerId, true);
          this.system(r, `${seat.name} disconnected — a bot is playing for them`);
          this.broadcastRoom(r);
        } else {
          this.leave(uid);
        }
      }, wait),
    );
  }

  /** Profile edits show up in rooms straight away. */
  updateUser(user: User) {
    const m = this.members.get(user.id);
    if (m) Object.assign(m, { name: user.displayName, avatar: user.avatar });
    const room = this.roomOf(user.id);
    if (!room) return;
    const seat = room.seats.find((s) => s.userId === user.id);
    if (seat && !room.runner) Object.assign(seat, { name: user.displayName, avatar: user.avatar });
    this.broadcastRoom(room);
  }

  pushChips(userId: string, chips: number) {
    this.io.to(`user:${userId}`).emit('me:chips', chips);
  }

  // ---------- room actions ----------

  private create(socket: Sock, input: CreateRoomInput, ack: Ack<{ roomId: string }>) {
    const uid = socket.data.userId;
    const game = getGame(String(input?.gameId));
    if (!game) return fail(ack, 'Unknown game');
    if (this.roomOf(uid)) this.leave(uid);
    if (this.roomOf(uid)) return fail(ack, 'Leave your current game first');
    const me = this.members.get(uid)!;
    const room: Room = {
      id: randomUUID().slice(0, 8),
      name: String(input.name ?? '').trim().slice(0, 40) || `${me.name}'s ${game.name}`,
      game,
      config: game.parseConfig(input.config) as Record<string, unknown>,
      hostId: uid,
      isPrivate: !!input.isPrivate,
      code: this.newCode(),
      seats: [],
      spectators: new Map(),
      chat: [],
      runner: null,
      lastResult: null,
    };
    this.rooms.set(room.id, room);
    this.seatHuman(room, me);
    this.enter(socket, room);
    ack({ ok: true, roomId: room.id });
  }

  private join(socket: Sock, target: { roomId?: string; code?: string }, ack: Ack<{ roomId: string }>) {
    const uid = socket.data.userId;
    const code = target.code?.trim().toUpperCase();
    const room = code
      ? [...this.rooms.values()].find((r) => r.code === code)
      : target.roomId
        ? this.rooms.get(target.roomId)
        : undefined;
    if (!room) return fail(ack, code ? 'No room with that code' : 'Room not found');
    if (room.isPrivate && !code && room.hostId !== uid && !room.seats.some((s) => s.userId === uid))
      return fail(ack, 'This room is private — ask for the invite code');

    const current = this.roomOf(uid);
    if (current && current !== room) {
      this.leave(uid);
      if (this.roomOf(uid)) return fail(ack, 'Leave your current game first');
    }

    const me = this.members.get(uid)!;
    const seat = room.seats.find((s) => s.userId === uid);
    if (seat) {
      // Coming back to a running game you left.
      if (seat.left || seat.away) {
        seat.left = seat.away = false;
        room.runner?.setAway(seat.playerId, false);
        this.system(room, `${seat.name} is back`);
      }
    } else if (!room.runner && room.seats.length < room.game.maxPlayers) {
      room.spectators.delete(uid);
      this.seatHuman(room, me);
    } else {
      room.spectators.set(uid, me);
      this.system(room, `${me.name} is watching`);
    }
    this.enter(socket, room);
    ack({ ok: true, roomId: room.id });
  }

  private spectate(socket: Sock, roomId: string | undefined, ack: Ack<{ roomId: string }>) {
    const uid = socket.data.userId;
    const room = roomId ? this.rooms.get(roomId) : undefined;
    if (!room || room.isPrivate) return fail(ack, 'Room not found');
    if (this.roomOf(uid) && this.roomOf(uid) !== room) this.leave(uid);
    if (this.roomOf(uid) === room) return ack({ ok: true, roomId: room.id });
    if (this.roomOf(uid)) return fail(ack, 'Leave your current game first');
    const me = this.members.get(uid)!;
    room.spectators.set(uid, me);
    this.system(room, `${me.name} is watching`);
    this.enter(socket, room);
    ack({ ok: true, roomId: room.id });
  }

  leave(uid: string, ack?: Ack) {
    const room = this.roomOf(uid);
    if (!room) return ack?.({ ok: true });
    this.userRoom.delete(uid);
    this.io.in(`user:${uid}`).socketsLeave(`room:${room.id}`);
    this.io.to(`user:${uid}`).emit('room:state', null);

    const name = this.members.get(uid)?.name ?? 'Someone';
    if (room.spectators.delete(uid)) {
      // just a spectator
    } else if (room.runner) {
      const seat = room.seats.find((s) => s.userId === uid)!;
      seat.left = seat.away = true;
      room.runner.setAway(seat.playerId, true);
      this.system(room, `${name} left — a bot takes their seat until the game ends`);
    } else {
      room.seats = room.seats.filter((s) => s.userId !== uid);
      this.system(room, `${name} left`);
    }

    if (room.hostId === uid) {
      const next = room.seats.find((s) => s.userId && !s.left)?.userId ?? [...room.spectators.keys()][0];
      if (next) room.hostId = next;
    }
    if (!this.hasHumans(room)) this.close(room);
    else this.broadcastRoom(room);
    this.lobbyChanged();
    ack?.({ ok: true });
  }

  private addBot(uid: string, ack: Ack) {
    const room = this.hostRoom(uid, ack);
    if (!room) return;
    if (room.runner) return fail(ack, 'Game already started');
    if (room.seats.length >= room.game.maxPlayers) return fail(ack, 'Table is full');
    room.seats.push(this.makeBot(room));
    this.broadcastRoom(room);
    this.lobbyChanged();
    ack({ ok: true });
  }

  private removeSeat(uid: string, index: number, ack: Ack) {
    const room = this.hostRoom(uid, ack);
    if (!room) return;
    if (room.runner) return fail(ack, 'Game already started');
    const seat = room.seats[index];
    if (!seat) return fail(ack, 'No such seat');
    if (seat.userId === uid) return fail(ack, 'Use Leave to leave the room');
    if (seat.userId) {
      this.leave(seat.userId);
      this.io.to(`user:${seat.userId}`).emit('notice', 'The host removed you from the room');
    } else {
      room.seats.splice(index, 1);
      this.broadcastRoom(room);
      this.lobbyChanged();
    }
    ack({ ok: true });
  }

  private async start(uid: string, ack: Ack) {
    const room = this.hostRoom(uid, ack);
    if (!room) return;
    if (room.runner) return fail(ack, 'Game already started');
    const { game } = room;
    if (game.fillWithBots) while (room.seats.length < game.maxPlayers) room.seats.push(this.makeBot(room));
    if (room.seats.length < game.minPlayers)
      return fail(ack, `${game.name} needs at least ${game.minPlayers} players — add bots or wait for friends`);

    const buyIn = game.buyIn(room.config);
    const humans = room.seats.filter((s) => s.userId);
    if (buyIn > 0) {
      try {
        const balances = await db.$transaction(async (tx) => {
          const out: [string, number][] = [];
          for (const s of humans) out.push([s.userId!, await adjustChips(tx, s.userId!, -buyIn, `${game.id} buy-in`)]);
          return out;
        });
        for (const [id, chips] of balances) this.pushChips(id, chips);
      } catch (err) {
        if (err instanceof InsufficientChips)
          return fail(ack, `${err.who} needs ${buyIn} chips to buy in — claim daily chips on the profile page`);
        throw err;
      }
    }
    if (room.runner || !this.rooms.has(room.id)) return fail(ack, 'Room changed, try again');

    room.lastResult = null;
    for (const s of room.seats) s.away = s.left = false;
    room.runner = new GameRunner(game, room.seats, room.config, {
      changed: () => this.pushGame(room),
      over: (result) => void this.finish(room, result).catch((e) => console.error('settle failed', e)),
    });
    this.system(room, `${game.name} started`);
    this.broadcastRoom(room);
    this.lobbyChanged();
    room.runner.start();
    ack({ ok: true });
  }

  private end(uid: string, ack: Ack) {
    const room = this.hostRoom(uid, ack);
    if (!room) return;
    if (!room.runner) return fail(ack, 'No game running');
    this.system(room, 'The host ended the game');
    room.runner.endEarly();
    ack({ ok: true });
  }

  private action(uid: string, action: unknown, ack: Ack) {
    const room = this.roomOf(uid);
    const seat = room?.seats.find((s) => s.userId === uid && !s.left);
    if (!room?.runner || !seat) return fail(ack, 'You are not playing');
    if (seat.away) {
      seat.away = false;
      room.runner.setAway(seat.playerId, false);
    }
    const error = room.runner.act(seat.playerId, action);
    if (error) return fail(ack, error);
    ack({ ok: true });
  }

  private chat(uid: string, text: unknown) {
    const room = this.roomOf(uid);
    const msg = typeof text === 'string' ? text.trim().slice(0, 300) : '';
    if (!room || !msg) return;
    const m = this.members.get(uid)!;
    this.pushChat(room, { id: randomUUID(), userId: uid, name: m.name, text: msg, at: Date.now() });
  }

  // ---------- game end ----------

  private async finish(room: Room, result: GameResult) {
    const runner = room.runner!;
    const { game } = room;
    const buyIn = game.buyIn(room.config);
    const bySeat = new Map(room.seats.map((s, i) => [s.playerId, { seat: s, index: i }]));
    const standings = result.standings.map((st) => {
      const { seat } = bySeat.get(st.playerId)!;
      return { ...st, seat, chipDelta: seat.userId ? st.payout - buyIn : 0 };
    });

    const balances = await db.$transaction(async (tx) => {
      const record = await tx.gameRecord.create({
        data: {
          gameId: game.id,
          roomName: room.name,
          config: JSON.stringify(room.config),
          summary: result.summary,
          startedAt: runner.startedAt,
        },
      });
      const out: [string, number][] = [];
      for (const st of standings) {
        const { seat } = st;
        await tx.gameParticipant.create({
          data: {
            recordId: record.id,
            userId: seat.userId,
            name: seat.name,
            seat: bySeat.get(st.playerId)!.index,
            placement: st.placement,
            score: st.score,
            chipDelta: st.chipDelta,
          },
        });
        if (!seat.userId) continue;
        const won = st.placement === 1 ? 1 : 0;
        await tx.userStats.upsert({
          where: { userId_gameId: { userId: seat.userId, gameId: game.id } },
          create: { userId: seat.userId, gameId: game.id, played: 1, won, netChips: st.chipDelta },
          update: { played: { increment: 1 }, won: { increment: won }, netChips: { increment: st.chipDelta } },
        });
        if (st.payout > 0) out.push([seat.userId, await adjustChips(tx, seat.userId, st.payout, `${game.id} payout`)]);
      }
      return out;
    });
    for (const [id, chips] of balances) this.pushChips(id, chips);

    const over: GameOver = {
      summary: result.summary,
      standings: standings.map((st) => ({
        playerId: st.playerId,
        name: st.seat.name,
        placement: st.placement,
        score: st.score,
        chipDelta: st.chipDelta,
      })),
    };
    room.lastResult = over;
    room.runner = null;
    this.io.to(`room:${room.id}`).emit('game:over', over);
    this.system(room, result.summary);

    // Players who left are gone now; everyone else is ready for a rematch.
    room.seats = room.seats.filter((s) => !s.left);
    for (const s of room.seats) s.away = false;
    if (!this.hasHumans(room)) return this.close(room);
    if (!room.seats.some((s) => s.userId === room.hostId)) {
      room.hostId = room.seats.find((s) => s.userId)?.userId ?? [...room.spectators.keys()][0];
    }
    this.broadcastRoom(room);
    this.lobbyChanged();
  }

  // ---------- helpers ----------

  private roomOf(uid: string): Room | undefined {
    const id = this.userRoom.get(uid);
    return id ? this.rooms.get(id) : undefined;
  }

  private hostRoom(uid: string, ack: Ack): Room | undefined {
    const room = this.roomOf(uid);
    if (!room) return void fail(ack, 'You are not in a room');
    if (room.hostId !== uid) return void fail(ack, 'Only the host can do that');
    return room;
  }

  private seatHuman(room: Room, m: Member) {
    room.seats.push({ playerId: m.userId, userId: m.userId, name: m.name, avatar: m.avatar, isBot: false, away: false, left: false });
    this.system(room, `${m.name} joined`);
  }

  private makeBot(room: Room): Seat {
    const used = new Set(room.seats.map((s) => s.name));
    const name = BOT_NAMES.map((n) => `${n} (bot)`).find((n) => !used.has(n)) ?? `Bot ${room.seats.length + 1}`;
    return {
      playerId: `bot:${randomUUID().slice(0, 8)}`,
      userId: null,
      name,
      avatar: BOT_AVATARS[room.seats.length % BOT_AVATARS.length],
      isBot: true,
      away: false,
      left: false,
    };
  }

  private enter(socket: Sock, room: Room) {
    const uid = socket.data.userId;
    this.userRoom.set(uid, room.id);
    this.io.in(`user:${uid}`).socketsJoin(`room:${room.id}`);
    this.broadcastRoom(room);
    this.io.to(`user:${uid}`).emit('chat:history', room.chat);
    if (room.runner) {
      const seat = room.seats.find((s) => s.userId === uid && !s.left);
      this.io.to(`user:${uid}`).emit('game:update', room.runner.update(seat ? seat.playerId : null));
    }
    this.lobbyChanged();
  }

  private hasHumans(room: Room) {
    return room.seats.some((s) => s.userId && !s.left) || room.spectators.size > 0;
  }

  private close(room: Room) {
    // Settle a running game so nobody loses their buy-in.
    if (room.runner && !room.runner.isOver) {
      room.runner.endEarly();
      return; // finish() calls close() again once settled
    }
    room.runner?.dispose();
    this.rooms.delete(room.id);
    for (const [uid, rid] of this.userRoom) if (rid === room.id) this.userRoom.delete(uid);
    this.lobbyChanged();
  }

  private pushGame(room: Room) {
    const runner = room.runner;
    if (!runner) return;
    for (const s of room.seats) {
      if (s.userId && !s.left) this.io.to(`user:${s.userId}`).emit('game:update', runner.update(s.playerId));
    }
    if (room.spectators.size) {
      const view = runner.update(null);
      for (const uid of room.spectators.keys()) this.io.to(`user:${uid}`).emit('game:update', view);
    }
  }

  private system(room: Room, text: string) {
    this.pushChat(room, { id: randomUUID(), userId: null, name: '', text, at: Date.now(), system: true });
  }

  private pushChat(room: Room, msg: ChatMessage) {
    room.chat.push(msg);
    if (room.chat.length > CHAT_KEEP) room.chat.splice(0, room.chat.length - CHAT_KEEP);
    this.io.to(`room:${room.id}`).emit('chat:message', msg);
  }

  private detail(room: Room): RoomDetail {
    const seats: SeatInfo[] = room.seats.map((s, i) => ({
      seat: i,
      userId: s.userId,
      playerId: s.playerId,
      name: s.name,
      avatar: s.avatar,
      isBot: s.isBot,
      away: s.away,
    }));
    return {
      id: room.id,
      name: room.name,
      gameId: room.game.id,
      config: room.config,
      buyIn: room.game.buyIn(room.config),
      hostId: room.hostId,
      isPrivate: room.isPrivate,
      code: room.code,
      status: room.runner ? 'playing' : 'waiting',
      seats,
      spectators: [...room.spectators.values()].map((m) => m.name),
      minPlayers: room.game.minPlayers,
      maxPlayers: room.game.maxPlayers,
      fillWithBots: !!room.game.fillWithBots,
      lastResult: room.lastResult,
    };
  }

  private broadcastRoom(room: Room) {
    this.io.to(`room:${room.id}`).emit('room:state', this.detail(room));
  }

  private summaries(): RoomSummary[] {
    return [...this.rooms.values()]
      .filter((r) => !r.isPrivate)
      .map((r) => ({
        id: r.id,
        name: r.name,
        gameId: r.game.id,
        hostName: this.members.get(r.hostId)?.name ?? '?',
        status: r.runner ? 'playing' : 'waiting',
        seated: r.seats.length,
        maxPlayers: r.game.maxPlayers,
        spectators: r.spectators.size,
      }));
  }

  /** Coalesce lobby broadcasts triggered by one event. */
  private lobbyChanged() {
    if (this.lobbyQueued) return;
    this.lobbyQueued = true;
    queueMicrotask(() => {
      this.lobbyQueued = false;
      this.io.emit('lobby:rooms', this.summaries());
    });
  }

  private newCode(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (;;) {
      const code = [...randomBytes(6)].map((b) => alphabet[b % alphabet.length]).join('');
      if (![...this.rooms.values()].some((r) => r.code === code)) return code;
    }
  }

  /** Run a handler, turning thrown errors into an ack instead of a crash. */
  private safe(ack: unknown, fn: (reply: Ack<any>) => unknown) {
    const reply: Ack<any> = typeof ack === 'function' ? (ack as Ack<any>) : () => {};
    const onError = (err: unknown) => {
      console.error(err);
      reply({ ok: false, error: 'Server error' });
    };
    try {
      const out = fn(reply);
      if (out instanceof Promise) out.catch(onError);
    } catch (err) {
      onError(err);
    }
  }
}
