import { type Socket, io } from 'socket.io-client';
import { create } from 'zustand';
import type {
  AckResult,
  ChatMessage,
  ClientToServer,
  CreateRoomInput,
  GameOver,
  GameUpdate,
  RoomDetail,
  RoomSummary,
  ServerToClient,
} from '@goc/shared';
import { useAuth } from './auth.ts';

type Sock = Socket<ServerToClient, ClientToServer>;

interface GameState {
  socket: Sock | null;
  connected: boolean;
  rooms: RoomSummary[];
  room: RoomDetail | null;
  update: GameUpdate | null;
  chat: ChatMessage[];
  over: GameOver | null;
  notice: string | null;

  connect(): void;
  disconnect(): void;
  dismissOver(): void;
  clearNotice(): void;
  say(text: string): void;

  create(input: CreateRoomInput): Promise<AckResult<{ roomId: string }>>;
  join(target: { roomId?: string; code?: string }): Promise<AckResult<{ roomId: string }>>;
  spectate(roomId: string): Promise<AckResult<{ roomId: string }>>;
  leave(): Promise<AckResult>;
  addBot(): Promise<AckResult>;
  removeSeat(seat: number): Promise<AckResult>;
  start(): Promise<AckResult>;
  end(): Promise<AckResult>;
  act(action: unknown): Promise<AckResult>;
  sendChat(text: string): void;
}

const TIMEOUT = 8000;

export const useGame = create<GameState>((set, get) => {
  /** Emit with an ack, resolving to an error result if the server never answers. */
  function call<T>(event: keyof ClientToServer, ...args: unknown[]): Promise<AckResult<T>> {
    const socket = get().socket;
    if (!socket?.connected) return Promise.resolve({ ok: false, error: 'Not connected to the server' });
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ ok: false, error: 'The server did not respond' }), TIMEOUT);
      (socket.emit as (...a: unknown[]) => void)(event, ...args, (res: AckResult<T>) => {
        clearTimeout(timer);
        resolve(res);
      });
    });
  }

  return {
    socket: null,
    connected: false,
    rooms: [],
    room: null,
    update: null,
    chat: [],
    over: null,
    notice: null,

    connect() {
      if (get().socket) return;
      const socket: Sock = io({ withCredentials: true });
      socket.on('connect', () => set({ connected: true }));
      socket.on('disconnect', () => set({ connected: false }));
      socket.on('connect_error', (err) => {
        set({ connected: false });
        // Session expired: drop back to the login screen.
        if (err.message === 'unauthorized') useAuth.getState().load();
      });
      socket.on('lobby:rooms', (rooms) => set({ rooms }));
      socket.on('room:state', (room) =>
        set((s) => {
          if (!room) return { room: null, update: null, chat: [], over: null };
          const started = room.status === 'playing' && s.room?.status !== 'playing';
          return { room, ...(started ? { over: null } : {}), ...(room.id !== s.room?.id ? { update: null } : {}) };
        }),
      );
      socket.on('game:update', (update) => set({ update }));
      socket.on('game:over', (over) => set({ over }));
      socket.on('chat:history', (chat) => set({ chat }));
      socket.on('chat:message', (m) => set((s) => ({ chat: [...s.chat.slice(-99), m] })));
      socket.on('me:chips', (chips) => useAuth.getState().setChips(chips));
      socket.on('notice', (notice) => set({ notice }));
      set({ socket });
    },

    disconnect() {
      get().socket?.close();
      set({ socket: null, connected: false, room: null, update: null, chat: [], over: null });
    },

    dismissOver: () => set({ over: null }),
    clearNotice: () => set({ notice: null }),
    say: (notice) => set({ notice }),

    create: (input) => call('room:create', input),
    join: (target) => call('room:join', target),
    spectate: (roomId) => call('room:spectate', { roomId }),
    leave: () => call('room:leave'),
    addBot: () => call('room:addBot'),
    removeSeat: (seat) => call('room:removeSeat', seat),
    start: () => call('room:start'),
    end: () => call('room:end'),
    act: (action) => call('game:action', action),
    sendChat(text) {
      get().socket?.emit('chat:send', text);
    },
  };
});
