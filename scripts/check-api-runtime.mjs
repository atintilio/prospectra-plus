import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Typechecking and Vite resolve extensionless imports which Node ESM cannot load.
// Emit the complete server import graph, then execute it in the actual Node runtime.
const output = mkdtempSync(join(process.cwd(), '.api-runtime-'));
try {
  execFileSync(process.execPath, [resolve('node_modules/typescript/bin/tsc'), '-p', 'tsconfig.api.json',
    '--noEmit', 'false', '--module', 'ES2022', '--moduleResolution', 'Bundler',
    '--outDir', output, '--rootDir', '.'], { stdio: 'inherit' });
  const { default: handler } = await import(pathToFileURL(join(output, 'api/index.js')).href);
  let statusCode;
  let payload;
  const response = {
    status(code) { statusCode = code; return response; },
    json(body) { payload = body; }, setHeader() { return response; }, end() {},
  };
  await handler({ method: 'GET', url: '/api/health', headers: {} }, response);
  if (![200, 503].includes(statusCode) || !['ok', 'not_configured'].includes(payload?.status)) {
    throw new Error('Compiled API health handler did not execute correctly');
  }
  console.log('Compiled API loaded and health handler executed successfully.');
} finally {
  rmSync(output, { recursive: true, force: true });
}
