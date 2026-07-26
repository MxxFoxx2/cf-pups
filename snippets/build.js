import * as esbuild from 'esbuild';
import { readFileSync } from 'fs';

const result = await esbuild.build({
  entryPoints: ['src/index.js'],
  bundle: true,
  minify: true,
  format: 'esm',
  target: 'esnext',
  outfile: 'dist/snippets.bundle.js',
  external: ['cloudflare:sockets'],
  metafile: true,
});

const bundleSize = readFileSync('dist/snippets.bundle.js').length;
console.log(`Bundle size: ${bundleSize} bytes (${(bundleSize / 1024).toFixed(2)} KB)`);
console.log(`Cloudflare Snippets limit: 32 KB`);
console.log(`Status: ${bundleSize <= 32768 ? '✓ OK' : '✗ EXCEEDS LIMIT'}`);
