import { SQSClient, GetQueueAttributesCommand } from '@aws-sdk/client-sqs';
import {
  AutoScalingClient,
  DescribeAutoScalingGroupsCommand,
  SetDesiredCapacityCommand,
} from '@aws-sdk/client-auto-scaling';
import { getEnvValue } from '../../_lib';

const sqsClient = new SQSClient();
const autoScalingClient = new AutoScalingClient();

const COMFY_QUEUE_NAME = getEnvValue('COMFY_QUEUE_NAME');
const AUTOSCALING_GROUP = getEnvValue('AUTOSCALING_GROUP');

// Spin up an EC2 from the autoscaling group if there are messages in the queue.
// NOTE: This function returns booleans to be used by step functions.
export const handler = async () => {
  const getQueueAttributesParams = {
    QueueUrl: COMFY_QUEUE_NAME,
    AttributeNames: [
      'ApproximateNumberOfMessages',
      'ApproximateNumberOfMessagesNotVisible',
    ],
  };

  const messageCountResponse = await sqsClient.send(
    new GetQueueAttributesCommand(getQueueAttributesParams),
  );

  const messageCount =
    parseInt(messageCountResponse.Attributes!.ApproximateNumberOfMessages) +
    parseInt(
      messageCountResponse.Attributes!.ApproximateNumberOfMessagesNotVisible,
    );

  const describeAutoScalingGroupsParams = {
    AutoScalingGroupNames: [AUTOSCALING_GROUP],
  };

  const response = await autoScalingClient.send(
    new DescribeAutoScalingGroupsCommand(describeAutoScalingGroupsParams),
  );
  const asgDesiredCapacity = response.AutoScalingGroups![0].DesiredCapacity;

  // First message and asg has no capacity.
  if (Math.trunc(messageCount) > 0 && asgDesiredCapacity === 0) {
    // Starting from Zero is true!
    const setDesiredCapacityParams = {
      AutoScalingGroupName: AUTOSCALING_GROUP,
      DesiredCapacity: 1,
    };

    await autoScalingClient.send(
      new SetDesiredCapacityCommand(setDesiredCapacityParams),
    );

    console.log('Set ASG Desired Capacity to 1');

    // Return value used by step functions.
    return true;
  }

  // Return value used by step functions.
  return false;
};
