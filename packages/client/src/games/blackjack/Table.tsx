import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import type { BlackjackView } from '@goc/engine';
import { Card } from '../../components/Card.tsx';
import { ChipStack, fmt } from '../../components/Chips.tsx';
import { PlayerTag } from '../../components/PlayerTag.tsx';
import { playSound } from '../../sound.ts';
import { seatFor, useAct, useSoundOnChange, useTurnAlert } from '../hooks.ts';
import type { TableProps } from '../types.ts';

type Hand = BlackjackView['players'][number]['hands'][number];

const OUTCOME: Record<string, { text: string; cls: string }> = {
  blackjack: { text: 'Blackjack!', cls: 'bg-gold-400 text-felt-950' },
  win: { text: 'Win', cls: 'bg-felt-500 text-white' },
  push: { text: 'Push', cls: 'bg-white/25 text-cream' },
  lose: { text: 'Lose', cls: 'bg-ember/90 text-white' },
  bust: { text: 'Bust', cls: 'bg-ember/90 text-white' },
};

const CHIP_VALUES = [
  { v: 5, img: 'chipRedWhite' },
  { v: 25, img: 'chipGreenWhite' },
  { v: 100, img: 'chipBlueWhite' },
  { v: 500, img: 'chipBlackWhite' },
];

function Cards({ cards, small }: { cards: (string | null)[]; small?: boolean }) {
  return (
    <div className="flex">
      <AnimatePresence initial={false}>
        {cards.map((c, i) => (
          <motion.div
            key={`${i}-${c ?? 'x'}`}
            initial={{ opacity: 0, y: -60, rotate: -8 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            className={i ? '-ml-[calc(var(--card-w)*0.55)]' : ''}
            style={{ zIndex: i }}
          >
            <Card code={c} small={small} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function HandBox({ hand, active, small }: { hand: Hand; active: boolean; small: boolean }) {
  const o = hand.outcome ? OUTCOME[hand.outcome] : null;
  return (
    <div className={`relative flex flex-col items-center gap-1 rounded-xl p-1.5 ${active ? 'bg-gold-400/15 ring-2 ring-gold-400' : ''}`}>
      <Cards cards={hand.cards} small={small} />
      <div className="flex items-center gap-1.5 text-xs">
        <span className="rounded bg-black/50 px-1.5 font-bold tabular-nums">
          {hand.soft && hand.total < 21 ? `${hand.total - 10}/${hand.total}` : hand.total}
        </span>
        <ChipStack amount={hand.bet} />
        {hand.doubled && <span className="text-cream/60">×2</span>}
      </div>
      {o && <span className={`absolute -top-2 rounded-full px-2 py-0.5 text-[11px] font-bold shadow ${o.cls}`}>{o.text}</span>}
    </div>
  );
}

export function BlackjackTable({ view, you, deadlines, seats, act }: TableProps<BlackjackView>) {
  const send = useAct(act);
  const legal = view.legal;
  const me = view.players.find((p) => p.id === you);
  const myIndex = view.players.findIndex((p) => p.id === you);
  // Keep your spot in the middle of the rail.
  const others = view.players.filter((p) => p.id !== you);
  const mid = Math.floor(others.length / 2);
  const rail = me ? [...others.slice(0, mid), me, ...others.slice(mid)] : view.players;

  const cardsOut = view.players.reduce((n, p) => n + p.hands.reduce((m, h) => m + h.cards.length, 0), view.dealer.cards.length);
  useSoundOnChange(cardsOut, 'place', 0.4);
  useSoundOnChange(view.round, 'shuffle', 0.3);
  useTurnAlert(!!legal && !legal.bet);

  return (
    <div className="flex flex-col gap-3">
      <div className="felt-table relative mx-auto flex min-h-[520px] w-full flex-col justify-between overflow-hidden rounded-t-[40px] rounded-b-[50%] px-3 pt-4 pb-16 select-none">
        <div className="flex items-center justify-between text-xs">
          <span className="rounded-full bg-black/35 px-3 py-1 font-semibold">
            Round {view.round}/{view.rounds}
          </span>
          <span className="rounded-full bg-black/35 px-3 py-1">
            Bets {fmt(view.minBet)}–{fmt(view.maxBet)}
          </span>
        </div>

        {/* Dealer */}
        <div className="flex flex-col items-center gap-2">
          <div className="label text-cream/60">Dealer</div>
          <div className="min-h-[calc(var(--card-w)*1.36)]">
            <Cards cards={view.dealer.cards} />
          </div>
          {view.dealer.total !== null && (
            <span className="rounded bg-black/50 px-2 text-sm font-bold tabular-nums">{view.dealer.total}</span>
          )}
          <p className="font-display text-sm text-gold-300/70 italic">Blackjack pays 3 to 2 · Dealer stands on all 17s</p>
        </div>

        {/* Players */}
        <div className="flex flex-wrap items-end justify-center gap-x-4 gap-y-6">
          {rail.map((p, k) => {
            const info = seatFor(seats, p.id);
            const isMe = p.id === you;
            const turn = view.turn === p.id;
            const betting = view.phase === 'betting' && !p.sittingOut && p.bet === null;
            const dist = Math.abs(k - (rail.length - 1) / 2);
            return (
              <div key={p.id} className="flex flex-col items-center gap-2" style={{ transform: `translateY(${-dist * dist * 6}px)` }}>
                <div className="flex min-h-[calc(var(--card-w-sm)*1.4)] items-end gap-1">
                  {p.hands.map((h, j) => (
                    <HandBox key={j} hand={h} active={turn && p.active === j && view.phase === 'playing'} small={!isMe} />
                  ))}
                  {p.hands.length === 0 && p.bet !== null && <ChipStack amount={p.bet} />}
                </div>
                <PlayerTag
                  name={isMe ? 'You' : p.name}
                  avatar={info?.avatar ?? 'pieceWhite_single00'}
                  active={turn || betting}
                  deadline={deadlines[p.id]}
                  away={info?.away}
                  dim={p.sittingOut}
                >
                  <span className="font-bold text-gold-300 tabular-nums">{fmt(p.stack)}</span>
                  {p.sittingOut && <span className="ml-1.5">sitting out</span>}
                  {betting && <span className="ml-1.5">betting…</span>}
                </PlayerTag>
              </div>
            );
          })}
        </div>
      </div>

      {myIndex >= 0 && me && (
        <div className="panel mx-auto flex min-h-16 w-full max-w-3xl flex-wrap items-center justify-center gap-2 p-3">
          {legal?.bet ? (
            <BetPicker min={legal.bet.min} max={legal.bet.max} onBet={(amount) => send({ type: 'bet', amount })} />
          ) : legal ? (
            <>
              <button className="btn-gold" onClick={() => send({ type: 'hit' })}>
                Hit
              </button>
              <button className="btn-ghost" onClick={() => send({ type: 'stand' })}>
                Stand
              </button>
              <button className="btn-ghost" disabled={!legal.double} onClick={() => send({ type: 'double' })}>
                Double
              </button>
              <button className="btn-ghost" disabled={!legal.split} onClick={() => send({ type: 'split' })}>
                Split
              </button>
            </>
          ) : (
            <span className="text-sm text-cream/50">
              {me.sittingOut ? 'Not enough chips for the minimum bet' : view.phase === 'settled' ? 'Next round soon…' : 'Waiting…'}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function BetPicker({ min, max, onBet }: { min: number; max: number; onBet: (n: number) => void }) {
  const [bet, setBet] = useState(min);
  useEffect(() => setBet((b) => Math.max(min, Math.min(max, b))), [min, max]);
  const add = (v: number) => {
    playSound('chips', 0.35);
    setBet((b) => Math.min(max, (b === min && b < v ? 0 : b) + v));
  };
  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      <div className="flex gap-1.5">
        {CHIP_VALUES.filter((c) => c.v <= max).map((c) => (
          <button key={c.v} onClick={() => add(c.v)} className="relative transition hover:-translate-y-1" title={`+${c.v}`}>
            <img src={`/assets/chips/${c.img}_border.png`} alt="" className="h-11 w-11 drop-shadow" />
            <span className="absolute inset-0 grid place-items-center text-[11px] font-black text-white [text-shadow:0_1px_2px_#000]">
              {c.v}
            </span>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <span className="min-w-16 text-center text-lg font-bold text-gold-300 tabular-nums">{fmt(bet)}</span>
        <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setBet(min)}>
          Min
        </button>
        <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setBet(max)}>
          Max
        </button>
        <button className="btn-gold" onClick={() => onBet(Math.max(min, Math.min(max, bet)))}>
          Place bet
        </button>
      </div>
    </div>
  );
}
