import { randomUUID } from 'node:crypto';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';

import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { DynamoTable, ImageStatus } from '../_lib';
import { getComfyPipelineFromPrompt } from './comfy';

import createImageFixture from './__fixtures__/create-image.json';
import { handler } from './index';

jest.mock('../_lib/dynamo');
jest.mock('node:crypto', () => ({
  randomUUID: jest.fn(),
}));
jest.mock('./comfy', () => ({
  getComfyPipelineFromPrompt: jest.fn(),
}));
jest.spyOn(Date.prototype, 'toISOString');

const sqsMock = mockClient(SQSClient);

afterEach(() => {
  jest.clearAllMocks();
  sqsMock.reset();
});

const mockCtx = {};

describe('handler', () => {
  it('should create the image', async () => {
    const Images = new (DynamoTable as jest.Mock)();

    Date.prototype.toISOString = jest.fn(() => 'mock-date');

    (randomUUID as jest.Mock).mockReturnValue('mock-uuid');
    (getComfyPipelineFromPrompt as jest.Mock).mockReturnValue('mock-pipeline');

    sqsMock.on(SendMessageCommand).resolves({});

    addAuthToFixture(createImageFixture);
    addPromptToFixture(createImageFixture, 'mock-prompt');

    // @ts-ignore
    const response = await handler(createImageFixture, mockCtx);

    console.log(response);

    const mockImage = {
      id: 'mock-uuid',
      prompt: 'mock-prompt',
      status: ImageStatus.PENDING,
      inferenceConfig: 'mock-pipeline',
      createdAt: 'mock-date',
      updatedAt: 'mock-date',
    };

    expect(response.statusCode).toBe(201);
    expect(response.body).toBe(JSON.stringify(mockImage));

    expect(sqsMock).toHaveReceivedCommandTimes(SendMessageCommand, 1);
    expect(sqsMock).toHaveReceivedCommandWith(SendMessageCommand, {
      QueueUrl: 'test',
      MessageBody: JSON.stringify(mockImage),
      MessageGroupId: 'mock-uuid',
    });

    expect(Images.put).toHaveBeenCalledTimes(1);
    expect(Images.put).toHaveBeenCalledWith(mockImage);
  });
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const addAuthToFixture = (fixture: any) => {
  fixture.headers.Authorization = 'test';
  fixture.multiValueHeaders.Authorization = ['test'];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const addPromptToFixture = (fixture: any, prompt: string) => {
  fixture.body = { ...fixture.body, prompt };
};
