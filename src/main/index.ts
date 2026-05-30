import {
  app,
  BrowserWindow,
  Menu,
  Tray,
  ipcMain,
  nativeImage,
  screen,
  shell,
} from 'electron';
import Store from 'electron-store';
import path from 'node:path';
import { loadEnv } from './env.js';
import { rank } from './ranking.js';
import { refreshAll } from './refresh.js';
import { startScheduler } from './scheduler.js';
import { getAllPapers, getLastCachedAt } from './store/papers.js';

loadEnv();
console.log(
  `[boot] S2 key loaded: ${process.env.SEMANTIC_SCHOLAR_API_KEY ? 'yes (' + process.env.SEMANTIC_SCHOLAR_API_KEY.slice(0, 6) + '…)' : 'NO'}`,
);

// Fixed widget size — matches a macOS large 2x2 desktop widget tile (e.g. X).
const WIDGET_WIDTH = 330;
const WIDGET_HEIGHT = 330;

type Position = { x: number; y: number };
type StoreShape = { windowPosition?: Position };

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

  // Live in normal z-order — clicking another app lets it go in front of the
  // widget. Electron's typed levels don't include the macOS-private 'desktop'
  // level, so the cleanest "sits on the wallpaper, ducks behind windows"
  // behavior is just to never call setAlwaysOnTop.
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });

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
      { label: 'Quit', click: () => app.quit() },
    ]),
  );
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
  if (process.platform === 'darwin') {
    app.dock?.hide();
  }
  registerIpc();
  createWindow();
  createTray();
  // Renderer triggers its own initial refresh after load — avoids racing
  // a 'papers:changed' against the renderer's listener registration.
  startScheduler(() => win?.webContents.send('papers:changed'));
});

app.on('window-all-closed', () => {
  // Keep the app running in the tray when the widget is hidden/closed.
});
