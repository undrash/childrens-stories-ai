import { randomUUID } from 'node:crypto';
import { APIGatewayEvent, Context, Handler } from 'aws-lambda';
import { Request, Response } from 'lambda-api';
import createAPI from 'lambda-api';

import { DynamoTable, getEnvValue, ImageStatus } from '../_lib';
import { authenticate } from './middleware';

const REGION = getEnvValue('REGION');
const IMAGE_TABLE_NAME = getEnvValue('IMAGE_TABLE_NAME');


const Images = new DynamoTable({
  name: 'ImageTable',
  region: REGION,
  hashKey: 'id',
  rangeKey: null,
  tableName: IMAGE_TABLE_NAME,
});

const api = createAPI();

api.use(authenticate);

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
