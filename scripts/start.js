const { spawn } = require('node:child_process');

delete process.env.ELECTRON_RUN_AS_NODE;

const electronPath = require('electron');
const electronArgs = [
  '--password-store=basic',
  '--user-data-dir=.electron-data',
  '.'
];

// Linux containers and some managed desktop environments do not allow
// Chromium's user-namespace sandbox to start. Keep Electron's renderer
// process sandbox enabled in main.js; disable only Chromium's outer sandbox.
if (process.platform === 'linux') electronArgs.unshift('--no-sandbox');

const electron = spawn(electronPath, electronArgs, { stdio: 'inherit', env: process.env });

electron.on('error', error => {
  console.error(`Could not start Electron: ${error.message}`);
  process.exitCode = 1;
});

electron.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
