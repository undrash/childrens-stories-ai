import { NextFunction, Request, Response } from 'lambda-api';
import { getEnvValue } from '../_lib';

const API_KEY = getEnvValue('API_KEY');

export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const token = req.headers['Authorization'] || req.headers['authorization'];

  if (token !== API_KEY) {
    return res.status(401).send({ message: 'Unauthorized' });
  }

  next();
};
