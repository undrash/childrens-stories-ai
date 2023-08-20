import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { transformPayload } from './transform-payload';

process.env.API_KEY = process.env.CHILDRENS_BOOKS_API_KEY;

const run = async () => {
  const [, , handlerPath, payloadPath] = process.argv;

  const resolvedPath = path.resolve(handlerPath);
  const imported = await import(resolvedPath);

  const handler = imported.handler;

  const payload = await readFile(payloadPath, 'utf-8');
  const payloadJson = JSON.parse(payload);

  transformPayload(payloadJson);

  const result = await handler(payloadJson);

  if (result.body) {
    result.body = JSON.parse(result.body);

    console.log(JSON.stringify(result.body, null, 2));

    return;
  }

  console.log(JSON.stringify(result, null, 2));
};

run().catch((err) => {
  console.error('Uncaught Error:', err);
});
