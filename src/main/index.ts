import { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, screen, shell } from 'electron';
import Store from 'electron-store';
import path from 'node:path';
import { loadEnv } from './env.js';
import { rank } from './ranking.js';
import { refreshAll } from './refresh.js';
import { startScheduler } from './scheduler.js';
import { getAllPapers, getLastCachedAt } from './store/papers.js';

// loadEnv runs after app ready so app.getPath('userData') is valid in
// packaged builds (env.ts touches app.getPath).

// Fixed widget size — matches a macOS large 2x2 desktop widget tile (e.g. X).
const WIDGET_WIDTH = 330;
const WIDGET_HEIGHT = 330;

type Position = { x: number; y: number };
type StoreShape = {
  windowPosition?: Position;
  launchAtLoginEnabled?: boolean;
};

const store = new Store<StoreShape>();

let win: BrowserWindow | null = null;
let tray: Tray | null = null;

function createWindow(): void {
  const work = screen.getPrimaryDisplay().workArea;
  const position = store.get('windowPosition') ?? {
    x: work.x + work.width - WIDGET_WIDTH - 20,
    y: work.y + 40,
  };

  win = new BrowserWindow({
    width: WIDGET_WIDTH,
    height: WIDGET_HEIGHT,
    x: position.x,
    y: position.y,
    frame: false,
    transparent: true,
    // 'fullscreen-ui' is lighter / more transparent than 'under-window';
    // closer to a native macOS desktop widget tile.
    vibrancy: 'fullscreen-ui',
    visualEffectState: 'active',
    hasShadow: true,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    roundedCorners: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Stay on the normal desktop only — don't follow into full-screen Spaces.
  win.setVisibleOnAllWorkspaces(false);

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  win.once('ready-to-show', () => {
    win?.show();
    if (process.env.ELECTRON_RENDERER_URL) {
      win?.webContents.openDevTools({ mode: 'detach' });
    }
  });

  win.on('moved', () => {
    if (win && !win.isDestroyed()) {
      const [x, y] = win.getPosition();
      store.set('windowPosition', { x, y });
    }
  });
  win.on('closed', () => {
    win = null;
  });
}

function createTray(): void {
  tray = new Tray(nativeImage.createEmpty());
  tray.setTitle('🔬');
  tray.setToolTip('Research Widget');
  rebuildTrayMenu();
}

function rebuildTrayMenu(): void {
  if (!tray) return;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Show / Hide',
        click: () => {
          if (!win) {
            createWindow();
            return;
          }
          if (win.isVisible()) win.hide();
          else win.show();
        },
      },
      { type: 'separator' },
      {
        label: 'Launch at login',
        type: 'checkbox',
        checked: store.get('launchAtLoginEnabled') ?? true,
        click: (item) => setLaunchAtLogin(item.checked),
      },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]),
  );
}

function setLaunchAtLogin(enabled: boolean): void {
  store.set('launchAtLoginEnabled', enabled);
  if (app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: false });
  }
  rebuildTrayMenu();
}

function reconcileLoginItem(): void {
  // Only register the login item when running from a packaged .app — we
  // don't want every `npm run dev` invocation to wire itself into login.
  if (!app.isPackaged) return;
  const enabled = store.get('launchAtLoginEnabled') ?? true;
  app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: false });
}

function registerIpc(): void {
  ipcMain.handle('papers:list', (_event, mode: 'balanced' | 'allTime' = 'balanced') =>
    rank(getAllPapers(), 15, mode),
  );
  ipcMain.handle('papers:lastRefreshAt', () => getLastCachedAt());
  ipcMain.handle('papers:refresh', async () => {
    const result = await refreshAll();
    win?.webContents.send('papers:changed');
    return result;
  });
  ipcMain.handle('shell:open', (_event, url: string) => {
    if (typeof url !== 'string') return;
    if (!/^https?:\/\//i.test(url)) return;
    shell.openExternal(url);
  });
}

app.whenReady().then(async () => {
  loadEnv();
  console.log(
    `[boot] S2 key loaded: ${process.env.SEMANTIC_SCHOLAR_API_KEY ? 'yes (' + process.env.SEMANTIC_SCHOLAR_API_KEY.slice(0, 6) + '…)' : 'NO'}`,
  );
  if (process.platform === 'darwin') {
    app.dock?.hide();
  }
  registerIpc();
  createWindow();
  createTray();
  reconcileLoginItem();
  // Renderer triggers its own initial refresh after load — avoids racing
  // a 'papers:changed' against the renderer's listener registration.
  startScheduler(() => win?.webContents.send('papers:changed'));
});

app.on('window-all-closed', () => {
  // Keep the app running in the tray when the widget is hidden/closed.
});
