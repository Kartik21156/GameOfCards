import { useEffect, useState } from 'react';
import { TURN_SECONDS } from '@goc/shared';

/** A thin bar that drains until the deadline. */
export function TurnTimer({ deadline, className = '' }: { deadline: number | undefined; className?: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!deadline) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [deadline]);
  if (!deadline) return null;
  const left = Math.max(0, deadline - now);
  const pct = Math.min(100, (left / (TURN_SECONDS * 1000)) * 100);
  return (
    <div className={`h-1 w-full overflow-hidden rounded-full bg-black/40 ${className}`}>
      <div
        className={`h-full rounded-full transition-[width] duration-300 ease-linear ${pct < 25 ? 'bg-ember' : 'bg-gold-400'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
