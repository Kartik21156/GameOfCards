import { avatarAsset } from '@goc/shared';

export function Avatar({ avatar, size = 40, className = '' }: { avatar: string; size?: number; className?: string }) {
  return (
    <div
      className={`grid shrink-0 place-items-center rounded-full bg-felt-950/70 ring-1 ring-white/15 ${className}`}
      style={{ width: size, height: size }}
    >
      <img src={avatarAsset(avatar)} alt="" draggable={false} style={{ width: size * 0.7, height: size * 0.7 }} />
    </div>
  );
}
