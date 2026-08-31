import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createRecruitmentRuntime } from './server/app.js';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT || 5173);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}

const runtimeEnv = {
  ...process.env,
  RECRUITMENT_COOKIE_SECRET:
    process.env.RECRUITMENT_COOKIE_SECRET ||
    (isProduction ? '' : 'patch-website-recruitment-local-cookie-secret-only'),
  RECRUITMENT_REVIEWER_SECRET:
    process.env.RECRUITMENT_REVIEWER_SECRET || (isProduction ? '' : 'LOCALREVIEW1'),
};

const runtime = await createRecruitmentRuntime({
  env: runtimeEnv,
  projectRoot,
  staticDirectory: isProduction ? path.join(projectRoot, 'dist') : '',
});

let vite = null;

if (!isProduction) {
  const { createServer: createViteServer } = await import('vite');
  vite = await createViteServer({
    appType: 'spa',
    root: projectRoot,
    server: { middlewareMode: true },
  });
  runtime.app.use(vite.middlewares);
}

const server = runtime.app.listen(port, '0.0.0.0', () => {
  console.log(`Patch Website listening on http://localhost:${port}`);
});

let isClosing = false;

async function close() {
  if (isClosing) return;
  isClosing = true;

  await new Promise((resolve) => server.close(resolve));
  await vite?.close();
  runtime.close();
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    try {
      await close();
      process.exit(0);
    } catch (error) {
      console.error('Website shutdown failed.', error);
      process.exit(1);
    }
  });
}
