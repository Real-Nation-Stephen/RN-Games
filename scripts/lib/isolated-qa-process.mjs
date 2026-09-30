import { fork } from 'node:child_process';
/** Separate load generation from request serving so a 150-socket connect burst
 * does not block the same event loop from accepting those very connections. */
export async function startIsolatedQaProcess() {
  const child = fork(new URL('./isolated-qa-worker.mjs', import.meta.url), [], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
  const ready = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('QA server startup timed out')); }, 15000);
    child.once('error', (e) => { clearTimeout(timer); reject(e); });
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`QA server exited during startup (${code})`)); });
    child.once('message', (message) => { clearTimeout(timer); resolve(message); });
  });
  return { ...ready, server: { close() {
    if (child.exitCode != null) return Promise.resolve();
    return new Promise((resolve) => { child.once('exit', resolve); if (child.connected) child.send('close'); else child.kill(); });
  } } };
}
