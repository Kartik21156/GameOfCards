import { AnimatePresence, motion } from 'motion/react';
import { useEffect } from 'react';
import { useGame } from '../store/game.ts';

export function Toast() {
  const notice = useGame((s) => s.notice);
  const clear = useGame((s) => s.clearNotice);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(clear, 3500);
    return () => clearTimeout(t);
  }, [notice, clear]);
  return (
    <AnimatePresence>
      {notice && (
        <motion.div
          initial={{ opacity: 0, y: 20, x: '-50%' }}
          animate={{ opacity: 1, y: 0, x: '-50%' }}
          exit={{ opacity: 0, y: 20, x: '-50%' }}
          className="fixed bottom-4 left-1/2 z-[60] max-w-[90vw] rounded-lg bg-felt-950/95 px-4 py-2 text-sm shadow-xl ring-1 ring-gold-400/40"
          onClick={clear}
        >
          {notice}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
