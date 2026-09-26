import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AVATARS, CARD_BACKS, type Profile, cardBackAsset } from '@goc/shared';
import { api } from '../api.ts';
import { Avatar } from '../components/Avatar.tsx';
import { ChipIcon, fmt } from '../components/Chips.tsx';
import { useAuth } from '../store/auth.ts';
import { useGame } from '../store/game.ts';
import { useGames } from './Lobby.tsx';

export function ProfilePage() {
  const { username } = useParams();
  const me = useAuth((s) => s.me)!;
  const games = useGames();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');
  const isMe = username?.toLowerCase() === me.username.toLowerCase();

  useEffect(() => {
    setProfile(null);
    setError('');
    api<Profile>(`/users/${encodeURIComponent(username ?? '')}`).then(setProfile, (e) => setError(e.message));
  }, [username, me.displayName, me.avatar, me.chips]);

  if (error) return <p className="p-10 text-center text-ember">{error}</p>;
  if (!profile) return <p className="p-10 text-center text-cream/50">Loading…</p>;
  const gameName = (id: string) => games.find((g) => g.id === id)?.name ?? id;
  const totals = profile.stats.reduce((a, s) => ({ played: a.played + s.played, won: a.won + s.won }), { played: 0, won: 0 });

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <div className="panel flex flex-wrap items-center gap-5 p-5">
        <Avatar avatar={isMe ? me.avatar : profile.avatar} size={84} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-3xl text-gold-300">{isMe ? me.displayName : profile.displayName}</h1>
          <p className="text-sm text-cream/55">
            @{profile.username} · joined {new Date(profile.createdAt).toLocaleDateString()}
          </p>
          <div className="mt-2 flex flex-wrap gap-4 text-sm">
            <span className="flex items-center gap-1 font-bold text-gold-300">
              <ChipIcon /> {fmt(isMe ? me.chips : profile.chips)}
            </span>
            <span>
              <b>{totals.played}</b> <span className="text-cream/55">games</span>
            </span>
            <span>
              <b>{totals.won}</b> <span className="text-cream/55">wins</span>
            </span>
          </div>
        </div>
        {isMe && <MeActions />}
      </div>

      {isMe && <EditProfile />}

      <section>
        <h2 className="font-display text-2xl">Stats</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {games.map((g) => {
            const s = profile.stats.find((x) => x.gameId === g.id);
            return (
              <div key={g.id} className="panel p-4">
                <div className="font-semibold">{g.name}</div>
                <div className="mt-2 grid grid-cols-3 text-center">
                  <Stat label="played" value={s?.played ?? 0} />
                  <Stat label="won" value={s?.won ?? 0} />
                  <Stat
                    label={g.id === 'callbreak' ? 'win %' : 'net chips'}
                    value={
                      g.id === 'callbreak'
                        ? s?.played
                          ? `${Math.round((s.won / s.played) * 100)}%`
                          : '–'
                        : (s?.netChips ?? 0)
                    }
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="font-display text-2xl">Recent games</h2>
        <div className="panel mt-3 divide-y divide-white/5">
          {profile.recent.length === 0 && <p className="p-5 text-center text-cream/50">No games yet.</p>}
          {profile.recent.map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className={`w-10 font-bold ${r.placement === 1 ? 'text-gold-300' : 'text-cream/60'}`}>#{r.placement}</span>
              <span className="flex-1">
                {gameName(r.gameId)} <span className="text-cream/45">· {r.players} players</span>
              </span>
              {r.chipDelta !== 0 && (
                <span className={`font-semibold tabular-nums ${r.chipDelta > 0 ? 'text-felt-500' : 'text-ember'}`}>
                  {r.chipDelta > 0 ? '+' : ''}
                  {fmt(r.chipDelta)}
                </span>
              )}
              <span className="text-xs text-cream/45">{new Date(r.endedAt).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="text-xl font-bold tabular-nums">{typeof value === 'number' ? fmt(value) : value}</div>
      <div className="text-[11px] text-cream/50 uppercase">{label}</div>
    </div>
  );
}

function MeActions() {
  const { me, claimDaily, logout } = useAuth();
  const say = useGame((s) => s.say);
  const disconnect = useGame((s) => s.disconnect);
  const next = me!.nextTopUp ? new Date(me!.nextTopUp) : null;
  return (
    <div className="flex flex-col items-end gap-2">
      <button className="btn-gold" disabled={!!next} onClick={() => claimDaily().then(() => say('+1,000 chips!'), (e) => say(e.message))}>
        {next ? `Daily chips at ${next.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Claim daily 1,000'}
      </button>
      <button
        className="btn-ghost py-1 text-xs"
        onClick={async () => {
          disconnect();
          await logout();
        }}
      >
        Log out
      </button>
    </div>
  );
}

function EditProfile() {
  const { me, update } = useAuth();
  const say = useGame((s) => s.say);
  const [name, setName] = useState(me!.displayName);
  const [tab, setTab] = useState<'avatar' | 'back'>('avatar');
  const save = (patch: Parameters<typeof update>[0]) => update(patch).catch((e) => say(e.message));

  return (
    <section className="panel p-5">
      <h2 className="font-display text-2xl">Customize</h2>
      <form
        className="mt-3 flex max-w-md gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          save({ displayName: name }).then(() => say('Saved'));
        }}
      >
        <input className="input" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} />
        <button className="btn-gold" disabled={!name.trim() || name === me!.displayName}>
          Save name
        </button>
      </form>
      <div className="mt-5 flex gap-1 text-sm font-semibold">
        {(['avatar', 'back'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-md px-3 py-1.5 ${tab === t ? 'bg-white/10 text-gold-300' : 'text-cream/60'}`}>
            {t === 'avatar' ? 'Avatar' : 'Card back'}
          </button>
        ))}
      </div>
      {tab === 'avatar' ? (
        <div className="mt-3 grid max-h-72 grid-cols-[repeat(auto-fill,minmax(48px,1fr))] gap-2 overflow-y-auto pr-1">
          {AVATARS.map((a) => (
            <button key={a} onClick={() => save({ avatar: a })} className={`rounded-full ${me!.avatar === a ? 'ring-2 ring-gold-400' : ''}`}>
              <Avatar avatar={a} size={48} />
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-3">
          {CARD_BACKS.map((b) => (
            <button
              key={b}
              onClick={() => save({ cardBack: b })}
              className={`rounded-md transition hover:-translate-y-1 ${me!.cardBack === b ? 'ring-4 ring-gold-400' : ''}`}
            >
              <img src={cardBackAsset(b)} alt={b} className="w-14" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
