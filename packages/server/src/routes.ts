import type { FastifyInstance } from 'fastify';
import { listGames } from '@goc/engine';
import { AVATARS, CARD_BACKS, type LeaderboardRow, type Profile, USERNAME_RE } from '@goc/shared';
import {
  DAILY_TOP_UP,
  checkPassword,
  clearSession,
  hashPassword,
  nextTopUp,
  requireUser,
  setSession,
  toMe,
} from './auth.ts';
import { adjustChips } from './chips.ts';
import { db } from './db.ts';
import type { RoomManager } from './rooms/RoomManager.ts';

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

export function registerRoutes(app: FastifyInstance, rooms: RoomManager) {
  app.post('/api/auth/register', async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const username = str(body.username);
    const email = str(body.email).toLowerCase();
    const password = typeof body.password === 'string' ? body.password : '';
    const displayName = str(body.displayName) || username;
    if (!USERNAME_RE.test(username))
      return reply.code(400).send({ error: 'Username must be 3–20 letters, numbers or underscores' });
    if (!/^\S+@\S+\.\S+$/.test(email)) return reply.code(400).send({ error: 'Enter a valid email' });
    if (password.length < 6) return reply.code(400).send({ error: 'Password must be at least 6 characters' });
    if (displayName.length > 24) return reply.code(400).send({ error: 'Display name is too long' });

    const usernameKey = username.toLowerCase();
    const taken = await db.user.findFirst({ where: { OR: [{ usernameKey }, { email }] } });
    if (taken) {
      const what = taken.email === email ? 'email' : 'username';
      return reply.code(409).send({ error: `That ${what} is already registered` });
    }

    const avatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];
    const user = await db.user.create({
      data: { username, usernameKey, email, displayName, avatar, passwordHash: await hashPassword(password) },
    });
    await db.chipTransaction.create({ data: { userId: user.id, amount: user.chips, reason: 'signup', balance: user.chips } });
    setSession(reply, user.id);
    return toMe(user);
  });

  app.post('/api/auth/login', async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const login = str(body.login).toLowerCase();
    const password = typeof body.password === 'string' ? body.password : '';
    const user = await db.user.findFirst({ where: { OR: [{ email: login }, { usernameKey: login }] } });
    if (!user || !(await checkPassword(user.passwordHash, password)))
      return reply.code(401).send({ error: 'Wrong username/email or password' });
    setSession(reply, user.id);
    return toMe(user);
  });

  app.post('/api/auth/logout', async (_req, reply) => {
    clearSession(reply);
    return { ok: true };
  });

  app.get('/api/me', { preHandler: requireUser }, async (req) => toMe(req.user));

  app.patch('/api/me', { preHandler: requireUser }, async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const data: { displayName?: string; avatar?: string; cardBack?: string } = {};
    if (body.displayName !== undefined) {
      const d = str(body.displayName);
      if (!d || d.length > 24) return reply.code(400).send({ error: 'Display name must be 1–24 characters' });
      data.displayName = d;
    }
    if (body.avatar !== undefined) {
      if (!AVATARS.includes(str(body.avatar))) return reply.code(400).send({ error: 'Unknown avatar' });
      data.avatar = str(body.avatar);
    }
    if (body.cardBack !== undefined) {
      if (!CARD_BACKS.includes(str(body.cardBack))) return reply.code(400).send({ error: 'Unknown card back' });
      data.cardBack = str(body.cardBack);
    }
    const user = await db.user.update({ where: { id: req.user.id }, data });
    rooms.updateUser(user);
    return toMe(user);
  });

  app.post('/api/chips/daily', { preHandler: requireUser }, async (req, reply) => {
    if (nextTopUp(req.user)) return reply.code(429).send({ error: 'Daily chips already claimed' });
    const user = await db.$transaction(async (tx) => {
      // Re-check inside the transaction so double clicks can't claim twice.
      const fresh = await tx.user.findUniqueOrThrow({ where: { id: req.user.id } });
      if (nextTopUp(fresh)) return null;
      await tx.user.update({ where: { id: fresh.id }, data: { lastTopUp: new Date() } });
      await adjustChips(tx, fresh.id, DAILY_TOP_UP, 'daily');
      return tx.user.findUniqueOrThrow({ where: { id: fresh.id } });
    });
    if (!user) return reply.code(429).send({ error: 'Daily chips already claimed' });
    rooms.pushChips(user.id, user.chips);
    return toMe(user);
  });

  app.get('/api/games', async () => listGames());

  app.get('/api/users/:username', async (req, reply) => {
    const { username } = req.params as { username: string };
    const user = await db.user.findUnique({
      where: { usernameKey: username.toLowerCase() },
      include: {
        stats: true,
        games: { orderBy: { record: { endedAt: 'desc' } }, take: 20, include: { record: { include: { _count: { select: { participants: true } } } } } },
      },
    });
    if (!user) return reply.code(404).send({ error: 'No such player' });
    const profile: Profile = {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatar: user.avatar,
      cardBack: user.cardBack,
      chips: user.chips,
      createdAt: user.createdAt.toISOString(),
      stats: user.stats.map((s) => ({ gameId: s.gameId, played: s.played, won: s.won, netChips: s.netChips })),
      recent: user.games.map((g) => ({
        id: g.recordId,
        gameId: g.record.gameId,
        endedAt: g.record.endedAt.toISOString(),
        placement: g.placement,
        score: g.score,
        chipDelta: g.chipDelta,
        players: g.record._count.participants,
      })),
    };
    return profile;
  });

  app.get('/api/leaderboard', async (req) => {
    const { game } = req.query as { game?: string };
    if (game) {
      const rows = await db.userStats.findMany({
        where: { gameId: game, played: { gt: 0 } },
        include: { user: true },
        orderBy: [{ won: 'desc' }, { netChips: 'desc' }],
        take: 50,
      });
      return rows.map<LeaderboardRow>((r) => ({
        username: r.user.username,
        displayName: r.user.displayName,
        avatar: r.user.avatar,
        chips: r.user.chips,
        played: r.played,
        won: r.won,
        netChips: r.netChips,
      }));
    }
    const users = await db.user.findMany({ orderBy: { chips: 'desc' }, take: 50, include: { stats: true } });
    return users.map<LeaderboardRow>((u) => ({
      username: u.username,
      displayName: u.displayName,
      avatar: u.avatar,
      chips: u.chips,
      played: u.stats.reduce((s, x) => s + x.played, 0),
      won: u.stats.reduce((s, x) => s + x.won, 0),
      netChips: u.stats.reduce((s, x) => s + x.netChips, 0),
    }));
  });
}
