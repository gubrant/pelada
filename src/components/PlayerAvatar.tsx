import { useState } from 'react';

interface PlayerAvatarProps {
  name: string;
  photoUrl?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const SIZE_CLASSES = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-base',
  xl: 'h-20 w-20 text-xl',
};

export function PlayerAvatar({ name, photoUrl, size = 'md' }: PlayerAvatarProps) {
  const [failed, setFailed] = useState(false);

  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  if (photoUrl && !failed) {
    return (
      <img
        src={photoUrl}
        alt={`Foto de ${name}`}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`${SIZE_CLASSES[size]} rounded-lg object-cover border border-slate-200 shrink-0 bg-slate-100`}
      />
    );
  }

  return (
    <div
      className={`${SIZE_CLASSES[size]} rounded-lg bg-gradient-to-br from-emerald-800 to-slate-900 text-white font-display font-bold flex items-center justify-center shrink-0 border border-slate-700/30 select-none`}
      aria-label={name}
    >
      {initials || 'QM'}
    </div>
  );
}
