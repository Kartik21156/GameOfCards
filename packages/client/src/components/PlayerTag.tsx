import type { ReactNode } from 'react';
import { Avatar } from './Avatar.tsx';
import { TurnTimer } from './TurnTimer.tsx';

/** Avatar + name plate used around every table. */
export function PlayerTag({
  name,
  avatar,
  active,
  deadline,
  away,
  dim,
  children,
  className = '',
}: {
  name: string;
  avatar: string;
  active?: boolean;
  deadline?: number;
  away?: boolean;
  dim?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex min-w-28 max-w-44 items-center gap-2 rounded-xl bg-felt-950/75 px-2 py-1.5 ring-1 ring-white/10 transition ${
        active ? 'turn-ring' : ''
      } ${dim ? 'opacity-50' : ''} ${className}`}
    >
      <Avatar avatar={avatar} size={34} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm leading-tight font-semibold">
          {name}
          {away && <span className="ml-1 text-[10px] font-bold text-ember uppercase">away</span>}
        </div>
        <div className="text-xs text-cream/70">{children}</div>
        {active && <TurnTimer deadline={deadline} className="mt-1" />}
      </div>
    </div>
  );
}
