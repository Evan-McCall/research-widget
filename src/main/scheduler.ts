import { powerMonitor } from 'electron';
import { refreshAll } from './refresh.js';

const BASE_INTERVAL_MS = 30 * 60 * 1000; // 30 min
const MAX_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 h
const BACKOFF_BASE = 2;

let timer: NodeJS.Timeout | null = null;
let consecutiveFailures = 0;
let notify: () => void = () => {};

/**
 * Start the background refresh loop. The supplied callback fires after
 * each refresh attempt (success or failure) so the renderer can pull the
 * latest list. Safe to call once on app ready.
 */
export function startScheduler(onTick: () => void): void {
  notify = onTick;
  schedule(BASE_INTERVAL_MS);

  powerMonitor.on('suspend', () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
      console.log('[scheduler] paused (suspend)');
    }
  });

  powerMonitor.on('resume', () => {
    console.log('[scheduler] resume → refreshing immediately');
    void tick();
  });
}

function schedule(ms: number): void {
  if (timer) clearTimeout(timer);
  console.log(`[scheduler] next refresh in ${Math.round(ms / 1000)}s`);
  timer = setTimeout(() => void tick(), ms);
}

async function tick(): Promise<void> {
  const result = await refreshAll();
  notify();
  if (result.ok) {
    consecutiveFailures = 0;
    schedule(BASE_INTERVAL_MS);
  } else {
    consecutiveFailures += 1;
    const backoff = Math.min(
      BASE_INTERVAL_MS * Math.pow(BACKOFF_BASE, consecutiveFailures),
      MAX_INTERVAL_MS,
    );
    console.warn(
      `[scheduler] refresh failed (${consecutiveFailures} in a row), backing off to ${Math.round(backoff / 1000)}s`,
    );
    schedule(backoff);
  }
}
