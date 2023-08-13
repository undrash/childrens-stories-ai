import { randomUUID } from 'node:crypto';
import { APIGatewayEvent, Context, Handler } from 'aws-lambda';
import { Request, Response } from 'lambda-api';
import createAPI from 'lambda-api';

import { DynamoTable, getEnvValue, ImageStatus } from '../_lib';

const Images = new DynamoTable({
  name: 'ImageTable',
  region: getEnvValue('REGION'),
  hashKey: 'id',
  rangeKey: null,
  tableName: getEnvValue('IMAGE_TABLE_NAME'),
});

const api = createAPI();

api.get('/status', async (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

api.post('/images', async (req: Request, res: Response) => {
  const { prompt } = req.body;

  const image = await Images.put({
    id: randomUUID(),
    prompt,
    status: ImageStatus.PENDING,
  });

  res.status(201).json(image);
});

export const handler: Handler = async (
  event: APIGatewayEvent,
  context: Context,
) => {
  return await api.run(event, context);
};
