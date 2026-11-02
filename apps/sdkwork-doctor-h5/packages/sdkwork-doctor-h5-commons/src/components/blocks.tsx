import type { ReactNode } from 'react';

/**
 * Mobile building blocks. Same contract as the PC blocks with a one-column
 * presentation; routing and data stay with the consuming package.
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

export function BlockList({ children }: { children: ReactNode }) {
  return <div className="doctor-block-list">{children}</div>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="doctor-empty">{children}</p>;
}
