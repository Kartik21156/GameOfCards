import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { LeaderboardRow } from '@goc/shared';
import { api } from '../api.ts';
import { Avatar } from '../components/Avatar.tsx';
import { fmt } from '../components/Chips.tsx';
import { useGames } from './Lobby.tsx';

export function LeaderboardPage() {
  const games = useGames();
  const [game, setGame] = useState<string>('');
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);

  useEffect(() => {
    setRows(null);
    api<LeaderboardRow[]>(`/leaderboard${game ? `?game=${game}` : ''}`).then(setRows, () => setRows([]));
  }, [game]);

  const tabs = [{ id: '', name: 'Richest' }, ...games.map((g) => ({ id: g.id, name: g.name }))];
  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="font-display text-3xl text-gold-300">Leaderboard</h1>
      <div className="mt-4 flex flex-wrap gap-1 text-sm font-semibold">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setGame(t.id)}
            className={`rounded-md px-3 py-1.5 ${game === t.id ? 'bg-gold-400 text-felt-950' : 'bg-white/5 text-cream/70 hover:text-cream'}`}
          >
            {t.name}
          </button>
        ))}
      </div>
      <div className="panel mt-4 overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead className="text-left text-xs text-cream/50 uppercase">
            <tr>
              <th className="px-4 py-2 font-semibold">#</th>
              <th className="py-2 font-semibold">Player</th>
              <th className="py-2 text-right font-semibold">Played</th>
              <th className="py-2 text-right font-semibold">Won</th>
              <th className="px-4 py-2 text-right font-semibold">{game ? (game === 'callbreak' ? 'Win %' : 'Net') : 'Chips'}</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {rows === null && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-cream/50">
                  Loading…
                </td>
              </tr>
            )}
            {rows?.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-cream/50">
                  Nobody has played yet.
                </td>
              </tr>
            )}
            {rows?.map((r, i) => (
              <tr key={r.username} className="border-t border-white/5">
                <td className={`px-4 py-2 font-bold ${i < 3 ? 'text-gold-300' : 'text-cream/50'}`}>{i + 1}</td>
                <td className="py-2">
                  <Link to={`/u/${r.username}`} className="flex items-center gap-2 hover:text-gold-300">
                    <Avatar avatar={r.avatar} size={28} />
                    <span className="font-semibold">{r.displayName}</span>
                    <span className="text-xs text-cream/40">@{r.username}</span>
                  </Link>
                </td>
                <td className="py-2 text-right">{fmt(r.played)}</td>
                <td className="py-2 text-right">{fmt(r.won)}</td>
                <td className="px-4 py-2 text-right font-semibold text-gold-300">
                  {game === 'callbreak'
                    ? `${r.played ? Math.round((r.won / r.played) * 100) : 0}%`
                    : game
                      ? `${r.netChips > 0 ? '+' : ''}${fmt(r.netChips)}`
                      : fmt(r.chips)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
