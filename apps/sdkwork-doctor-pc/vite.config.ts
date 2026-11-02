import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import { resolveBrowserDistOutDir } from '../../../sdkwork-specs/tools/browser-dist-layout.mjs';
import { createBrowserRuntimeEnvVitePlugin } from '../../../sdkwork-specs/tools/browser-runtime-env-vite.mjs';

const appRoot = path.dirname(fileURLToPath(import.meta.url));

interface BrowserRuntimeDocument {
  environment: string;
  deploymentProfile: 'standalone' | 'cloud';
  profileId: string;
  browserOriginMode: 'same-origin';
  cloudApiBaseUrl?: string;
}

/**
 * Read the checked-in example runtime document for the selected profile.
 * The build emits the same document so a static host carries deploy-time
 * configuration with the artifact.
 */
function readRuntimeDocument(mode: string): BrowserRuntimeDocument {
  const profileId = mode.includes('.') ? mode : 'standalone.development';
  const file = path.join(appRoot, 'config', 'browser', 'runtime-env.' + profileId + '.example.json');
  return JSON.parse(fs.readFileSync(file, 'utf8')) as BrowserRuntimeDocument;
}

function readAppVersion(): string {
  const manifest = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8')) as { version?: string };
  return manifest.version ?? '0.0.0';
}

export default defineConfig(({ mode }) => {
  const profileId = mode.includes('.') ? mode : 'standalone.development';
  const [deploymentProfile = 'standalone', environment = 'development'] = profileId.split('.');
  const document = readRuntimeDocument(profileId);
  const outDir = resolveBrowserDistOutDir(environment, deploymentProfile);

  return {
    plugins: [
      react(),
      createBrowserRuntimeEnvVitePlugin({
        name: 'sdkwork-doctor-pc-runtime-env',
        path: '/runtime-env.json',
        resolveServeDocument: () => JSON.stringify(document),
        resolveBuildAsset: () => JSON.stringify(document),
      }),
    ],
    build: {
      outDir,
      emptyOutDir: true,
      sourcemap: true,
    },
    define: {
      __SDKWORK_DOCTOR_PROFILE_ID__: JSON.stringify(profileId),
      __SDKWORK_DOCTOR_APP_VERSION__: JSON.stringify(readAppVersion()),
    },
    server: {
      host: '127.0.0.1',
      port: Number(process.env.SDKWORK_DOCTOR_PC_DEV_PORT ?? 3911),
    },
    preview: {
      port: Number(process.env.SDKWORK_DOCTOR_PC_PREVIEW_PORT ?? 4911),
    },
  };
});
