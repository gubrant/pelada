import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApiApp } from './src/server/app.ts';
import { hasConfiguredSessionSecret } from './src/lib/auth-crypto.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

async function startServer() {
  const app = createApiApp();

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  if (isProduction && !hasConfiguredSessionSecret()) {
    console.warn(
      '[Aviso de Produção] SESSION_SECRET não configurado (mín. 16 caracteres). Reinícios desconectarão sessões.'
    );
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`QuadraMestre servidor rodando na porta ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Falha ao iniciar servidor:', err);
  process.exit(1);
});
