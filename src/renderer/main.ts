declare global {
  interface Window {
    api: { version: string };
  }
}

const status = document.getElementById('status');
if (status && window.api) {
  status.textContent = `v${window.api.version}`;
}

document.getElementById('refresh')?.addEventListener('click', () => {
  // M2: wire to real refresh
  console.log('refresh clicked');
});

document.getElementById('settings')?.addEventListener('click', () => {
  // M7: settings modal
  console.log('settings clicked');
});

export {};
