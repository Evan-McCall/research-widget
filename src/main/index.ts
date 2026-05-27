import { app, BrowserWindow, Menu, Tray, nativeImage, screen } from 'electron';
import Store from 'electron-store';
import path from 'node:path';

type Bounds = { x: number; y: number; width: number; height: number };
type StoreShape = { windowBounds?: Bounds };

const store = new Store<StoreShape>();

let win: BrowserWindow | null = null;
let tray: Tray | null = null;

function createWindow(): void {
  const work = screen.getPrimaryDisplay().workArea;
  const bounds = store.get('windowBounds') ?? {
    width: 360,
    height: 520,
    x: work.x + work.width - 380,
    y: work.y + 40,
  };

  win = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    vibrancy: 'under-window',
    visualEffectState: 'active',
    hasShadow: true,
    resizable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  win.once('ready-to-show', () => win?.show());

  const persist = (): void => {
    if (win && !win.isDestroyed()) {
      store.set('windowBounds', win.getBounds());
    }
  };
  win.on('moved', persist);
  win.on('resized', persist);
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

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    app.dock?.hide();
  }
  createWindow();
  createTray();
});

app.on('window-all-closed', () => {
  // Keep the app running in the tray when the widget is hidden/closed.
});
