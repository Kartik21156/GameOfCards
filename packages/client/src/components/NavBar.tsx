import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../store/auth.ts';
import { useGame } from '../store/game.ts';
import { useMute } from '../sound.ts';
import { Avatar } from './Avatar.tsx';
import { ChipIcon, fmt } from './Chips.tsx';

export function NavBar() {
  const me = useAuth((s) => s.me)!;
  const room = useGame((s) => s.room);
  const connected = useGame((s) => s.connected);
  const { muted, toggle } = useMute();
  const loc = useLocation();
  const link = ({ isActive }: { isActive: boolean }) =>
    `rounded-md px-2.5 py-1.5 text-sm font-semibold transition ${
      isActive ? 'bg-white/10 text-gold-300' : 'text-cream/75 hover:text-cream'
    }`;

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-felt-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-2">
        <Link to="/" className="mr-1 flex items-center gap-2">
          <img src="/assets/cards/cardSpadesA.png" alt="" className="h-8 -rotate-6 drop-shadow" />
          <span className="font-display text-xl text-gold-300 max-sm:hidden">Game of Cards</span>
        </Link>
        <nav className="flex gap-1">
          <NavLink to="/" end className={link}>
            Lobby
          </NavLink>
          <NavLink to="/leaderboard" className={link}>
            Ranks
          </NavLink>
        </nav>
        {room && !loc.pathname.startsWith('/room/') && (
          <Link to={`/room/${room.id}`} className="btn-gold ml-1 px-3 py-1 text-xs">
            {room.status === 'playing' ? 'Back to game' : 'Back to table'}
          </Link>
        )}
        <div className="ml-auto flex items-center gap-2">
          {!connected && <span className="text-xs font-semibold text-ember max-sm:hidden">reconnecting…</span>}
          <button onClick={toggle} className="btn-ghost px-2 py-1" title={muted ? 'Unmute' : 'Mute'} aria-label="Toggle sound">
            {muted ? '🔇' : '🔊'}
          </button>
          <div className="flex items-center gap-1 rounded-full bg-black/30 px-2.5 py-1 text-sm font-bold text-gold-300 tabular-nums">
            <ChipIcon /> {fmt(me.chips)}
          </div>
          <Link to={`/u/${me.username}`} className="flex items-center gap-2 rounded-full pr-1 hover:bg-white/5">
            <Avatar avatar={me.avatar} size={32} />
            <span className="text-sm font-semibold max-md:hidden">{me.displayName}</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
