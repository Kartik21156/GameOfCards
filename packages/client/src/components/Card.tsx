import { motion } from 'motion/react';
import { cardAsset, cardBackAsset } from '@goc/shared';
import { useAuth } from '../store/auth.ts';

interface CardProps {
  /** Card code like "SA"; null or undefined shows the back. */
  code?: string | null;
  small?: boolean;
  className?: string;
  onClick?: () => void;
  /** Dim a card that cannot be played right now. */
  disabled?: boolean;
  /** Raise a card that can be played. */
  playable?: boolean;
  highlight?: boolean;
}

export function useCardBack() {
  return useAuth((s) => s.me?.cardBack ?? 'cardBack_blue2');
}

export function Card({ code, small, className = '', onClick, disabled, playable, highlight }: CardProps) {
  const back = useCardBack();
  const src = code ? cardAsset(code) : cardBackAsset(back);
  const interactive = !!onClick && !disabled;
  return (
    <motion.img
      src={src}
      alt={code ?? 'card back'}
      draggable={false}
      onClick={interactive ? onClick : undefined}
      whileHover={interactive ? { y: -14 } : undefined}
      animate={{ y: playable ? -8 : 0, opacity: disabled ? 0.45 : 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      className={`card-img ${small ? 'sm' : ''} ${interactive ? 'cursor-pointer' : ''} ${
        highlight ? 'rounded-md ring-4 ring-gold-400' : ''
      } ${className}`}
    />
  );
}

/** A fanned row of cards that overlaps more as it gets longer. */
export function Hand({
  cards,
  legal,
  onPlay,
  small,
}: {
  cards: (string | null)[];
  /** When set, only these cards are playable and the rest are dimmed. */
  legal?: string[] | null;
  onPlay?: (card: string) => void;
  small?: boolean;
}) {
  const overlap = cards.length > 10 ? 0.58 : cards.length > 6 ? 0.45 : 0.25;
  const w = small ? 'var(--card-w-sm)' : 'var(--card-w)';
  return (
    <div className="flex justify-center" style={{ paddingLeft: `calc(${w} * ${overlap})` }}>
      {cards.map((c, i) => {
        const ok = !!c && !!legal && legal.includes(c);
        return (
          <motion.div
            key={c ?? `back-${i}`}
            layout
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -40 }}
            style={{ marginLeft: `calc(${w} * -${overlap})` }}
          >
            <Card
              code={c}
              small={small}
              playable={ok}
              disabled={!!legal && !ok}
              onClick={ok && c && onPlay ? () => onPlay(c) : undefined}
            />
          </motion.div>
        );
      })}
    </div>
  );
}
