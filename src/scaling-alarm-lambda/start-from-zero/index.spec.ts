import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';

import { SQSClient, GetQueueAttributesCommand } from '@aws-sdk/client-sqs';
import {
  AutoScalingClient,
  DescribeAutoScalingGroupsCommand,
  SetDesiredCapacityCommand,
} from '@aws-sdk/client-auto-scaling';

import { handler } from './index';

const sqsMock = mockClient(SQSClient);
const autoScalingMock = mockClient(AutoScalingClient);

const mockDate = new Date();

beforeEach(() => {
  jest.clearAllMocks();
  sqsMock.reset();
  sqsMock.reset();
  autoScalingMock.reset();
});

describe('Start from Zero Lambda', () => {
  it('should set ASG desired capacity to 1', async () => {
    sqsMock.on(GetQueueAttributesCommand).resolves({
      Attributes: {
        ApproximateNumberOfMessages: '1',
        ApproximateNumberOfMessagesNotVisible: '0',
      },
    });

    autoScalingMock.on(DescribeAutoScalingGroupsCommand).resolves({
      AutoScalingGroups: [
        {
          AutoScalingGroupName: '',
          MinSize: 0,
          MaxSize: 0,
          DefaultCooldown: 0,
          AvailabilityZones: [],
          HealthCheckType: '',
          CreatedTime: mockDate,
          DesiredCapacity: 0,
        },
      ],
    });

    autoScalingMock.on(SetDesiredCapacityCommand).resolves({});

    const result = await handler();

    expect(result).toEqual(true);
    expect(autoScalingMock).toHaveReceivedCommandTimes(
      SetDesiredCapacityCommand,
      1,
    );
    expect(autoScalingMock).toHaveReceivedCommandWith(
      SetDesiredCapacityCommand,
      {
        AutoScalingGroupName: process.env.AUTOSCALING_GROUP,
        DesiredCapacity: 1,
      },
    );
  });

  it('should not set ASG desired capacity to 1', async () => {
    sqsMock.on(GetQueueAttributesCommand).resolves({
      Attributes: {
        ApproximateNumberOfMessages: '0',
        ApproximateNumberOfMessagesNotVisible: '0',
      },
    });

    autoScalingMock.on(DescribeAutoScalingGroupsCommand).resolves({
      AutoScalingGroups: [
        {
          AutoScalingGroupName: '',
          MinSize: 0,
          MaxSize: 0,
          DefaultCooldown: 0,
          AvailabilityZones: [],
          HealthCheckType: '',
          CreatedTime: mockDate,
          DesiredCapacity: 0,
        },
      ],
    });

    autoScalingMock.on(SetDesiredCapacityCommand).resolves({});

    const result = await handler();

    expect(result).toEqual(false);
    expect(autoScalingMock).not.toHaveReceivedCommand(
      SetDesiredCapacityCommand,
    );
  });
});
