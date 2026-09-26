import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { RoomDetail } from '@goc/shared';
import { Avatar } from '../components/Avatar.tsx';
import { Chat } from '../components/Chat.tsx';
import { ChipIcon, fmt } from '../components/Chips.tsx';
import { ResultsModal } from '../components/ResultsModal.tsx';
import { clientGames } from '../games/registry.ts';
import { useAuth } from '../store/auth.ts';
import { useGame } from '../store/game.ts';
import { useGames } from './Lobby.tsx';

/** /join/:code — join a private table by invite link. */
export function JoinByCode() {
  const { code } = useParams();
  const { join, connected } = useGame();
  const nav = useNavigate();
  const [error, setError] = useState('');
  useEffect(() => {
    if (!connected || !code) return;
    join({ code }).then((r) => (r.ok ? nav(`/room/${r.roomId}`, { replace: true }) : setError(r.error)));
  }, [connected, code, join, nav]);
  return <Centered>{error ? <Failed error={error} /> : 'Joining…'}</Centered>;
}

export function RoomPage() {
  const { id } = useParams();
  const { room, update, over, connected, join, leave, start, end, act, dismissOver, say } = useGame();
  const me = useAuth((s) => s.me)!;
  const nav = useNavigate();
  const [error, setError] = useState('');
  const tried = useRef<string | null>(null);

  // Arriving by URL: join (or rejoin) the room.
  useEffect(() => {
    if (!connected || !id || room?.id === id || tried.current === id) return;
    tried.current = id;
    join({ roomId: id }).then((r) => !r.ok && setError(r.error));
  }, [connected, id, room?.id, join]);

  if (error) return <Centered><Failed error={error} /></Centered>;
  if (!room || room.id !== id) return <Centered>{connected ? 'Joining table…' : 'Connecting…'}</Centered>;

  const ui = clientGames[room.gameId];
  const isHost = room.hostId === me.id;
  const playing = room.status === 'playing' && update && update.gameId === room.gameId;
  const Table = ui?.Table;

  const doLeave = async () => {
    await leave();
    nav('/');
  };
  const run = (p: Promise<{ ok: boolean; error?: string }>) => p.then((r) => !r.ok && say(r.error!));

  return (
    <div className="mx-auto max-w-[1400px] px-3 py-4 sm:px-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-2xl text-gold-300">{room.name}</h1>
          <div className="text-xs text-cream/55">
            {ui ? room.gameId[0].toUpperCase() + room.gameId.slice(1) : room.gameId}
            {room.buyIn > 0 && <> · buy-in {fmt(room.buyIn)}</>}
            {room.spectators.length > 0 && <> · watching: {room.spectators.join(', ')}</>}
          </div>
        </div>
        <InviteButton room={room} />
        {isHost && playing && <EndButton onEnd={() => run(end())} />}
        <button className="btn-ghost py-1.5 text-xs" onClick={doLeave}>
          Leave
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          {playing && Table ? (
            <Table
              view={update.view}
              you={update.you}
              actors={update.actors}
              deadlines={update.deadlines}
              seats={room.seats}
              room={room}
              act={act}
            />
          ) : room.status === 'playing' ? (
            <Centered>Loading table…</Centered>
          ) : (
            <WaitingRoom room={room} isHost={isHost} />
          )}
        </div>
        <Chat className="h-[340px] lg:h-[calc(100vh-150px)] lg:max-h-[760px]" />
      </div>

      <ResultsModal
        over={over}
        you={me.id}
        showChips={!!ui?.chips}
        isHost={isHost}
        onClose={dismissOver}
        onRematch={() => {
          dismissOver();
          run(start());
        }}
      />
    </div>
  );
}

/** Two-step button: the first click arms it for a few seconds. */
function EndButton({ onEnd }: { onEnd(): void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      className={`${armed ? 'btn-danger' : 'btn-ghost'} py-1.5 text-xs`}
      title="Chips in play are settled as they stand"
      onClick={() => (armed ? onEnd() : setArmed(true))}
    >
      {armed ? 'Click again to end' : 'End game'}
    </button>
  );
}

function WaitingRoom({ room, isHost }: { room: RoomDetail; isHost: boolean }) {
  const { addBot, removeSeat, start, say } = useGame();
  const me = useAuth((s) => s.me)!;
  const games = useGames();
  const info = games.find((g) => g.id === room.gameId);
  const ui = clientGames[room.gameId];
  const [busy, setBusy] = useState(false);
  const empty = Math.max(0, room.maxPlayers - room.seats.length);
  const run = async (p: Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true);
    const r = await p;
    setBusy(false);
    if (!r.ok) say(r.error!);
  };

  return (
    <div className="felt-table rounded-[40px] p-5 sm:p-8">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="font-display text-3xl">{info?.name ?? room.gameId}</h2>
        <span className="text-sm text-cream/60">
          {room.seats.length}/{room.maxPlayers} seated
        </span>
      </div>
      <p className="mt-1 text-sm text-cream/70">
        {room.fillWithBots
          ? 'Empty seats are filled with bots when the game starts.'
          : `Needs ${room.minPlayers}+ players. The host can add bots.`}
        {room.buyIn > 0 && (
          <span className="ml-1 inline-flex items-center gap-1">
            Buy-in <ChipIcon className="h-3.5 w-3.5" /> <b className="text-gold-300">{fmt(room.buyIn)}</b>.
          </span>
        )}
      </p>

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {room.seats.map((s) => (
          <div key={s.playerId} className="flex items-center gap-3 rounded-xl bg-black/25 px-3 py-2">
            <Avatar avatar={s.avatar} size={36} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{s.name}</div>
              <div className="text-xs text-cream/50">
                {s.userId === room.hostId ? 'host' : s.isBot ? 'bot' : 'player'}
                {s.userId === me.id && ' · you'}
              </div>
            </div>
            {isHost && s.userId !== me.id && (
              <button className="btn-ghost px-2 py-1 text-xs" onClick={() => run(removeSeat(s.seat))}>
                Remove
              </button>
            )}
          </div>
        ))}
        {Array.from({ length: empty }, (_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-dashed border-white/15 px-3 py-2 text-sm text-cream/40">
            <div className="h-9 w-9 rounded-full border border-dashed border-white/20" />
            {room.fillWithBots ? 'Bot will sit here' : 'Empty seat'}
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {isHost ? (
          <>
            <button className="btn-gold px-6 py-2.5 text-base" disabled={busy} onClick={() => run(start())}>
              {room.lastResult ? 'Play again' : 'Start game'}
            </button>
            {!room.fillWithBots && empty > 0 && (
              <button className="btn-ghost" disabled={busy} onClick={() => run(addBot())}>
                + Add bot
              </button>
            )}
          </>
        ) : (
          <p className="text-sm text-cream/60">Waiting for the host to start…</p>
        )}
      </div>

      {ui && (
        <details className="mt-6 text-sm text-cream/70">
          <summary className="cursor-pointer font-semibold text-cream">How to play</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {ui.rules.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function InviteButton({ room }: { room: RoomDetail }) {
  const say = useGame((s) => s.say);
  const link = room.isPrivate ? `${location.origin}/join/${room.code}` : `${location.origin}/room/${room.id}`;
  return (
    <button
      className="btn-ghost py-1.5 text-xs"
      title={link}
      onClick={() =>
        navigator.clipboard?.writeText(link).then(
          () => say('Invite link copied'),
          () => say(link),
        ) ?? say(link)
      }
    >
      {room.isPrivate ? (
        <>
          Code <span className="font-mono tracking-widest text-gold-300">{room.code}</span>
        </>
      ) : (
        'Copy invite link'
      )}
    </button>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-[50vh] place-items-center text-cream/60">{children}</div>;
}

function Failed({ error }: { error: string }) {
  return (
    <div className="text-center">
      <p className="text-ember">{error}</p>
      <Link to="/" className="btn-ghost mt-3">
        Back to lobby
      </Link>
    </div>
  );
}
