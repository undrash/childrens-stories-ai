import { SQSClient, GetQueueAttributesCommand } from '@aws-sdk/client-sqs';
import {
  CloudWatchClient,
  PutMetricDataCommand,
} from '@aws-sdk/client-cloudwatch';
import { ECSClient, DescribeServicesCommand } from '@aws-sdk/client-ecs';

// Leave outside of Lambda to benefit from globals
const COMFY_QUEUE_NAME = process.env.COMFY_QUEUE_NAME as string;
const SQS_QUEUE_URL = process.env.SQS_QUEUE_URL as string;
const ECS_SERVICE_NAME = process.env.ECS_SERVICE_NAME as string;
const ECS_CLUSTER = process.env.ECS_CLUSTER as string;
const LATENCY_SECONDS = process.env.LATENCY_SECONDS as string;
const TIME_PER_MESSAGE = process.env.TIME_PER_MESSAGE as string;

const sqs = new SQSClient();
const cw = new CloudWatchClient();
const ecs = new ECSClient();

export const handler = async () => {
  const acceptableBacklogPerCapacityUnit = Math.floor(
    parseInt(LATENCY_SECONDS) / parseFloat(TIME_PER_MESSAGE),
  );

  const ecsResponse = await ecs.send(
    new DescribeServicesCommand({
      cluster: ECS_CLUSTER,
      services: [ECS_SERVICE_NAME],
    }),
  );

  const serviceIndex = ecsResponse.services!.findIndex(
    ({ serviceName }) => serviceName === ECS_SERVICE_NAME,
  );

  const service = ecsResponse.services![serviceIndex];

  // Set the desired task count by running-count and pending-count. If its pending, its trying to be desired!
  let currentTaskCount;

  try {
    currentTaskCount =
      Math.trunc(service.runningCount as number) +
      Math.trunc(service.pendingCount as number);
    console.log(`Current ECS Task(s): ${currentTaskCount}`);
  } catch (error) {
    currentTaskCount = 0;
    console.log('[WARNING]: Service is not available, defaulting Task to 0.');
  }

  const sqsResponse = await sqs.send(
    new GetQueueAttributesCommand({
      QueueUrl: SQS_QUEUE_URL,
      AttributeNames: [
        'ApproximateNumberOfMessages',
        'ApproximateNumberOfMessagesNotVisible',
      ],
    }),
  );

  const sqsMessageCount =
    parseInt(sqsResponse.Attributes!.ApproximateNumberOfMessages) +
    parseInt(sqsResponse.Attributes!.ApproximateNumberOfMessagesNotVisible);

  console.log(`Queue Message(s): ${sqsMessageCount}`);

  const desiredTaskCount = Math.ceil(
    sqsMessageCount / acceptableBacklogPerCapacityUnit,
  );

  console.log(`Desired Task(s): ${desiredTaskCount}`);

  const scaleAdjustment = desiredTaskCount - currentTaskCount;
  console.log(`Required Adjustment of Task(s): ${scaleAdjustment}`);

  const approx = publishCWMetric(
    'SQS',
    COMFY_QUEUE_NAME,
    'ApproximateNumberOfMessages',
    sqsMessageCount,
  );

  const scale = publishCWMetric(
    'SQS',
    COMFY_QUEUE_NAME,
    'ScaleAdjustmentTaskCount',
    scaleAdjustment,
  );

  const desired = publishCWMetric(
    'SQS',
    COMFY_QUEUE_NAME,
    'DesiredTasks',
    desiredTaskCount,
  );

  Promise.allSettled([approx, scale, desired]);
};

async function publishCWMetric(
  dimension: string,
  dimensionValue: string,
  metric: string,
  metricValue: number,
) {
  await cw.send(
    new PutMetricDataCommand({
      Namespace: 'SQS AutoScaling',
      MetricData: [
        {
          MetricName: metric,
          Dimensions: [
            {
              Name: dimension,
              Value: dimensionValue,
            },
          ],
          Timestamp: new Date(),
          Value: metricValue,
        },
      ],
    }),
  );
}
