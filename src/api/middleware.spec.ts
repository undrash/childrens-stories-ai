import { Request, Response } from 'lambda-api';
import { authenticate } from './middleware';

describe('Middleware', () => {
  it('should authenticate the user', () => {
    const req = {} as Request;

    req.headers = {
      Authorization: 'test',
    };

    const send = jest.fn();

    const status = jest.fn().mockReturnValue({
      send,
    });

    const res = {} as Response;

    res.status = status;

    const next = jest.fn();

    authenticate(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should respond with 401', () => {
    const req = {} as Request;

    req.headers = {
      Authorization: 'fail',
    };

    const send = jest.fn();

    const status = jest.fn().mockReturnValue({
      send,
    });

    const res = {} as Response;

    res.status = status;

    const next = jest.fn();

    authenticate(req, res, next);

    expect(status).toHaveBeenCalledWith(401);
    expect(send).toHaveBeenCalledWith({ message: 'Unauthorized' });
  });
});
