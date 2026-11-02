import type { ReactNode } from 'react';

/**
 * Building blocks for the browser surfaces. They are presentation only: routing,
 * data, and ports stay with the consuming package, so one block can be reused by
 * the home landing and by any future page.
 */

export interface StatTileProps {
  readonly label: string;
  readonly value: ReactNode;
}

export function StatTile({ label, value }: StatTileProps) {
  return (
    <div className="doctor-stat-tile">
      <div className="doctor-stat-tile-label">{label}</div>
      <div className="doctor-stat-tile-value">{value}</div>
    </div>
  );
}

export function StatRow({ children }: { children: ReactNode }) {
  return <div className="doctor-stat-row">{children}</div>;
}

export interface BlockTileProps {
  readonly mark: string;
  readonly title: string;
  readonly description: string;
  readonly action?: ReactNode;
}

/** One composable entry: a glyph, a label, one line of intent, optional action. */
export function BlockTile({ mark, title, description, action }: BlockTileProps) {
  return (
    <div className="doctor-block-tile">
      <span aria-hidden="true" className="doctor-block-mark">{mark}</span>
      <span className="doctor-block-copy">
        <span className="doctor-block-title">{title}</span>
        <span className="doctor-block-body">{description}</span>
      </span>
      {action}
    </div>
  );
}

export function BlockGrid({ children }: { children: ReactNode }) {
  return <div className="doctor-block-grid">{children}</div>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="doctor-empty">{children}</p>;
}
