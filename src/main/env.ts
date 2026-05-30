import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

let loaded = false;

/**
 * Lightweight env loader. Checks several paths in priority order:
 *   1. process.cwd()/.env.local  — dev mode (electron-vite cwd is the repo)
 *   2. <userData>/.env           — packaged app (user drops a file there)
 *
 * Earlier matches win. Once M7 lands the packaged app will read keys from
 * electron-store via a Settings UI instead.
 */
export function loadEnv(): void {
  if (loaded) return;
  loaded = true;

  const candidates = [
    path.join(process.cwd(), '.env.local'),
    path.join(app.getPath('userData'), '.env'),
  ];

  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    parseInto(file);
  }
}

function parseInto(file: string): void {
  const content = fs.readFileSync(file, 'utf8');
  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
