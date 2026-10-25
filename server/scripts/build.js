// Bundles server/src -> server/dist/index.js (single file, zero runtime
// node_modules). The packaged desktop app + slim Docker image ship only
// this bundle, which is why the installers stay small and work offline.
const esbuild = require('esbuild');
const path = require('path');

esbuild
  .build({
    entryPoints: [path.join(__dirname, '..', 'src', 'index.js')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    minify: true,
    sourcemap: false,
    outfile: path.join(__dirname, '..', 'dist', 'index.js'),
    // Optional native accelerators for `ws`; leaving them external lets
    // `ws` fall back to its pure-JS implementation at runtime.
    external: ['bufferutil', 'utf-8-validate'],
    logLevel: 'warning',
  })
  .then(() => console.log('server bundle: src -> dist/index.js OK'))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
