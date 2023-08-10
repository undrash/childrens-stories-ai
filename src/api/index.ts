import { APIGatewayEvent, Context, Handler } from 'aws-lambda';
import { Request, Response } from 'lambda-api';

import createAPI from 'lambda-api';

const api = createAPI();

api.get('/status', async (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

export const handler: Handler = async (
  event: APIGatewayEvent,
  context: Context,
) => {
  return await api.run(event, context);
};
