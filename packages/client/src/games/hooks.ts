import { useCallback, useEffect, useRef } from 'react';
import type { SeatInfo } from '@goc/shared';
import { type SoundName, playSound } from '../sound.ts';
import { useGame } from '../store/game.ts';

/** Play a sound whenever `value` changes (not on first render). */
export function useSoundOnChange(value: unknown, name: SoundName, volume?: number) {
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current !== value) playSound(name, volume);
    prev.current = value;
  }, [value, name, volume]);
}

/** Chime when it becomes your turn. */
export function useTurnAlert(myTurn: boolean) {
  useEffect(() => {
    if (myTurn) playSound('slide', 0.4);
  }, [myTurn]);
}

/** Send an intent and surface any error as a toast. */
export function useAct(act: (a: unknown) => Promise<{ ok: boolean; error?: string }>) {
  const say = useGame((s) => s.say);
  return useCallback(
    async (action: unknown) => {
      const r = await act(action);
      if (!r.ok) say((r as { error: string }).error);
      return r.ok;
    },
    [act, say],
  );
}

export const seatFor = (seats: SeatInfo[], playerId: string) => seats.find((s) => s.playerId === playerId);

/** Rotate seats so that `mine` is first (drawn at the bottom). */
export function rotate<T>(list: T[], mine: number): T[] {
  if (mine <= 0) return list;
  return [...list.slice(mine), ...list.slice(0, mine)];
}
