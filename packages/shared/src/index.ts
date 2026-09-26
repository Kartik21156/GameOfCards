/**
 * Types shared by server and client: REST payloads, room state and the
 * Socket.IO event contract. Game-specific views come from @goc/engine.
 */

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  cardBack: string;
}

export interface Me extends PublicUser {
  email: string;
  chips: number;
  /** ISO time when the next daily top-up becomes available (null = now). */
  nextTopUp: string | null;
}

export interface GameStat {
  gameId: string;
  played: number;
  won: number;
  netChips: number;
}

export interface RecentGame {
  id: string;
  gameId: string;
  endedAt: string;
  placement: number;
  score: number;
  chipDelta: number;
  players: number;
}

export interface Profile extends PublicUser {
  chips: number;
  createdAt: string;
  stats: GameStat[];
  recent: RecentGame[];
}

export interface LeaderboardRow {
  username: string;
  displayName: string;
  avatar: string;
  chips: number;
  played: number;
  won: number;
  netChips: number;
}

export type RoomStatus = 'waiting' | 'playing' | 'finished';

export interface SeatInfo {
  seat: number;
  /** Null for bots. */
  userId: string | null;
  /** The engine's player id for this seat once a game is running. */
  playerId: string;
  name: string;
  avatar: string;
  isBot: boolean;
  /** A human seat currently played by a bot because they disconnected. */
  away: boolean;
}

export interface RoomSummary {
  id: string;
  name: string;
  gameId: string;
  hostName: string;
  status: RoomStatus;
  seated: number;
  maxPlayers: number;
  spectators: number;
}

export interface Standing {
  playerId: string;
  name: string;
  placement: number;
  score: number;
  /** Net change in the player's account chips. */
  chipDelta: number;
}

export interface GameOver {
  summary: string;
  standings: Standing[];
}

export interface RoomDetail {
  id: string;
  name: string;
  gameId: string;
  config: Record<string, unknown>;
  buyIn: number;
  hostId: string;
  isPrivate: boolean;
  /** Invite code for private rooms (only sent to people in the room). */
  code: string;
  status: RoomStatus;
  seats: SeatInfo[];
  spectators: string[];
  minPlayers: number;
  maxPlayers: number;
  fillWithBots: boolean;
  lastResult: GameOver | null;
}

export interface ChatMessage {
  id: string;
  userId: string | null;
  name: string;
  text: string;
  at: number;
  system?: boolean;
}

export interface GameUpdate {
  gameId: string;
  /** The engine's redacted view for this recipient. */
  view: unknown;
  /** Your engine player id, or null when spectating. */
  you: string | null;
  /** Players whose move it is. */
  actors: string[];
  /** Turn-timer expiry (epoch ms) per human actor. */
  deadlines: Record<string, number>;
}

export type AckResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };
export type Ack<T = object> = (res: AckResult<T>) => void;

export interface CreateRoomInput {
  gameId: string;
  name?: string;
  isPrivate?: boolean;
  config?: Record<string, unknown>;
}

export interface ClientToServer {
  'lobby:list': (ack: (rooms: RoomSummary[]) => void) => void;
  'room:create': (input: CreateRoomInput, ack: Ack<{ roomId: string }>) => void;
  /** Join by room id or by private invite code. */
  'room:join': (target: { roomId?: string; code?: string }, ack: Ack<{ roomId: string }>) => void;
  'room:spectate': (target: { roomId: string }, ack: Ack<{ roomId: string }>) => void;
  'room:leave': (ack?: Ack) => void;
  'room:addBot': (ack: Ack) => void;
  'room:removeSeat': (seat: number, ack: Ack) => void;
  'room:start': (ack: Ack) => void;
  /** Host ends a running game early; chips still in play are settled. */
  'room:end': (ack: Ack) => void;
  'game:action': (action: unknown, ack: Ack) => void;
  'chat:send': (text: string) => void;
}

export interface ServerToClient {
  'lobby:rooms': (rooms: RoomSummary[]) => void;
  /** Null when you are no longer in a room. */
  'room:state': (room: RoomDetail | null) => void;
  'game:update': (update: GameUpdate) => void;
  'game:over': (result: GameOver) => void;
  'chat:history': (messages: ChatMessage[]) => void;
  'chat:message': (message: ChatMessage) => void;
  'me:chips': (chips: number) => void;
  notice: (text: string) => void;
}

// ---------- assets ----------

const SUIT_NAMES: Record<string, string> = { S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs' };

/** "HT" -> "/assets/cards/cardHearts10.png" */
export function cardAsset(code: string): string {
  const rank = code[1] === 'T' ? '10' : code[1];
  return `/assets/cards/card${SUIT_NAMES[code[0]]}${rank}.png`;
}

export const cardBackAsset = (back: string) => `/assets/cards/${back}.png`;
export const avatarAsset = (avatar: string) => `/assets/avatars/${avatar}.png`;

export const CARD_BACKS = (['blue', 'green', 'red'] as const).flatMap((c) =>
  [1, 2, 3, 4, 5].map((n) => `cardBack_${c}${n}`),
);

export const AVATARS = (['Black', 'Blue', 'Green', 'Purple', 'Red', 'White', 'Yellow'] as const).flatMap((c) =>
  Array.from({ length: 19 }, (_, i) => `piece${c}_single${String(i).padStart(2, '0')}`),
);

export const DAILY_TOP_UP = 1000;
export const STARTING_CHIPS = 5000;
export const TURN_SECONDS = 30;

export const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
