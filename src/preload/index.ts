import { contextBridge, ipcRenderer } from 'electron';
import type { Paper, RefreshResult } from '../shared/types.js';

const api = {
  version: '0.0.1',
  listPapers: (): Promise<Paper[]> => ipcRenderer.invoke('papers:list'),
  refresh: (): Promise<RefreshResult> => ipcRenderer.invoke('papers:refresh'),
  openUrl: (url: string): Promise<void> => ipcRenderer.invoke('shell:open', url),
  onPapersChanged: (cb: () => void): (() => void) => {
    const listener = (): void => cb();
    ipcRenderer.on('papers:changed', listener);
    return () => ipcRenderer.removeListener('papers:changed', listener);
  },
};

contextBridge.exposeInMainWorld('api', api);

export type Api = typeof api;
