import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import type { CallbreakView } from '@goc/engine';
import { Card, Hand } from '../../components/Card.tsx';
import { PlayerTag } from '../../components/PlayerTag.tsx';
import { seatFor, useAct, useSoundOnChange, useTurnAlert } from '../hooks.ts';
import type { TableProps } from '../types.ts';

type Side = 'bottom' | 'right' | 'top' | 'left';
/** Play goes anticlockwise: the next seat sits to your right. */
const SIDES: Side[] = ['bottom', 'right', 'top', 'left'];

const TAG_POS: Record<Side, string> = {
  bottom: 'bottom-[calc(var(--card-w)*1.55+1.5rem)] left-1/2 -translate-x-1/2',
  top: 'top-3 left-1/2 -translate-x-1/2',
  left: 'left-3 top-1/2 -translate-y-1/2',
  right: 'right-3 top-1/2 -translate-y-1/2',
};
/** Where each seat's trick card lands, relative to the table centre. */
const TRICK_OFFSET: Record<Side, { x: string; y: string }> = {
  bottom: { x: '0%', y: '55%' },
  top: { x: '0%', y: '-55%' },
  left: { x: '-85%', y: '0%' },
  right: { x: '85%', y: '0%' },
};
const FROM: Record<Side, { x: number; y: number }> = {
  bottom: { x: 0, y: 160 },
  top: { x: 0, y: -160 },
  left: { x: -220, y: 0 },
  right: { x: 220, y: 0 },
};

const fmtScore = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function CallbreakTable({ view, you, deadlines, seats, act }: TableProps<CallbreakView>) {
  const send = useAct(act);
  const [showScores, setShowScores] = useState(false);
  const base = view.mySeat ?? 0;
  const side = (seat: number) => SIDES[(seat - base + 4) % 4];

  const trickDone = view.phase === 'trickDone' && view.lastTrick;
  const shown = trickDone ? view.lastTrick!.plays : view.trick;
  const winner = trickDone ? view.lastTrick!.winner : null;
  const myTurn = !!view.legal;

  useSoundOnChange(shown.length, 'place', 0.45);
  useSoundOnChange(view.round, 'shuffle', 0.35);
  useTurnAlert(myTurn);

  return (
    <div className="felt-table relative mx-auto h-[max(540px,min(78vh,760px))] w-full overflow-hidden rounded-[48px] select-none">
      {/* Header strip */}
      <div className="absolute top-3 left-4 z-10 flex items-center gap-2 text-sm">
        <span className="rounded-full bg-black/35 px-3 py-1 font-semibold">
          Round {view.round}/{view.rounds}
        </span>
        <span className="rounded-full bg-black/35 px-3 py-1" title="Spades are trump">
          ♠ trump
        </span>
      </div>
      <button className="btn-ghost absolute top-3 right-4 z-10 px-3 py-1 text-xs" onClick={() => setShowScores((v) => !v)}>
        {showScores ? 'Hide scores' : 'Scores'}
      </button>

      {/* Players */}
      {view.players.map((p, seat) => {
        const s = side(seat);
        const info = seatFor(seats, p.id);
        const active = view.turn === seat && (view.phase === 'bidding' || view.phase === 'playing');
        return (
          <div key={p.id} className={`absolute z-10 flex flex-col items-center gap-1 ${TAG_POS[s]}`}>
            {s === 'top' && <Hand cards={Array(Math.min(p.cardCount, 13)).fill(null)} small />}
            <PlayerTag
              name={p.id === you ? 'You' : p.name}
              avatar={info?.avatar ?? 'pieceWhite_single00'}
              active={active}
              deadline={deadlines[p.id]}
              away={info?.away}
            >
              <span className="font-semibold text-gold-300">
                {p.bid === null ? (view.phase === 'bidding' ? 'bidding…' : '–') : `${p.won}/${p.bid}`}
              </span>
              <span className="ml-2 text-cream/60">{fmtScore(p.total)} pts</span>
              {s !== 'top' && s !== 'bottom' && <span className="ml-2 text-cream/50">🂠{p.cardCount}</span>}
            </PlayerTag>
            {view.dealer === seat && <span className="text-[10px] font-bold tracking-widest text-cream/50 uppercase">dealer</span>}
          </div>
        );
      })}

      {/* Trick */}
      <div className="absolute top-1/2 left-1/2 h-0 w-0">
        <AnimatePresence>
          {shown.map((play) => {
            const s = side(play.seat);
            const off = TRICK_OFFSET[s];
            const winTo = winner !== null ? FROM[side(winner)] : { x: 0, y: 0 };
            return (
              <motion.div
                key={`${view.round}-${play.card}`}
                className="absolute"
                style={{ left: `calc(var(--card-w) * -0.5)`, top: `calc(var(--card-w) * -0.68)` }}
                initial={{ opacity: 0, x: FROM[s].x, y: FROM[s].y, rotate: 0 }}
                animate={{ opacity: 1, x: 0, y: 0, rotate: ((play.seat * 7) % 11) - 5 }}
                exit={{ opacity: 0, x: winTo.x * 1.4, y: winTo.y * 1.4, scale: 0.7, transition: { duration: 0.45 } }}
                transition={{ type: 'spring', stiffness: 260, damping: 26 }}
              >
                <div style={{ transform: `translate(${off.x}, ${off.y})` }}>
                  <Card code={play.card} highlight={winner === play.seat} />
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Bid picker */}
      <AnimatePresence>
        {view.legal?.bid && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="panel absolute top-1/2 left-1/2 z-20 w-[min(92%,360px)] -translate-x-1/2 -translate-y-1/2 bg-felt-950/90 p-4 text-center"
          >
            <div className="font-display text-xl text-gold-300">How many tricks will you take?</div>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {Array.from({ length: view.legal.bid.max - view.legal.bid.min + 1 }, (_, i) => view.legal!.bid!.min + i).map((n) => (
                <button key={n} className="btn-gold h-11 w-11 p-0 text-lg" onClick={() => send({ type: 'bid', value: n })}>
                  {n}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Round summary */}
      <AnimatePresence>
        {view.phase === 'roundDone' && view.scores.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="panel absolute top-1/2 left-1/2 z-20 w-[min(92%,380px)] -translate-x-1/2 -translate-y-1/2 bg-felt-950/90 p-4"
          >
            <div className="font-display text-xl text-gold-300">Round {view.round} done</div>
            <table className="mt-2 w-full text-sm">
              <thead className="text-cream/50">
                <tr>
                  <th className="text-left font-medium">Player</th>
                  <th className="font-medium">Bid</th>
                  <th className="font-medium">Won</th>
                  <th className="text-right font-medium">Score</th>
                </tr>
              </thead>
              <tbody>
                {view.players.map((p, i) => {
                  const sc = view.scores[view.scores.length - 1][i];
                  return (
                    <tr key={p.id}>
                      <td className="truncate py-0.5">{p.id === you ? 'You' : p.name}</td>
                      <td className="text-center">{p.bid}</td>
                      <td className="text-center">{p.won}</td>
                      <td className={`text-right font-bold tabular-nums ${sc >= 0 ? 'text-felt-500' : 'text-ember'}`}>
                        {sc >= 0 ? '+' : ''}
                        {fmtScore(sc)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Scoreboard */}
      {showScores && (
        <div className="panel absolute top-14 right-4 z-30 max-h-[60%] overflow-auto bg-felt-950/95 p-3 text-sm">
          <table>
            <thead className="text-cream/50">
              <tr>
                <th className="pr-3 text-left font-medium">Rd</th>
                {view.players.map((p) => (
                  <th key={p.id} className="max-w-20 truncate px-2 font-medium">
                    {p.id === you ? 'You' : p.name.replace(' (bot)', '')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {view.scores.map((row, r) => (
                <tr key={r}>
                  <td className="pr-3 text-cream/50">{r + 1}</td>
                  {row.map((v, i) => (
                    <td key={i} className={`px-2 text-center ${v < 0 ? 'text-ember' : ''}`}>
                      {fmtScore(v)}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="border-t border-white/15 font-bold">
                <td className="pr-3">Σ</td>
                {view.players.map((p) => (
                  <td key={p.id} className="px-2 text-center">
                    {fmtScore(p.total)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* My hand */}
      <div className="absolute inset-x-0 bottom-3 z-10 px-2">
        {view.mySeat !== null ? (
          <Hand
            cards={view.hand}
            legal={view.legal?.cards ?? (view.phase === 'playing' ? [] : null)}
            onPlay={(card) => send({ type: 'play', card })}
          />
        ) : (
          <p className="text-center text-sm text-cream/60">You are watching this game</p>
        )}
        {myTurn && view.legal?.cards && (
          <p className="mt-1 text-center text-xs font-semibold text-gold-300">Your turn — play a highlighted card</p>
        )}
      </div>
    </div>
  );
}
