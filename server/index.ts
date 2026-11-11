import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import speedtestRoutes from './speedtestRoutes.ts';

export async function createApp(
  isProd = process.env.NODE_ENV === 'production',
  httpServer?: http.Server,
) {
  const app = express();

  // Disable ETag on API responses to prevent any 304 caching during speed tests
  app.set('etag', false);

  // Allow CORS and iframe preview embedding for preview hosts
  app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Stream-Id');
    next();
  });

  // Mount high-throughput speedtest & telemetry API routes BEFORE Vite middleware
  app.use('/api', speedtestRoutes);

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: httpServer ? { server: httpServer } : false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  return app;
}

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith('server/index.ts') || process.argv[1].endsWith('server\\index.ts'));

if (isMain) {
  const PORT = Number(process.env.PORT) || 3000;
  const httpServer = http.createServer();
  createApp(process.env.NODE_ENV === 'production', httpServer).then((app) => {
    httpServer.on('request', app);
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`[PULSE NET-METER] Server listening on http://0.0.0.0:${PORT}`);
    });
  });
}
