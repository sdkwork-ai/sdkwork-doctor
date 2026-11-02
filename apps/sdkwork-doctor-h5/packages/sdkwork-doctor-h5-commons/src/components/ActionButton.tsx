import type { ReactNode } from 'react';

export function ActionButton({ children, onClick, disabled, tone }: { children: ReactNode; onClick?: () => void; disabled?: boolean; tone?: 'primary' | 'default' }) {
  return (
    <button className="doctor-button" data-tone={tone ?? 'default'} type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}
