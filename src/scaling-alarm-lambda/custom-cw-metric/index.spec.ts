import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';

import { SQSClient, GetQueueAttributesCommand } from '@aws-sdk/client-sqs';
import {
  CloudWatchClient,
  PutMetricDataCommand,
} from '@aws-sdk/client-cloudwatch';
import { ECSClient, DescribeServicesCommand } from '@aws-sdk/client-ecs';

import { handler } from './index';

const mockDate = new Date('2023-01-01T00:00:00Z');

jest.spyOn(global, 'Date').mockImplementation(() => mockDate);
const sqsMock = mockClient(SQSClient);
const cwMock = mockClient(CloudWatchClient);
const ecsMock = mockClient(ECSClient);

beforeEach(() => {
  jest.clearAllMocks();
  sqsMock.reset();
  cwMock.reset();
  ecsMock.reset();
});

describe('Scaling Alarm Lambda', () => {
  it('should scale up', async () => {
    const mockEcsResponse = {
      services: [
        {
          serviceName: process.env.ECS_SERVICE_NAME,
          runningCount: 1,
          pendingCount: 0,
          desiredCount: 1,
        },
      ],
    };

    const mockSqsResponse = {
      Attributes: {
        ApproximateNumberOfMessages: '100',
        ApproximateNumberOfMessagesNotVisible: '0',
      },
    };

    ecsMock.on(DescribeServicesCommand).resolves(mockEcsResponse);
    sqsMock.on(GetQueueAttributesCommand).resolves(mockSqsResponse);
    cwMock.on(PutMetricDataCommand).resolves({});

    await handler();

    expect(ecsMock).toHaveReceivedCommandTimes(DescribeServicesCommand, 1);
    expect(sqsMock).toHaveReceivedCommandTimes(GetQueueAttributesCommand, 1);
    expect(cwMock).toHaveReceivedCommandTimes(PutMetricDataCommand, 3);
    expect(cwMock).toHaveReceivedCommandWith(PutMetricDataCommand, {
      Namespace: 'SQS AutoScaling',
      MetricData: [
        {
          MetricName: 'ApproximateNumberOfMessages',
          Dimensions: [
            {
              Name: 'SQS',
              Value: process.env.COMFY_QUEUE_NAME,
            },
          ],
          Timestamp: mockDate,
          Value: 100,
        },
      ],
    });
  });
});
