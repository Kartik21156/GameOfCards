import { AnimatePresence, motion } from 'motion/react';
import type { GameOver } from '@goc/shared';
import { fmt } from './Chips.tsx';

const MEDALS = ['🥇', '🥈', '🥉'];

export function ResultsModal({
  over,
  you,
  showChips,
  isHost,
  onClose,
  onRematch,
}: {
  over: GameOver | null;
  you: string | null;
  showChips: boolean;
  isHost: boolean;
  onClose(): void;
  onRematch(): void;
}) {
  return (
    <AnimatePresence>
      {over && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="panel w-full max-w-md bg-felt-900/95 p-6"
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-display text-3xl text-gold-300">Game over</h2>
            <p className="mt-1 text-cream/75">{over.summary}</p>
            <ol className="mt-5 space-y-2">
              {over.standings.map((s) => (
                <li
                  key={s.playerId}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 ${
                    s.playerId === you ? 'bg-gold-400/15 ring-1 ring-gold-400/50' : 'bg-white/5'
                  }`}
                >
                  <span className="w-7 text-center text-lg">{MEDALS[s.placement - 1] ?? `#${s.placement}`}</span>
                  <span className="flex-1 truncate font-semibold">{s.name}</span>
                  <span className="text-sm text-cream/70 tabular-nums">
                    {Number.isInteger(s.score) ? fmt(s.score) : s.score.toFixed(1)}
                  </span>
                  {showChips && (
                    <span
                      className={`w-20 text-right text-sm font-bold tabular-nums ${
                        s.chipDelta >= 0 ? 'text-felt-500' : 'text-ember'
                      }`}
                    >
                      {s.chipDelta >= 0 ? '+' : ''}
                      {fmt(s.chipDelta)}
                    </span>
                  )}
                </li>
              ))}
            </ol>
            <div className="mt-6 flex justify-end gap-2">
              <button className="btn-ghost" onClick={onClose}>
                Close
              </button>
              {isHost && (
                <button className="btn-gold" onClick={onRematch}>
                  Play again
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
