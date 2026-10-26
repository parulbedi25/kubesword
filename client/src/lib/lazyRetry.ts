import { lazy } from 'react';

/**
 * React.lazy with retries: transient chunk-load failures (dev-server hiccup,
 * flaky network, brief restart) are retried instead of instantly blanking
 * the UI. If the chunk is genuinely gone (stale deploy), reload once per
 * session to fetch fresh assets, then let the error boundary take over.
 */
export function lazyWithRetry<T extends { default: React.ComponentType<any> }>(
  importer: () => Promise<T>,
  retries = 2,
): React.LazyExoticComponent<T['default']> {
  return lazy(() =>
    attempt(importer, retries).catch((err) => {
      if (isChunkError(err) && !consumeReloadFlag()) {
        window.location.reload();
        // Return a never-resolving promise while the reload happens.
        return new Promise<T>(() => {});
      }
      throw err;
    }),
  );
}

function attempt<T>(importer: () => Promise<T>, left: number): Promise<T> {
  return importer().catch((err) => {
    if (left <= 0) throw err;
    return new Promise<T>((resolve, reject) => {
      setTimeout(() => attempt(importer, left - 1).then(resolve, reject), 800);
    });
  });
}

function isChunkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /loading chunk|dynamically imported module|failed to fetch|importing a module script failed/i.test(msg);
}

// Returns true if a reload was already attempted this session.
function consumeReloadFlag(): boolean {
  try {
    if (sessionStorage.getItem('ks-chunk-reloaded')) return true;
    sessionStorage.setItem('ks-chunk-reloaded', '1');
    return false;
  } catch {
    return true; // storage unavailable — never loop reloads
  }
}
