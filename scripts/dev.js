import { spawn } from 'node:child_process';
const processes = [
  spawn(process.execPath, ['--watch', 'server/index.js'], { stdio: 'inherit' }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit' }),
];
function stop() {
  for (const child of processes) child.kill();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const child of processes) child.on('exit', stop);
