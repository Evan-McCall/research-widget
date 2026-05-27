import fs from 'node:fs';
import path from 'node:path';

let loaded = false;

/**
 * Lightweight .env.local loader for dev mode. In production the key will
 * come from electron-store (Settings UI in M7); .env.local is not packaged.
 */
export function loadEnv(): void {
  if (loaded) return;
  loaded = true;

  // process.cwd() is the project root in dev (electron-vite); not meaningful
  // in packaged builds, but we don't ship .env.local there.
  const file = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(file)) return;

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
