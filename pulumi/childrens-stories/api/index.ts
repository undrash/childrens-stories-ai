import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';

import {
  awsCurrentAccountId,
  lambdaTimeoutInSeconds,
  logRetentionInDays,
  stackName,
  provider,
  queueVisibilityTimeoutInSeconds,
  childrensBooksConfig,
  awsRegion,
} from '../../config';

export const comfyQueue = new aws.sqs.Queue(
  'comfy-queue',
  {
    name: `${stackName}-comfy.fifo`,
    visibilityTimeoutSeconds: queueVisibilityTimeoutInSeconds,
    maxMessageSize: 262144,
    receiveWaitTimeSeconds: 20,
    sqsManagedSseEnabled: true,
    fifoQueue: true,
    contentBasedDeduplication: true,
  },
  { provider },
);

export const imageTable = new aws.dynamodb.Table(
  'image-table',
  {
    name: `${stackName}-images`,
    attributes: [
      {
        name: 'id',
        type: 'S',
      },
    ],
    billingMode: 'PAY_PER_REQUEST',
    hashKey: 'id',
  },
  { provider },
);

const dynamoCrudPolicy = new aws.iam.Policy(
  'api-lambda-dynamo-crud',
  {
    name: `${stackName}-api-lambda-dynamo-crud`,
    policy: pulumi.all([imageTable.arn]).apply(([imageTableArn]) =>
      JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Action: [
              'dynamodb:BatchGetItem',
              'dynamodb:BatchWriteItem',
              'dynamodb:ConditionCheckItem',
              'dynamodb:PutItem',
              'dynamodb:DescribeTable',
              'dynamodb:DeleteItem',
              'dynamodb:GetItem',
              'dynamodb:Scan',
              'dynamodb:Query',
              'dynamodb:UpdateItem',
            ],
            Effect: 'Allow',
            Resource: [`${imageTableArn}*`],
          },
        ],
      }),
    ),
  },
  { provider },
);

const lambdaSendSqsMessagePolicy = new aws.iam.Policy(
  'api-lambda-send-sqs-policy',
  {
    name: `${stackName}-lambda-api-sqs-write-policy`,
    policy: pulumi.all([comfyQueue.arn]).apply(([comfyQueueArn]) =>
      JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Action: ['sqs:SendMessage'],
            Effect: 'Allow',
            Resource: [comfyQueueArn],
          },
        ],
      }),
    ),
  },
  { provider },
);

const apiLambdaLoggingPolicy = new aws.iam.Policy(
  'api-lambda-logging',
  {
    name: `${stackName}-api-logging`,
    policy: pulumi.all([awsCurrentAccountId]).apply(([accountId]) =>
      JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Action: ['logs:CreateLogStream', 'logs:PutLogEvents'],
            Effect: 'Allow',
            Resource: `arn:aws:logs:${aws.config.region}:${accountId}:log-group:*`,
          },
        ],
      }),
    ),
  },
  { provider },
);

const apiLambdaRole = new aws.iam.Role(
  'api-lambda-role',
  {
    name: `${stackName}-api-lambda`,
    assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
      Service: ['lambda.amazonaws.com'],
    }),
    managedPolicyArns: [
      apiLambdaLoggingPolicy.arn,
      dynamoCrudPolicy.arn,
      lambdaSendSqsMessagePolicy.arn,
    ],
  },
  { provider },
);

const apiKey = childrensBooksConfig.requireSecret('apiKey');

const apiLambda = new aws.lambda.Function(
  'childrens-stories-api-lambda',
  {
    name: `${stackName}-api-lambda`,
    description: "Children's Books API Lambda",
    code: new pulumi.asset.FileArchive('../../dist/api'),
    runtime: aws.lambda.Runtime.NodeJS18dX,
    role: apiLambdaRole.arn,
    handler: 'index.handler',
    timeout: lambdaTimeoutInSeconds,
    environment: {
      variables: {
        REGION: awsRegion,
        IMAGE_TABLE_NAME: imageTable.name,
        API_KEY: apiKey,
        COMFY_QUEUE_URL: comfyQueue.url,
      },
    },
  },
  { provider },
);

const apiLambdaLogGroup = new aws.cloudwatch.LogGroup(
  'childrens-stories-api-lambda-log-group',
  {
    name: pulumi.interpolate`/aws/lambda/${apiLambda.name}`,
    retentionInDays: logRetentionInDays,
  },
  { provider },
);

const api = new awsx.classic.apigateway.API(
  `${stackName}-api`,
  {
    routes: [
      {
        path: '/{proxy+}',
        method: 'ANY',
        eventHandler: apiLambda,
      },
    ],
  },
  { provider },
);

export const apiEndpoint = pulumi.interpolate`${api.url}`;
