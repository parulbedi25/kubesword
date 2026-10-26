'use strict';

/**
 * Portable-mode support for the Windows standalone .exe (and friends).
 *
 * electron-builder's portable launcher sets PORTABLE_EXECUTABLE_DIR to the
 * folder containing the exe. When present, ALL app data — the Electron
 * profile AND uploaded kubeconfigs — stays next to the exe instead of
 * %APPDATA% / $HOME, so the app runs portably (e.g. off a USB stick).
 *
 * Kept dependency-free (no electron import) so the logic is unit-testable.
 */

const fs = require('fs');
const path = require('path');

const PORTABLE_DIR_NAME = 'KubeSwordData';

function portableRoot() {
  // Explicit override wins (testing / custom layouts / other platforms).
  if (process.env.KUBESWORD_PORTABLE_DIR) return process.env.KUBESWORD_PORTABLE_DIR;
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    return path.join(process.env.PORTABLE_EXECUTABLE_DIR, PORTABLE_DIR_NAME);
  }
  return null;
}

// Point Electron's userData at the portable dir. Must run before app.ready.
// Returns the portable dir, or null when not in portable mode.
function setupPortablePaths(app, opts = {}) {
  const root = opts.root || portableRoot();
  if (!root) return null;
  fs.mkdirSync(root, { recursive: true });
  if (app && typeof app.setPath === 'function') {
    try {
      app.setPath('userData', root);
    } catch {
      /* already ready / headless — best effort */
    }
  }
  return root;
}

// Where the bundled API server should keep its data (uploaded kubeconfigs).
// Honors an explicit KUBESWORD_DATA env var first.
function serverDataDir(portableRootDir) {
  if (process.env.KUBESWORD_DATA) return process.env.KUBESWORD_DATA;
  if (portableRootDir) return path.join(portableRootDir, 'clusters');
  return undefined;
}

module.exports = { PORTABLE_DIR_NAME, portableRoot, setupPortablePaths, serverDataDir };
