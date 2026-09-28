import express from 'express';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { analyze } from './rules.js';
import { captureRepository, repositoryIdentity, LIMITS } from './github.js';
import { demoSnapshot } from './demo.js';
import { AppError, commitSha } from './errors.js';

export function createApp({ store, capture = captureRepository }) {
  const app = express();
  let scanning = false;
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    // Local-only application: reject browser writes from other origins.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin) {
      let origin;
      try {
        origin = new URL(req.headers.origin);
      } catch {
        return res.status(403).json({ error: 'Untrusted origin.' });
      }
      if (
        !['localhost', '127.0.0.1'].includes(origin.hostname) ||
        !['http:', 'https:'].includes(origin.protocol)
      )
        return res.status(403).json({ error: 'Untrusted origin.' });
    }
    next();
  });
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '100kb' }));
  app.get('/api/health', (req, res) => res.json({ status: 'ok', scanning, limits: LIMITS }));
  app.get('/api/scans', (req, res) => res.json(store.listScans()));
  app.get('/api/scans/:id', (req, res) => res.json(store.getScan(req.params.id)));
  app.post('/api/scans', async (req, res) => {
    if (scanning)
      throw new AppError('Another scan is in progress. Please wait for it to finish.', 409);
    const identity = repositoryIdentity(req.body?.url);
    const requested = req.body.commit ? commitSha(req.body.commit) : '';
    scanning = true;
    try {
      const snapshot = await capture(identity.url, requested);
      res.status(201).json(store.saveScan(snapshot, analyze(snapshot)));
    } catch (error) {
      // Failed attempts are visible records, never zero-finding successes.
      const failed = store.saveScan({
        ...identity,
        source: 'github',
        commit: requested || null,
        state: 'failed',
        files: [],
        inventory: [],
        inventoryComplete: false,
        exclusions: [],
        error: error instanceof AppError ? error.message : 'Unexpected capture failure.',
      });
      res
        .status(error instanceof AppError ? error.status : 500)
        .json({ error: failed.error, scanId: failed.id });
    } finally {
      scanning = false;
    }
  });
  app.post('/api/demo', (req, res) => {
    const variant = req.body?.variant || 'before';
    if (!['before', 'after', 'delegated'].includes(variant))
      throw new AppError('Choose a supported demo snapshot.');
    const snapshot = demoSnapshot(variant);
    res.status(201).json(store.saveScan(snapshot, analyze(snapshot)));
  });
  app.get('/api/tasks', (req, res) => res.json(store.listTasks()));
  app.post('/api/tasks', (req, res) => res.status(201).json(store.createTask(req.body || {})));
  app.get('/api/tasks/:id', (req, res) => res.json(store.getTask(req.params.id)));
  app.post('/api/tasks/:id/actions', (req, res) =>
    res.json(store.act(req.params.id, req.body || {})),
  );
  app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found.' }));
  const dist = resolve('dist');
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get('/{*path}', (req, res) => res.sendFile(resolve(dist, 'index.html')));
  }
  app.use((error, req, res, next) => {
    const status =
      error instanceof AppError
        ? error.status
        : error.type === 'entity.too.large'
          ? 413
          : error instanceof SyntaxError
            ? 400
            : 500;
    res.status(status).json({ error: status === 500 ? 'Unexpected server error.' : error.message });
  });
  return app;
}
