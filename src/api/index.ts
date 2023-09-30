import { randomUUID } from 'node:crypto';
import { APIGatewayEvent, Context } from 'aws-lambda';
import { Request, Response } from 'lambda-api';
import createAPI from 'lambda-api';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

import { DynamoTable, getEnvValue, ImageStatus, JSONValue } from '../_lib';
import { authenticate } from './middleware';
import { getComfyPipelineFromPrompt } from './comfy';

const REGION = getEnvValue('REGION');
const IMAGE_TABLE_NAME = getEnvValue('IMAGE_TABLE_NAME');
const COMFY_QUEUE_URL = getEnvValue('COMFY_QUEUE_URL');

const sqs = new SQSClient({ region: REGION });

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

  const now = new Date().toISOString();

  const imageParams = {
    id: randomUUID(),
    prompt,
    status: ImageStatus.PENDING,
    inferenceConfig: getComfyPipelineFromPrompt(prompt) as unknown as JSONValue,
    createdAt: now,
    updatedAt: now,
  };

  await Images.put(imageParams);

  const sqsCommand = new SendMessageCommand({
    QueueUrl: COMFY_QUEUE_URL,
    MessageBody: JSON.stringify(imageParams),
    // We only use FIFO to ensure no duplicates
    MessageGroupId: randomUUID(),
  });

  await sqs.send(sqsCommand);

  res.status(201).json(imageParams);
});

export const handler = async (event: APIGatewayEvent, context: Context) => {
  return await api.run(event, context);
};
