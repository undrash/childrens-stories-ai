import { readFile } from 'node:fs/promises';
import * as path from 'node:path';

const run = async () => {
  const [, , handlerPath, payloadPath] = process.argv;

  const resolvedPath = path.resolve(handlerPath);
  const imported = await import(resolvedPath);

  const handler = imported.handler;

  const payload = await readFile(payloadPath, 'utf-8');
  const payloadJson = JSON.parse(payload);

  const result = await handler(payloadJson);

  console.log(JSON.stringify(result, null, 2));
};

run().catch((err) => {
  console.error('Uncaught Error:', err);
});
