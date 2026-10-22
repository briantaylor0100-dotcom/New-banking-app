const { spawn } = require('node:child_process');

delete process.env.ELECTRON_RUN_AS_NODE;

const electronPath = require('electron');
const electron = spawn(electronPath, [
  '--in-process-gpu',
  '--disable-gpu',
  '--disable-software-rasterizer',
  '--password-store=basic',
  '--user-data-dir=.electron-data',
  '.'
], { stdio: 'inherit', env: process.env });

electron.on('error', error => {
  console.error(`Could not start Electron: ${error.message}`);
  process.exitCode = 1;
});

electron.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
