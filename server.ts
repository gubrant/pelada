import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiRouter } from './src/server/routes.ts';
import { hasConfiguredSessionSecret } from './src/lib/auth-crypto.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

async function startServer() {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api', apiRouter);
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Rota da API não encontrada.' });
  });

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

  if (isProduction) {
    if (!hasConfiguredSessionSecret()) {
      console.warn(
        '[Aviso de Produção] SESSION_SECRET não configurado (mín. 16 caracteres). Reinícios desconectarão sessões por senha.'
      );
    }
    if (!process.env.RESEND_API_KEY?.trim()) {
      console.warn(
        '[Aviso de Produção] RESEND_API_KEY não configurado. E-mails ficarão registrados apenas no painel para envio manual.'
      );
    }
    const appUrl = process.env.APP_URL?.trim();
    if (!appUrl || appUrl.includes('MY_APP_URL')) {
      console.warn(
        '[Aviso de Produção] APP_URL não configurado. Os links de convite/recuperação usarão o cabeçalho Host da requisição.'
      );
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`QuadraMestre servidor rodando na porta ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Falha ao iniciar servidor:', err);
  process.exit(1);
});
