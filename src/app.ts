import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import { config } from './config.js';
import { requestContext, verifyCsrf } from './middleware/context.js';
import { errorHandler, notFoundHandler } from './lib/http.js';
import { publicRouter } from './routes/public.js';
import { authRouter } from './routes/auth.js';
import { accountRouter } from './routes/account.js';
import { adminRouter } from './routes/admin/index.js';

export function createApp(): express.Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('view engine', 'ejs');
  app.set('views', path.resolve(process.cwd(), 'views'));

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          baseUri: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https://covers.openlibrary.org'],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'self'"],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: null,
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.use(
    express.static(path.resolve(process.cwd(), 'public'), {
      maxAge: config.isProduction ? '7d' : 0,
      etag: true,
    }),
  );

  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(requestContext);
  app.use(verifyCsrf);

  app.use(authRouter);
  app.use(accountRouter);
  app.use(publicRouter);
  app.use('/admin', adminRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
