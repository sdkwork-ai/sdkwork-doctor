/**
 * Test-only ESM resolve hook: lets `node --test` load authored TypeScript
 * sources whose relative imports are extensionless (the convention Vite and
 * `tsc --moduleResolution Bundler` use). Node strips the types itself; only the
 * specifier is rewritten.
 */
import fs from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

const CANDIDATE_EXTENSIONS = ['.ts', '.tsx', '/index.ts', '/index.tsx'];

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && context.parentURL) {
      const target = new URL(specifier, context.parentURL);
      if (!/\.[cm]?[jt]sx?$/u.test(target.pathname)) {
        for (const extension of CANDIDATE_EXTENSIONS) {
          const candidate = new URL(target.href + extension);
          if (fs.existsSync(fileURLToPath(candidate))) {
            return nextResolve(candidate.href, context);
          }
        }
      }
    }
    return nextResolve(specifier, context);
  },
});
