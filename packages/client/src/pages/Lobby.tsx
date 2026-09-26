import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { GameInfo } from '@goc/engine';
import { Card } from '../components/Card.tsx';
import { ChipIcon, fmt } from '../components/Chips.tsx';
import { api } from '../api.ts';
import { clientGames } from '../games/registry.ts';
import { useAuth } from '../store/auth.ts';
import { useGame } from '../store/game.ts';

export function useGames() {
  const [games, setGames] = useState<GameInfo[]>([]);
  useEffect(() => {
    api<GameInfo[]>('/games').then(setGames).catch(() => {});
  }, []);
  return games;
}

export function LobbyPage() {
  const games = useGames();
  const rooms = useGame((s) => s.rooms);
  const { join, spectate, say } = useGame();
  const me = useAuth((s) => s.me)!;
  const claimDaily = useAuth((s) => s.claimDaily);
  const nav = useNavigate();
  const [creating, setCreating] = useState<GameInfo | null>(null);
  const [code, setCode] = useState('');

  const go = async (p: Promise<{ ok: boolean; error?: string; roomId?: string }>) => {
    const r = await p;
    if (r.ok && r.roomId) nav(`/room/${r.roomId}`);
    else if (!r.ok) say(r.error!);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6">
      {!me.nextTopUp && (
        <div className="panel flex flex-wrap items-center gap-3 p-3 pl-4">
          <ChipIcon className="h-6 w-6" />
          <span className="flex-1 text-sm">Your daily chips are ready.</span>
          <button className="btn-gold py-1.5" onClick={() => claimDaily().then(() => say('+1,000 chips!'), (e) => say(e.message))}>
            Claim 1,000
          </button>
        </div>
      )}

      <section>
        <h1 className="font-display text-3xl text-gold-300 sm:text-4xl">Pick a table</h1>
        <p className="mt-1 text-cream/60">Start a game and invite friends; bots fill any empty seats.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {games.map((g) => {
            const ui = clientGames[g.id];
            return (
              <motion.button
                key={g.id}
                whileHover={{ y: -4 }}
                onClick={() => setCreating(g)}
                className="panel group relative overflow-hidden p-5 text-left transition hover:ring-gold-400/60"
              >
                <div className="relative mb-4 flex h-28 items-end justify-center">
                  {(ui?.showcase ?? []).map((c, i, all) => (
                    <div
                      key={c}
                      className="absolute bottom-0 transition-transform duration-300 group-hover:scale-105"
                      style={{ transform: `translateX(${(i - (all.length - 1) / 2) * 26}px) rotate(${(i - (all.length - 1) / 2) * 9}deg)`, transformOrigin: '50% 130%' }}
                    >
                      <Card code={c} />
                    </div>
                  ))}
                </div>
                <h2 className="font-display text-2xl">{g.name}</h2>
                <p className="mt-0.5 text-sm text-cream/60">{ui?.tagline ?? g.description}</p>
                <span className="btn-gold mt-4 w-full">Create table</span>
              </motion.button>
            );
          })}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          <h2 className="font-display text-2xl">Open tables</h2>
          <div className="mt-3 space-y-2">
            {rooms.length === 0 && <p className="panel p-6 text-center text-cream/50">No public tables right now. Create one!</p>}
            {rooms.map((r) => {
              const g = games.find((x) => x.id === r.gameId);
              const full = r.seated >= r.maxPlayers;
              return (
                <div key={r.id} className="panel flex flex-wrap items-center gap-3 p-3 pl-4">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{r.name}</div>
                    <div className="text-xs text-cream/55">
                      {g?.name ?? r.gameId} · host {r.hostName} · {r.seated}/{r.maxPlayers} seated
                      {r.spectators > 0 && ` · ${r.spectators} watching`}
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${
                      r.status === 'playing' ? 'bg-ember/25 text-ember' : 'bg-felt-500/25 text-felt-500'
                    }`}
                  >
                    {r.status === 'playing' ? 'in game' : 'waiting'}
                  </span>
                  {r.status === 'waiting' && !full && (
                    <button className="btn-gold py-1.5" onClick={() => go(join({ roomId: r.id }))}>
                      Join
                    </button>
                  )}
                  <button className="btn-ghost py-1.5" onClick={() => go(spectate(r.id))}>
                    Watch
                  </button>
                </div>
              );
            })}
          </div>
        </div>
        <div className="panel h-fit p-4">
          <h2 className="font-display text-xl">Have an invite code?</h2>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (code.trim()) go(join({ code }));
            }}
          >
            <input className="input font-mono tracking-widest uppercase" placeholder="ABC123" value={code} maxLength={6} onChange={(e) => setCode(e.target.value)} />
            <button className="btn-gold">Join</button>
          </form>
          <p className="mt-4 text-xs text-cream/50">
            Balance: <b className="text-gold-300">{fmt(me.chips)}</b> chips. Poker and Blackjack buy-ins come out of your balance; whatever you finish with comes back.
          </p>
        </div>
      </section>

      <AnimatePresence>{creating && <CreateDialog game={creating} onClose={() => setCreating(null)} onCreated={(id) => nav(`/room/${id}`)} />}</AnimatePresence>
    </div>
  );
}

function CreateDialog({ game, onClose, onCreated }: { game: GameInfo; onClose(): void; onCreated(id: string): void }) {
  const ui = clientGames[game.id];
  const defaults = game.defaultConfig as Record<string, number>;
  const fields = ui?.configFields ?? Object.keys(defaults).map((key) => ({ key, label: key, min: 0, max: 1e9 }));
  const [config, setConfig] = useState<Record<string, number>>({ ...defaults });
  const [name, setName] = useState('');
  const [isPrivate, setPrivate] = useState(false);
  const [error, setError] = useState('');
  const create = useGame((s) => s.create);

  return (
    <motion.div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.form
        initial={{ scale: 0.95, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        className="panel max-h-[90vh] w-full max-w-md overflow-y-auto bg-felt-900/95 p-5"
        onClick={(e) => e.stopPropagation()}
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await create({ gameId: game.id, name, isPrivate, config });
          if (r.ok) onCreated(r.roomId);
          else setError(r.error);
        }}
      >
        <h2 className="font-display text-2xl text-gold-300">New {game.name} table</h2>
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-cream/60">
          {ui?.rules.map((r) => <li key={r}>{r}</li>)}
        </ul>
        <label className="mt-4 block">
          <span className="label">Table name</span>
          <input className="input mt-1" placeholder="Friday night" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {fields.map((f) => (
            <label key={f.key} className="block">
              <span className="label">{f.label}</span>
              <input
                type="number"
                className="input mt-1"
                min={f.min}
                max={f.max}
                step={f.step ?? 1}
                value={config[f.key] ?? ''}
                onChange={(e) => setConfig({ ...config, [f.key]: Number(e.target.value) })}
              />
              {f.hint && <span className="text-[11px] text-cream/45">{f.hint}</span>}
            </label>
          ))}
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isPrivate} onChange={(e) => setPrivate(e.target.checked)} className="accent-gold-400" />
          Private table — only people with the invite code can join
        </label>
        {error && <p className="mt-3 text-sm text-ember">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-gold">Create</button>
        </div>
      </motion.form>
    </motion.div>
  );
}
