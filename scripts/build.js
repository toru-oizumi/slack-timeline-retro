import * as esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

await esbuild.build({
  entryPoints: [resolve(projectRoot, 'src/index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  outfile: resolve(projectRoot, 'dist/index.js'),
  sourcemap: true,
  minify: false,
  external: [
    // Node.js built-in modules
    'node:*',
    // Keep native modules external
    '@slack/web-api',
    '@google-cloud/pubsub',
  ],
  alias: {
    '@': resolve(projectRoot, 'src'),
    '@domain': resolve(projectRoot, 'src/domain'),
    '@usecases': resolve(projectRoot, 'src/usecases'),
    '@infra': resolve(projectRoot, 'src/infrastructure'),
    '@presentation': resolve(projectRoot, 'src/presentation'),
  },
  banner: {
    js: `
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
`.trim(),
  },
});

console.log('Build completed successfully!');
