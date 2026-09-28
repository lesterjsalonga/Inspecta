import { createStore } from './store.js';
import { createApp } from './app.js';
const port = Number(process.env.PORT || 3001);
const store = createStore(process.env.INSPECTA_DB || 'data/inspecta.sqlite');
const server = createApp({ store }).listen(port, '127.0.0.1', () => {
  console.log('Inspecta is running at http://127.0.0.1:' + port);
});
function stop() {
  server.close(() => {
    store.close();
    process.exit(0);
  });
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
