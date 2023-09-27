import { SQSClient, GetQueueAttributesCommand } from '@aws-sdk/client-sqs';
import {
  CloudWatchClient,
  PutMetricDataCommand,
} from '@aws-sdk/client-cloudwatch';
import { ECSClient, DescribeServicesCommand } from '@aws-sdk/client-ecs';
import { getEnvValue } from '../../_lib';

const sqs = new SQSClient();
const cw = new CloudWatchClient();
const ecs = new ECSClient();

export const handler = async () => {
  const COMFY_QUEUE_NAME = getEnvValue('COMFY_QUEUE_NAME');
  const COMFY_QUEUE_URL = getEnvValue('COMFY_QUEUE_URL');
  const ECS_SERVICE_NAME = getEnvValue('ECS_SERVICE_NAME');
  const ECS_CLUSTER = getEnvValue('ECS_CLUSTER');
  const LATENCY_SECONDS = getEnvValue('LATENCY_SECONDS');
  const TIME_PER_MESSAGE = getEnvValue('TIME_PER_MESSAGE');

  const acceptableBacklogPerCapacityUnit =
    Math.floor(parseInt(LATENCY_SECONDS) / parseFloat(TIME_PER_MESSAGE)) || 1;

  const ecsResponse = await ecs.send(
    new DescribeServicesCommand({
      cluster: ECS_CLUSTER,
      services: [ECS_SERVICE_NAME],
    }),
  );

  if (!ecsResponse.services) {
    console.error(JSON.stringify(ecsResponse, null, 2));
    throw new Error('ECS did not return any services.');
  }

  const service = ecsResponse.services.find(
    ({ serviceName }) => serviceName === ECS_SERVICE_NAME,
  );

  if (!service) {
    console.error(JSON.stringify(ecsResponse, null, 2));
    throw new Error(
      `ECS did not return the target service: ${ECS_SERVICE_NAME}`,
    );
  }

  const currentTaskCount =
    Math.trunc(service.runningCount as number) +
    Math.trunc(service.pendingCount as number);

  const sqsResponse = await sqs.send(
    new GetQueueAttributesCommand({
      QueueUrl: COMFY_QUEUE_URL,
      AttributeNames: [
        'ApproximateNumberOfMessages',
        'ApproximateNumberOfMessagesNotVisible',
      ],
    }),
  );

  if (!sqsResponse.Attributes) {
    console.error(JSON.stringify(sqsResponse, null, 2));
    throw new Error('SQS did not return any attributes.');
  }

  const sqsMessageCount =
    parseInt(sqsResponse.Attributes.ApproximateNumberOfMessages) +
    parseInt(sqsResponse.Attributes.ApproximateNumberOfMessagesNotVisible);

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

  Promise.allSettled([approx, scale]);
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
