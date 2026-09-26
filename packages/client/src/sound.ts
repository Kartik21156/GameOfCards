import { create } from 'zustand';

const SOUNDS = {
  place: ['cardPlace1', 'cardPlace2', 'cardPlace3'],
  slide: ['cardSlide1', 'cardSlide2', 'cardSlide3'],
  chips: ['chipsCollide1', 'chipsCollide2', 'chipsCollide3'],
  shuffle: ['dieShuffle1'],
} as const;
export type SoundName = keyof typeof SOUNDS;

const read = () => {
  try {
    return localStorage.getItem('goc:muted') === '1';
  } catch {
    return false;
  }
};

export const useMute = create<{ muted: boolean; toggle(): void }>((set, get) => ({
  muted: read(),
  toggle() {
    const muted = !get().muted;
    try {
      localStorage.setItem('goc:muted', muted ? '1' : '0');
    } catch {
      /* ignore */
    }
    set({ muted });
  },
}));

const cache = new Map<string, HTMLAudioElement>();

export function playSound(name: SoundName, volume = 0.5) {
  if (useMute.getState().muted) return;
  const files = SOUNDS[name];
  const file = files[Math.floor(Math.random() * files.length)];
  let base = cache.get(file);
  if (!base) {
    base = new Audio(`/assets/sounds/${file}.ogg`);
    cache.set(file, base);
  }
  const a = base.cloneNode() as HTMLAudioElement;
  a.volume = volume;
  a.play().catch(() => {});
}
