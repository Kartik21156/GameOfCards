import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import type { PokerView } from '@goc/engine';
import { Card } from '../../components/Card.tsx';
import { ChipStack, fmt } from '../../components/Chips.tsx';
import { PlayerTag } from '../../components/PlayerTag.tsx';
import { rotate, seatFor, useAct, useSoundOnChange, useTurnAlert } from '../hooks.ts';
import type { TableProps } from '../types.ts';

/** Seat i of n around an ellipse, starting at the bottom centre. */
function spot(i: number, n: number, rx: number, ry: number) {
  const a = Math.PI / 2 + (i * 2 * Math.PI) / n;
  return { left: `${50 + rx * Math.cos(a)}%`, top: `${50 + ry * Math.sin(a)}%` };
}

export function PokerTable({ view, you, deadlines, seats, act }: TableProps<PokerView>) {
  const send = useAct(act);
  const n = view.players.length;
  const myIndex = view.players.findIndex((p) => p.id === you);
  const order = rotate(
    view.players.map((p, i) => ({ p, i })),
    myIndex,
  );
  const legal = view.legal;
  const done = view.phase === 'handDone' || view.phase === 'over';

  useSoundOnChange(view.pot, 'chips', 0.4);
  useSoundOnChange(view.board.length, 'place', 0.4);
  useSoundOnChange(view.handNo, 'shuffle', 0.3);
  useTurnAlert(!!legal);

  return (
    <div className="flex flex-col gap-3">
      <div className="felt-table relative mx-auto aspect-[16/10] max-h-[72vh] min-h-[380px] w-full overflow-hidden rounded-[999px] select-none max-sm:aspect-[4/5] max-sm:rounded-[64px]">
        <div className="absolute top-[6%] left-1/2 z-10 flex -translate-x-1/2 gap-2 text-xs">
          <span className="rounded-full bg-black/35 px-3 py-1 font-semibold">
            Hand {view.handNo}/{view.maxHands}
          </span>
          <span className="rounded-full bg-black/35 px-3 py-1">
            Blinds {fmt(view.smallBlind)}/{fmt(view.bigBlind)}
          </span>
        </div>

        {/* Board + pot */}
        <div className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2">
          <div className="flex gap-1.5">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="rounded-md ring-1 ring-white/10" style={{ width: 'var(--card-w)', aspectRatio: '140/190' }}>
                <AnimatePresence>
                  {view.board[i] && (
                    <motion.div initial={{ rotateY: 90, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} transition={{ delay: i < 3 ? i * 0.08 : 0 }}>
                      <Card code={view.board[i]} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
          {view.pot > 0 && (
            <div className="flex items-center gap-2 rounded-full bg-black/40 px-3 py-1 text-sm">
              <span className="text-cream/60">Pot</span>
              <ChipStack amount={view.pot} />
            </div>
          )}
          <AnimatePresence>
            {done && view.winners.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-lg bg-gold-400 px-3 py-1 text-center text-sm font-bold text-felt-950 shadow-lg"
              >
                {view.winners
                  .map((w) => {
                    const name = w.playerId === you ? 'You' : view.players.find((p) => p.id === w.playerId)?.name;
                    return `${name} ${w.playerId === you ? 'win' : 'wins'} ${fmt(w.amount)}${w.hand ? ` · ${w.hand}` : ''}`;
                  })
                  .join('  |  ')}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Seats */}
        {order.map(({ p, i }, k) => {
          const pos = spot(k, n, 41, 38);
          const betPos = spot(k, n, 26, 22);
          const info = seatFor(seats, p.id);
          const isWinner = done && view.winners.some((w) => w.playerId === p.id);
          const isButton = view.button === i;
          const active = view.toAct === p.id;
          return (
            <div key={p.id}>
              <div
                className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
                style={pos}
              >
                <div className={`flex ${p.folded ? 'opacity-30' : ''}`}>
                  {p.hole.map((c, j) => (
                    <div key={j} className={j ? '-ml-4' : ''} style={{ transform: `rotate(${j ? 6 : -6}deg)` }}>
                      <Card code={c} small={p.id !== you} />
                    </div>
                  ))}
                </div>
                <div className="relative">
                  <PlayerTag
                    name={p.id === you ? 'You' : p.name}
                    avatar={info?.avatar ?? 'pieceWhite_single00'}
                    active={active}
                    deadline={deadlines[p.id]}
                    away={info?.away}
                    dim={!p.inHand && p.stack === 0}
                    className={isWinner ? 'ring-2 ring-gold-400' : ''}
                  >
                    <span className="font-bold text-gold-300 tabular-nums">{fmt(p.stack)}</span>
                    {p.lastAction && <span className="ml-1.5 text-cream/60">{p.lastAction}</span>}
                    {p.handName && <div className="text-[11px] font-semibold text-sky">{p.handName}</div>}
                  </PlayerTag>
                  {isButton && (
                    <span className="absolute -top-2 -right-2 grid h-6 w-6 place-items-center rounded-full bg-cream text-[11px] font-black text-felt-950 shadow">
                      D
                    </span>
                  )}
                </div>
              </div>
              {p.bet > 0 && (
                <div className="absolute z-0 -translate-x-1/2 -translate-y-1/2" style={betPos}>
                  <ChipStack amount={p.bet} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {you && (
        <div className="panel mx-auto flex min-h-16 w-full max-w-3xl flex-wrap items-center justify-center gap-2 p-3">
          {view.myHand && <span className="mr-2 text-sm text-cream/70">You have <b className="text-sky">{view.myHand}</b></span>}
          {legal ? <Actions view={view} legal={legal} send={send} /> : <span className="text-sm text-cream/50">{done ? 'Next hand soon…' : 'Waiting for others…'}</span>}
        </div>
      )}
    </div>
  );
}

function Actions({
  view,
  legal,
  send,
}: {
  view: PokerView;
  legal: NonNullable<PokerView['legal']>;
  send: (a: unknown) => Promise<boolean>;
}) {
  const raise = legal.raise;
  const [to, setTo] = useState(raise?.min ?? 0);
  useEffect(() => setTo(raise?.min ?? 0), [raise?.min]);
  const clamp = (v: number) => (raise ? Math.max(raise.min, Math.min(raise.max, Math.round(v))) : v);
  const potSized = (f: number) => clamp(view.currentBet + (view.pot + legal.call) * f);

  return (
    <>
      <button className="btn-danger" onClick={() => send({ type: 'fold' })}>
        Fold
      </button>
      {legal.check ? (
        <button className="btn-ghost" onClick={() => send({ type: 'check' })}>
          Check
        </button>
      ) : (
        <button className="btn-ghost" onClick={() => send({ type: 'call' })}>
          Call {fmt(legal.call)}
        </button>
      )}
      {raise && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="range"
            min={raise.min}
            max={raise.max}
            step={view.bigBlind > 1 ? Math.max(1, Math.floor(view.bigBlind / 2)) : 1}
            value={to}
            onChange={(e) => setTo(clamp(Number(e.target.value)))}
            className="w-36 accent-gold-400"
          />
          <input
            type="number"
            className="input w-24 py-1.5 text-sm"
            value={to}
            min={raise.min}
            max={raise.max}
            onChange={(e) => setTo(Number(e.target.value))}
            onBlur={() => setTo(clamp(to))}
          />
          <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setTo(potSized(0.5))}>
            ½ pot
          </button>
          <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setTo(potSized(1))}>
            Pot
          </button>
          <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setTo(raise.max)}>
            All-in
          </button>
          <button className="btn-gold" onClick={() => send({ type: 'raise', to: clamp(to) })}>
            {to >= raise.max ? 'All-in' : view.currentBet === 0 ? 'Bet' : 'Raise to'} {fmt(clamp(to))}
          </button>
        </div>
      )}
    </>
  );
}
