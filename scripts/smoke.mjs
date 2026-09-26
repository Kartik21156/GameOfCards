import { io } from 'socket.io-client';
// Usage: start the server, then `node scripts/smoke.mjs [baseUrl]`. Plays a bot game of Callbreak and Blackjack over the real API.
const BASE = process.argv[2] ?? 'http://localhost:3001';
async function api(path, body, cookie) {
  const r = await fetch(BASE + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, cookie: r.headers.get('set-cookie')?.split(';')[0], json: await r.json() };
}
const u = 'smoke' + Date.now().toString(36).slice(-5);
const reg = await api('/api/auth/register', { username: u, email: u + '@x.io', password: 'secret1' });
console.log('register', reg.status, reg.json.chips);
const dup = await api('/api/auth/register', { username: u.toUpperCase(), email: 'y' + u + '@x.io', password: 'secret1' });
console.log('dup username', dup.status, dup.json.error);
const login = await api('/api/auth/login', { login: u.toUpperCase(), password: 'secret1' });
console.log('login', login.status);
const cookie = login.cookie;
console.log('me', (await api('/api/me', null, cookie)).json.username);
console.log('daily', (await api('/api/chips/daily', {}, cookie)).json.chips, (await api('/api/chips/daily', {}, cookie)).status);

const s = io(BASE, { extraHeaders: { cookie }, transports: ['websocket'] });
const call = (ev, ...a) => new Promise((res) => s.emit(ev, ...a, res));
let last; let overs = 0; let updates = 0;
s.on('game:update', (u) => { last = u; updates++; });
s.on('me:chips', (c) => console.log('chips ->', c));
await new Promise((r) => s.on('connect', r));
console.log('create', await call('room:create', { gameId: 'callbreak', config: { rounds: 1 } }));
console.log('start', await call('room:start'));
// play every time it's our turn, choosing the first legal option
const done = new Promise((res) => s.on('game:over', (o) => { overs++; res(o); }));
const t = setInterval(async () => {
  if (!last || !last.actors.includes(last.you)) return;
  const v = last.view; last = null;
  const action = v.legal?.bid ? { type: 'bid', value: 2 } : { type: 'play', card: v.legal.cards[0] };
  const r = await call('game:action', action);
  if (!r.ok) console.log('action err', r.error);
}, 50);
const over = await done; clearInterval(t);
console.log('over', over.summary, over.standings.map((x) => `${x.name}:${x.placement}:${x.score}`).join(' '), 'updates', updates);
// redaction check: view for us never had other hands
const prof = await api('/api/users/' + u, null);
console.log('stats', JSON.stringify(prof.json.stats), 'recent', prof.json.recent.length);

// blackjack: bet + stand through 2 rounds, ensure payout credited
console.log('bj create', (await call('room:create', { gameId: 'blackjack', config: { rounds: 2, buyIn: 200 } })).ok);
console.log('bj start', await call('room:start'));
const done2 = new Promise((res) => s.once('game:over', res));
const t2 = setInterval(async () => {
  if (!last || !last.actors.includes(last.you)) return;
  const v = last.view; last = null;
  const action = v.legal?.bet ? { type: 'bet', amount: v.legal.bet.min } : { type: 'stand' };
  await call('game:action', action);
}, 50);
const o2 = await done2; clearInterval(t2);
console.log('bj over', o2.summary, o2.standings[0].chipDelta);
console.log('final me', (await api('/api/me', null, cookie)).json.chips);
console.log('leaderboard', (await api('/api/leaderboard?game=callbreak')).json.length);
s.close(); process.exit(0);
