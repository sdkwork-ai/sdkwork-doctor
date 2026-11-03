import { useState } from 'react';

export interface DoctorAvatarProps {
  /** Doctor display name; its first character is the fallback monogram. */
  readonly name: string;
  /** Portrait URL resolved by the surface, or an empty string when none exists. */
  readonly src: string;
  readonly size?: 'sm' | 'lg';
}

/**
 * Round doctor portrait. A portrait that fails to load — an unreachable
 * directory asset, or a roster entry without one — falls back to the doctor's
 * initial instead of leaving a broken image on the directory card.
 */
export function DoctorAvatar({ name, src, size = 'sm' }: DoctorAvatarProps) {
  const [failed, setFailed] = useState(false);
  const className = 'doctor-avatar' + (size === 'lg' ? ' doctor-avatar-lg' : '');
  if (!src || failed) {
    return (
      <span aria-hidden="true" className={className + ' doctor-avatar-fallback'}>
        {name.trim().slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      alt=""
      aria-hidden="true"
      className={className}
      onError={() => setFailed(true)}
      src={src}
    />
  );
}
