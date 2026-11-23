import express from 'express';
import { isDatabaseConfigured } from '../db/index.ts';
import { ensureSchema } from '../db/ensure-schema.ts';
import { apiRouter } from './routes.ts';

export function createApiApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });
  app.use(express.json({ limit: '4mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', dbConfigured: isDatabaseConfigured() });
  });

  app.use('/api', async (_req, res, next) => {
    if (!isDatabaseConfigured()) {
      res.status(503).json({
        error:
          'Banco de dados não configurado no servidor. Configure DATABASE_URL (ou SQL_HOST, SQL_USER, SQL_PASSWORD e SQL_DB_NAME) nas variáveis de ambiente.',
      });
      return;
    }
    try {
      await ensureSchema();
      next();
    } catch (err) {
      console.error('Erro ao conectar/inicializar PostgreSQL:', err);
      res.status(503).json({
        error:
          'Não foi possível conectar ao banco PostgreSQL. Verifique a variável DATABASE_URL e as permissões de acesso.',
      });
    }
  });

  app.use('/api', apiRouter);
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Rota da API não encontrada.' });
  });

  return app;
}
