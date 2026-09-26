import { existsSync } from 'node:fs';
import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { Server } from 'socket.io';
import type { ClientToServer, ServerToClient } from '@goc/shared';
import { userIdFromCookieHeader } from './auth.ts';
import { CLIENT_DIST, HOST, PORT } from './config.ts';
import { RoomManager } from './rooms/RoomManager.ts';
import { registerRoutes } from './routes.ts';

const app = Fastify({ logger: { level: 'warn' } });
await app.register(fastifyCookie);

const io = new Server<ClientToServer, ServerToClient, object, { userId: string }>(app.server, {
  // Same-origin in production; in dev Vite proxies /socket.io.
  cors: { origin: true, credentials: true },
});
io.use((socket, next) => {
  const userId = userIdFromCookieHeader(socket.handshake.headers.cookie);
  if (!userId) return next(new Error('unauthorized'));
  socket.data.userId = userId;
  next();
});

const rooms = new RoomManager(io);
io.on('connection', (socket) => {
  rooms.connect(socket).catch((err) => {
    console.error(err);
    socket.disconnect(true);
  });
});

registerRoutes(app, rooms);

// Serve the built client (npm run build) with SPA fallback.
if (existsSync(CLIENT_DIST)) {
  await app.register(fastifyStatic, { root: CLIENT_DIST, wildcard: false });
  app.setNotFoundHandler((req, reply) =>
    req.url.startsWith('/api') ? reply.code(404).send({ error: 'Not found' }) : reply.sendFile('index.html'),
  );
}

await app.listen({ port: PORT, host: HOST });
console.log(`GameOfCards server on http://localhost:${PORT}${existsSync(CLIENT_DIST) ? '' : ' (API only — run the client with npm run dev)'}`);
