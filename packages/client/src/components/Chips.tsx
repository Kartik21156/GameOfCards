export const fmt = (n: number) => n.toLocaleString('en-US');

const DENOMS = [
  { v: 500, img: 'chipBlackWhite' },
  { v: 100, img: 'chipBlueWhite' },
  { v: 25, img: 'chipGreenWhite' },
  { v: 5, img: 'chipRedWhite' },
  { v: 1, img: 'chipWhite' },
];

/** A little stack of chip sprites representing an amount, with the number beside it. */
export function ChipStack({ amount, label = true, className = '' }: { amount: number; label?: boolean; className?: string }) {
  if (amount <= 0) return null;
  const chips: string[] = [];
  let left = amount;
  for (const d of DENOMS) {
    while (left >= d.v && chips.length < 6) {
      chips.push(d.img);
      left -= d.v;
    }
  }
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <div className="relative h-6 w-6">
        {chips.map((c, i) => (
          <img
            key={i}
            src={`/assets/chips/${c}_border.png`}
            alt=""
            className="absolute left-0 h-6 w-6 drop-shadow"
            style={{ bottom: i * 3 }}
          />
        ))}
      </div>
      {label && <span className="rounded bg-black/40 px-1.5 text-xs font-bold tabular-nums text-gold-300">{fmt(amount)}</span>}
    </div>
  );
}

export function ChipIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return <img src="/assets/chips/chipGreenWhite_border.png" alt="" className={className} />;
}
