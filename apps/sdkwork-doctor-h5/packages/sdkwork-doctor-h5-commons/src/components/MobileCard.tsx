import type { ReactNode } from 'react';

export function MobileCard({ title, description, children }: { title?: string; description?: string; children: ReactNode }) {
  return (
    <section className="doctor-card">
      {title ? <h2 className="doctor-card-title">{title}</h2> : null}
      {description ? <p className="doctor-card-body">{description}</p> : null}
      {children}
    </section>
  );
}
