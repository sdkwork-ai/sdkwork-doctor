/**
 * Building-block composition model.
 *
 * Authority: `specs/app-composition.contract.json`. A block is one composable
 * unit (a tab, or the home landing) with a stable id, a canonical cross-client
 * page id, a route, an i18n label key, and the surfaces that render it.
 *
 * Clients resolve blocks instead of hard-coding navigation, and a deployment can
 * hide optional blocks, reorder them, relabel them, and override theme tokens
 * through the runtime document. Everything invalid falls back to the contract
 * default, so a bad deployment document cannot produce an empty shell.
 */

export type AppSurface = 'pc' | 'h5' | 'flutter' | 'mini_program';
export type AppBlockId = 'home' | 'chat' | 'doctor' | 'records' | 'me';
export type AppBlockKind = 'navigation' | 'insight' | 'record';
export type AppBlockIcon = 'home' | 'chat' | 'doctor' | 'records' | 'user';

export interface AppBlockDescriptor {
  readonly id: AppBlockId;
  readonly kind: AppBlockKind;
  /** Canonical page identity shared by every client (`<surface>.<domain>.<capability>.<screen>`). */
  readonly pageId: string;
  /** Route identity on the browser surfaces. */
  readonly route: string;
  readonly labelKey: string;
  readonly icon: AppBlockIcon;
  readonly order: number;
  readonly surfaces: readonly AppSurface[];
  readonly optional: boolean;
  readonly description: string;
}

/** A block after resolution: same fields plus the effective label key. */
export interface ResolvedAppBlock extends AppBlockDescriptor {
  readonly label: string;
}

export interface AppBlockOverrides {
  /** Optional block ids to hide. Required blocks are ignored. */
  readonly hidden?: readonly string[];
  /** Preferred order; ids not listed keep their catalogue order after these. */
  readonly order?: readonly string[];
  /** Deployment-specific label keys, e.g. `{ records: 'tenant.care.trips' }`. */
  readonly labels?: Readonly<Record<string, string>>;
}

export const APP_BLOCKS: readonly AppBlockDescriptor[] = Object.freeze([
  Object.freeze({
    id: 'home', kind: 'navigation', pageId: 'app.doctor.home.index', route: '/doctor/home',
    labelKey: 'platform.care.nav.home', icon: 'home', order: 0,
    surfaces: Object.freeze(['pc', 'h5'] as const), optional: true,
    description: 'Workbench landing for the browser surfaces.',
  }),
  Object.freeze({
    id: 'chat', kind: 'navigation', pageId: 'app.doctor.conversation.chat', route: '/doctor/chat',
    labelKey: 'platform.care.nav.chat', icon: 'chat', order: 10,
    surfaces: Object.freeze(['pc', 'h5', 'flutter', 'mini_program'] as const), optional: false,
    description: 'Family-doctor conversation with per-exchange triage.',
  }),
  Object.freeze({
    id: 'doctor', kind: 'navigation', pageId: 'app.doctor.record.summary', route: '/doctor/doctor',
    labelKey: 'platform.care.nav.doctor', icon: 'doctor', order: 20,
    surfaces: Object.freeze(['pc', 'h5', 'flutter', 'mini_program'] as const), optional: false,
    description: 'Household health record and care rules.',
  }),
  Object.freeze({
    id: 'records', kind: 'navigation', pageId: 'app.doctor.record.list', route: '/doctor/records',
    labelKey: 'platform.care.nav.records', icon: 'records', order: 30,
    surfaces: Object.freeze(['pc', 'h5', 'flutter', 'mini_program'] as const), optional: false,
    description: 'Visit records stored on this device.',
  }),
  Object.freeze({
    id: 'me', kind: 'navigation', pageId: 'app.doctor.profile.index', route: '/doctor/me',
    labelKey: 'platform.care.nav.me', icon: 'user', order: 40,
    surfaces: Object.freeze(['pc', 'h5', 'flutter', 'mini_program'] as const), optional: false,
    description: 'Family members, active mode, device checks.',
  }),
]);

/** Page identities, keyed by block id. */
export const DOCTOR_PAGE_IDS: Readonly<Record<AppBlockId, string>> = Object.freeze(
  Object.fromEntries(APP_BLOCKS.map((block) => [block.id, block.pageId])) as Record<AppBlockId, string>,
);

const BLOCK_BY_ID = new Map<string, AppBlockDescriptor>(APP_BLOCKS.map((block) => [block.id, block]));

export function isAppBlockId(value: unknown): value is AppBlockId {
  return typeof value === 'string' && BLOCK_BY_ID.has(value);
}

function dedupe(values: readonly string[] | undefined): string[] {
  if (!values) return [];
  return [...new Set(values.filter((value) => typeof value === 'string'))];
}

/**
 * Resolves the visible blocks for one surface.
 *
 * Rules: only blocks declared for the surface; hidden ids remove optional blocks
 * only; `order` floats known ids to the front in the given sequence; labels are
 * only applied when the override names a real block.
 */
export function resolveAppBlocks(
  surface: AppSurface,
  overrides: AppBlockOverrides = {},
): readonly ResolvedAppBlock[] {
  const hidden = new Set(dedupe(overrides.hidden));
  const preferred = dedupe(overrides.order);

  const visible = APP_BLOCKS.filter((block) => {
    if (!block.surfaces.includes(surface)) return false;
    if (block.optional && hidden.has(block.id)) return false;
    return true;
  });

  const rank = (block: AppBlockDescriptor): number => {
    const preferredIndex = preferred.indexOf(block.id);
    return preferredIndex >= 0 ? preferredIndex : preferred.length + block.order;
  };

  return Object.freeze(
    visible
      .slice()
      .sort((left, right) => rank(left) - rank(right))
      .map((block) => {
        const label = overrides.labels?.[block.id];
        return Object.freeze({
          ...block,
          label: typeof label === 'string' && label.trim().length > 0 ? label.trim() : block.labelKey,
        });
      }),
  );
}

/** True when the surface renders a home landing block. */
export function hasHomeBlock(surface: AppSurface): boolean {
  return APP_BLOCKS.some((block) => block.id === 'home' && block.surfaces.includes(surface));
}

/** Home route for a surface, or the chat route when the surface has no home. */
export function resolveHomeRoute(surface: AppSurface): string {
  const home = APP_BLOCKS.find((block) => block.id === 'home' && block.surfaces.includes(surface));
  return home ? home.route : '/doctor/chat';
}

// ---------------------------------------------------------------------------
// Theme customization
// ---------------------------------------------------------------------------

export type ThemeTokenKey = 'primary' | 'primaryStrong' | 'nav' | 'canvas' | 'surface' | 'surfaceAlt';

export type AppTheme = Readonly<Record<ThemeTokenKey, string>>;

/** Defaults mirror `specs/design-tokens.contract.json`. */
export const DEFAULT_APP_THEME: AppTheme = Object.freeze({
  primary: '#0A5CFF',
  primaryStrong: '#0747C9',
  nav: '#061A3A',
  canvas: '#F2F5FA',
  surface: '#FFFFFF',
  surfaceAlt: '#E6EDF8',
});

/** CSS custom properties every browser surface uses for these tokens. */
export const THEME_CSS_VARIABLES: Readonly<Record<ThemeTokenKey, string>> = Object.freeze({
  primary: '--doctor-accent',
  primaryStrong: '--doctor-accent-strong',
  nav: '--doctor-nav',
  canvas: '--doctor-bg',
  surface: '--doctor-surface',
  surfaceAlt: '--doctor-surface-alt',
});

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/u;

/** Strict hex colour for deployment overrides; anything else is ignored. */
export function isThemeColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR.test(value.trim());
}

/**
 * Resolves a deployment's theme overrides over the defaults. Invalid values are
 * dropped one by one, so one bad colour never disables the whole theme.
 */
export function resolveAppTheme(overrides: Readonly<Record<string, unknown>> | undefined): AppTheme {
  const resolved: Record<ThemeTokenKey, string> = { ...DEFAULT_APP_THEME };
  if (!overrides) return Object.freeze(resolved);
  for (const key of Object.keys(DEFAULT_APP_THEME) as ThemeTokenKey[]) {
    const candidate = overrides[key];
    if (isThemeColor(candidate)) resolved[key] = candidate.trim().toUpperCase().replace('#', '#');
  }
  return Object.freeze(resolved);
}

/** CSS variable declarations for the resolved theme. */
export function themeCssVariables(theme: AppTheme): Readonly<Record<string, string>> {
  const variables: Record<string, string> = {};
  for (const key of Object.keys(THEME_CSS_VARIABLES) as ThemeTokenKey[]) {
    variables[THEME_CSS_VARIABLES[key]] = theme[key];
  }
  return Object.freeze(variables);
}

/** Applies theme overrides to a style declaration (browser boot only). */
export function applyThemeToStyle(style: { setProperty(name: string, value: string): void }, theme: AppTheme): void {
  const variables = themeCssVariables(theme);
  for (const name of Object.keys(variables)) style.setProperty(name, variables[name]);
}

/** Composition summary for diagnostics and the me tab. */
export interface AppCompositionSummary {
  readonly surface: AppSurface;
  readonly blockIds: readonly AppBlockId[];
  readonly routes: readonly string[];
  readonly hasHome: boolean;
}

export function describeAppComposition(
  surface: AppSurface,
  overrides: AppBlockOverrides = {},
): AppCompositionSummary {
  const blocks = resolveAppBlocks(surface, overrides);
  return Object.freeze({
    surface,
    blockIds: blocks.map((block) => block.id),
    routes: blocks.map((block) => block.route),
    hasHome: hasHomeBlock(surface),
  });
}
