import type { ReactNode } from 'react';

export function MobileCard({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="doctor-card">
      {title ? <h2 className="doctor-card-title">{title}</h2> : null}
      {children}
    </section>
  );
}
