import { startIsolatedQaServer } from './isolated-qa-server.mjs';
const qa = await startIsolatedQaServer({ port: 0 });
process.send({ base: qa.base, dir: qa.dir, config: qa.config });
let closing = false;
function close() {
  if (closing) return;
  closing = true;
  qa.server.close(() => process.exit(0));
  qa.server.closeAllConnections();
}
process.on('message', (message) => { if (message === 'close') close(); });
process.on('disconnect', close);
