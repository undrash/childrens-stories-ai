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
  it('should scale up +24 to 25', async () => {
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
    expect(cwMock).toHaveReceivedCommandWith(PutMetricDataCommand, {
      Namespace: 'SQS AutoScaling',
      MetricData: [
        {
          MetricName: 'ScaleAdjustmentTaskCount',
          Dimensions: [
            {
              Name: 'SQS',
              Value: process.env.COMFY_QUEUE_NAME,
            },
          ],
          Timestamp: mockDate,
          Value: 24,
        },
      ],
    });
    expect(cwMock).toHaveReceivedCommandWith(PutMetricDataCommand, {
      Namespace: 'SQS AutoScaling',
      MetricData: [
        {
          MetricName: 'DesiredTasks',
          Dimensions: [
            {
              Name: 'SQS',
              Value: process.env.COMFY_QUEUE_NAME,
            },
          ],
          Timestamp: mockDate,
          Value: 25,
        },
      ],
    });
  });

  it('should scale down -37 to 13', async () => {
    const mockEcsResponse = {
      services: [
        {
          serviceName: process.env.ECS_SERVICE_NAME,
          runningCount: 25,
          pendingCount: 25,
          desiredCount: 1,
        },
      ],
    };

    const mockSqsResponse = {
      Attributes: {
        ApproximateNumberOfMessages: '50',
        ApproximateNumberOfMessagesNotVisible: '0',
      },
    };

    ecsMock.on(DescribeServicesCommand).resolves(mockEcsResponse);
    sqsMock.on(GetQueueAttributesCommand).resolves(mockSqsResponse);

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
          Value: 50,
        },
      ],
    });
    expect(cwMock).toHaveReceivedCommandWith(PutMetricDataCommand, {
      Namespace: 'SQS AutoScaling',
      MetricData: [
        {
          MetricName: 'ScaleAdjustmentTaskCount',
          Dimensions: [
            {
              Name: 'SQS',
              Value: process.env.COMFY_QUEUE_NAME,
            },
          ],
          Timestamp: mockDate,
          Value: -37,
        },
      ],
    });
    expect(cwMock).toHaveReceivedCommandWith(PutMetricDataCommand, {
      Namespace: 'SQS AutoScaling',
      MetricData: [
        {
          MetricName: 'DesiredTasks',
          Dimensions: [
            {
              Name: 'SQS',
              Value: process.env.COMFY_QUEUE_NAME,
            },
          ],
          Timestamp: mockDate,
          Value: 13,
        },
      ],
    });
  });

  it('should scale down -38 to 12', async () => {
    const mockEcsResponse = {
      services: [
        {
          serviceName: process.env.ECS_SERVICE_NAME,
          runningCount: 25,
          pendingCount: 25,
          desiredCount: 1,
        },
      ],
    };

    const mockSqsResponse = {
      Attributes: {
        ApproximateNumberOfMessages: '48',
        ApproximateNumberOfMessagesNotVisible: '0',
      },
    };

    ecsMock.on(DescribeServicesCommand).resolves(mockEcsResponse);
    sqsMock.on(GetQueueAttributesCommand).resolves(mockSqsResponse);

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
          Value: 48,
        },
      ],
    });
    expect(cwMock).toHaveReceivedCommandWith(PutMetricDataCommand, {
      Namespace: 'SQS AutoScaling',
      MetricData: [
        {
          MetricName: 'ScaleAdjustmentTaskCount',
          Dimensions: [
            {
              Name: 'SQS',
              Value: process.env.COMFY_QUEUE_NAME,
            },
          ],
          Timestamp: mockDate,
          Value: -38,
        },
      ],
    });
    expect(cwMock).toHaveReceivedCommandWith(PutMetricDataCommand, {
      Namespace: 'SQS AutoScaling',
      MetricData: [
        {
          MetricName: 'DesiredTasks',
          Dimensions: [
            {
              Name: 'SQS',
              Value: process.env.COMFY_QUEUE_NAME,
            },
          ],
          Timestamp: mockDate,
          Value: 12,
        },
      ],
    });
  });

  it('should scale up +51 to 68', async () => {
    const mockEcsResponse = {
      services: [
        {
          serviceName: process.env.ECS_SERVICE_NAME,
          runningCount: 12,
          pendingCount: 5,
          desiredCount: 17,
        },
      ],
    };

    const mockSqsResponse = {
      Attributes: {
        ApproximateNumberOfMessages: '240',
        ApproximateNumberOfMessagesNotVisible: '32',
      },
    };

    ecsMock.on(DescribeServicesCommand).resolves(mockEcsResponse);
    sqsMock.on(GetQueueAttributesCommand).resolves(mockSqsResponse);

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
          Value: 272,
        },
      ],
    });
    expect(cwMock).toHaveReceivedCommandWith(PutMetricDataCommand, {
      Namespace: 'SQS AutoScaling',
      MetricData: [
        {
          MetricName: 'ScaleAdjustmentTaskCount',
          Dimensions: [
            {
              Name: 'SQS',
              Value: process.env.COMFY_QUEUE_NAME,
            },
          ],
          Timestamp: mockDate,
          Value: 51,
        },
      ],
    });
    expect(cwMock).toHaveReceivedCommandWith(PutMetricDataCommand, {
      Namespace: 'SQS AutoScaling',
      MetricData: [
        {
          MetricName: 'DesiredTasks',
          Dimensions: [
            {
              Name: 'SQS',
              Value: process.env.COMFY_QUEUE_NAME,
            },
          ],
          Timestamp: mockDate,
          Value: 68,
        },
      ],
    });
  });

  it('should scale up +4 to 5', async () => {
    process.env.LATENCY_SECONDS = '120';
    process.env.TIME_PER_MESSAGE = '5';

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
    expect(cwMock).toHaveReceivedCommandWith(PutMetricDataCommand, {
      Namespace: 'SQS AutoScaling',
      MetricData: [
        {
          MetricName: 'ScaleAdjustmentTaskCount',
          Dimensions: [
            {
              Name: 'SQS',
              Value: process.env.COMFY_QUEUE_NAME,
            },
          ],
          Timestamp: mockDate,
          Value: 4,
        },
      ],
    });
    expect(cwMock).toHaveReceivedCommandWith(PutMetricDataCommand, {
      Namespace: 'SQS AutoScaling',
      MetricData: [
        {
          MetricName: 'DesiredTasks',
          Dimensions: [
            {
              Name: 'SQS',
              Value: process.env.COMFY_QUEUE_NAME,
            },
          ],
          Timestamp: mockDate,
          Value: 5,
        },
      ],
    });
  });

  it('should throw on missing ECS services', async () => {
    ecsMock.on(DescribeServicesCommand).resolves({});

    await expect(handler()).rejects.toThrow(/ECS did not return any services./);
  });

  it('should throw on missing SQS attributes', async () => {
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

    ecsMock.on(DescribeServicesCommand).resolves(mockEcsResponse);

    sqsMock.on(GetQueueAttributesCommand).resolves({});

    await expect(handler()).rejects.toThrow(
      /SQS did not return any attributes./,
    );
  });
});
