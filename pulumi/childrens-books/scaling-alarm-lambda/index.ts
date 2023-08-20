import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import { comfyQueue } from '../api';
import { autoScalingGroup } from '../ecs';
import {
  childrensBooksConfig,
  provider,
  stackName,
  awsCurrentAccountId,
  lambdaTimeoutInSeconds,
  logRetentionInDays,
} from '../../config';
import { comfyDiffusionEcsService, comfyEcsCluster } from '../ecs';

// ECS Service Autoscaling
const ecsTarget = new aws.appautoscaling.Target(
  'ecs-autoscaling-target',
  {
    maxCapacity: 10,
    minCapacity: 0,
    // TODO: Change this to cluster.name + service.name
    resourceId: `service/${stackName}/${stackName}`,
    scalableDimension: 'ecs:service:DesiredCount',
    serviceNamespace: 'ecs',
  },
  { provider },
);

const ecsScaleDownPolicy = new aws.appautoscaling.Policy(
  'ecs-scale-down-policy',
  {
    name: `${stackName}-ecs-scale-down`,
    policyType: 'StepScaling',
    resourceId: ecsTarget.resourceId,
    scalableDimension: ecsTarget.scalableDimension,
    serviceNamespace: ecsTarget.serviceNamespace,
    stepScalingPolicyConfiguration: {
      adjustmentType: 'ChangeInCapacity',
      metricAggregationType: 'Average',
      stepAdjustments: [
        {
          scalingAdjustment: -1,
          metricIntervalUpperBound: '0',
        },
      ],
    },
  },
  { provider },
);

const ecsScaleUpPolicy = new aws.appautoscaling.Policy(
  'ecs-scale-up-policy',
  {
    name: `${stackName}-ecs-scale-up`,
    policyType: 'StepScaling',
    resourceId: ecsTarget.resourceId,
    scalableDimension: ecsTarget.scalableDimension,
    serviceNamespace: ecsTarget.serviceNamespace,
    stepScalingPolicyConfiguration: {
      adjustmentType: 'ChangeInCapacity',
      metricAggregationType: 'Average',
      cooldown: 600,
      stepAdjustments: [
        {
          scalingAdjustment: 1,
          metricIntervalLowerBound: '0',
        },
      ],
    },
  },
  { provider },
);

const ec2ScaleDownPolicy = new aws.autoscaling.Policy(
  'ec2-scale-down-policy',
  {
    name: `${stackName}-ec2-scale-down`,
    enabled: true,
    autoscalingGroupName: pulumi.interpolate`${autoScalingGroup.name}`,
    adjustmentType: 'ChangeInCapacity',
    policyType: 'StepScaling',
    stepAdjustments: [
      {
        scalingAdjustment: -1,
        metricIntervalUpperBound: '0',
      },
    ],
  },
  { provider },
);

const ec2ScaleUpPolicy = new aws.autoscaling.Policy(
  'ec2-scale-up-policy',
  {
    name: `${stackName}-ec2-scale-up`,
    enabled: true,
    autoscalingGroupName: pulumi.interpolate`${autoScalingGroup.name}`,
    adjustmentType: 'ChangeInCapacity',
    policyType: 'StepScaling',
    estimatedInstanceWarmup: 600,
    stepAdjustments: [
      {
        scalingAdjustment: 1,
        metricIntervalLowerBound: '0',
      },
    ],
  },
  { provider },
);

export const scaleDownAlarm = new aws.cloudwatch.MetricAlarm(
  'scale-down-alarm',
  {
    name: `${stackName}-scale-down`,
    comparisonOperator: 'LessThanOrEqualToThreshold',
    evaluationPeriods: 150,
    datapointsToAlarm: 150,
    metricName: 'ScaleAdjustmentTaskCount',
    namespace: 'SQS AutoScaling',
    period: 10,
    statistic: 'Average',
    threshold: -1,
    alarmDescription:
      'This metric monitors the down scaling of EC2s based on SQS messages vs running EC2.',
    alarmActions: [ecsScaleDownPolicy.arn, ec2ScaleDownPolicy.arn],
    dimensions: {
      SQS: pulumi.interpolate`${comfyQueue.name}`,
    },
  },
  { provider },
);

export const scaleUpAlarm = new aws.cloudwatch.MetricAlarm(
  'scale-up-alarm',
  {
    name: `${stackName}-scale-up`,
    comparisonOperator: 'GreaterThanOrEqualToThreshold',
    evaluationPeriods: 15,
    datapointsToAlarm: 15,
    metricName: 'ScaleAdjustmentTaskCount',
    namespace: 'SQS AutoScaling',
    period: 10,
    statistic: 'Average',
    threshold: 1,
    alarmDescription:
      'This metric monitors the up scaling of EC2s based on SQS messages vs running EC2.',
    alarmActions: [ecsScaleUpPolicy.arn, ec2ScaleUpPolicy.arn],
    dimensions: {
      SQS: pulumi.interpolate`${comfyQueue.name}`,
    },
  },
  { provider },
);

const lambdaLoggingPolicy = new aws.iam.Policy(
  'cw-metric-lambda-logging-policy',
  {
    name: `${stackName}-cw-metric-logging`,
    description: 'IAM policy to allow logging to CloudWatch',
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

const describeEcsServicesPolicy = new aws.iam.Policy(
  'cw-metric-describe-ecs-services-policy',
  {
    name: `${stackName}-describe-ecs-services`,
    description: 'IAM policy ton describe ECS services',
    policy: JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Action: 'ecs:DescribeServices',
          // TODO: Look into why the service in Pulumi
          // is missing the `arn` property
          Resource: '*',
        },
      ],
    }),
  },
  { provider },
);

const cloudWatchAgentServerPolicy = new aws.iam.Policy(
  'cw-metric-cloudwatch-agent-server-policy',
  {
    name: `${stackName}-cloudwatch-agent-server-policy`,
    path: '/',
    description: 'IAM policy for the custom cloudwatch metrics',
    policy: JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Action: 'cloudwatch:PutMetricData',
          Resource: '*',
        },
        {
          Effect: 'Allow',
          Action: [
            'logs:PutLogEvents',
            'logs:DescribeLogStreams',
            'logs:DescribeLogGroups',
            'logs:CreateLogStream',
            'logs:CreateLogGroup',
          ],
          Resource: '*',
        },
      ],
    }),
  },
  { provider },
);

const sqsReadOnlyPolicy = new aws.iam.Policy(
  'cw-metric-sqs-readonly-policy',
  {
    name: `${stackName}-sqs-readonly-access-policy`,
    path: '/',
    description: 'IAM policy for Read only access to SQS',
    policy: pulumi.all([comfyQueue.arn]).apply(([queueArn]) =>
      JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Action: [
              'sqs:GetQueueAttributes',
              'sqs:GetQueueUrl',
              'sqs:ListQueues',
            ],
            Effect: 'Allow',
            Resource: queueArn,
          },
        ],
      }),
    ),
  },
  { provider },
);

const cwMetricLambdaRole = new aws.iam.Role(
  'cw-metric-lambda-role',
  {
    name: `${stackName}-cw-metric-lambda-role`,
    assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
      Service: ['lambda.amazonaws.com'],
    }),
    managedPolicyArns: [
      lambdaLoggingPolicy.arn,
      describeEcsServicesPolicy.arn,
      cloudWatchAgentServerPolicy.arn,
      sqsReadOnlyPolicy.arn,
    ],
  },
  { provider },
);

const cwMetricLambda = new aws.lambda.Function(
  'cw-metric-lambda',
  {
    name: `${stackName}-cw-metric-lambda`,
    description: 'Lekent CloudWatch Metric Lambda',
    code: new pulumi.asset.FileArchive(
      '../../dist/scaling-alarm-lambda/custom-cw-metric',
    ),
    runtime: aws.lambda.Runtime.NodeJS18dX,
    role: cwMetricLambdaRole.arn,
    handler: 'index.handler',
    timeout: lambdaTimeoutInSeconds,
    environment: {
      variables: {
        COMFY_QUEUE_NAME: comfyQueue.name,
        COMFY_QUEUE_URL: comfyQueue.url,
        ACCOUNT_ID: awsCurrentAccountId,
        ECS_SERVICE_NAME: comfyDiffusionEcsService.name,
        ECS_CLUSTER: comfyEcsCluster.name,
        LATENCY_SECONDS: childrensBooksConfig
          .requireNumber('metricLatencySeconds')
          .toString(),
        TIME_PER_MESSAGE: childrensBooksConfig
          .requireNumber('metricTimePerMessage')
          .toString(),
      },
    },
  },
  { provider },
);

const cwMetricLambdaLogGroup = new aws.cloudwatch.LogGroup(
  'cw-metric-lambda-log-group',
  {
    name: pulumi.interpolate`/aws/lambda/${cwMetricLambda.name}`,
    retentionInDays: logRetentionInDays,
  },
  { provider },
);

const asgSetCapacityPolicy = new aws.iam.Policy(
  'asg-set-desired-capacity-policy',
  {
    name: `${stackName}-asg-set-desired-capacity`,
    description: 'IAM policy to allow setting the desired capacity of an ASG',
    policy: pulumi.all([autoScalingGroup.arn]).apply(([asgArn]) =>
      JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: 'autoscaling:SetDesiredCapacity',
            Resource: asgArn,
          },
        ],
      }),
    ),
  },
  { provider },
);

const asgDescribePolicy = new aws.iam.Policy(
  'asg-describe-policy',
  {
    name: `${stackName}-asg-describe`,
    description: 'IAM policy for Reading an Autoscaling group',
    policy: JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Action: 'autoscaling:Describe*',
          Resource: '*',
        },
      ],
    }),
  },
  { provider },
);

const startFromZeroLambdaRole = new aws.iam.Role(
  'start-from-zero-lambda-role',
  {
    name: `${stackName}-start-from-zero-lambda-role`,
    assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
      Service: ['lambda.amazonaws.com'],
    }),
    managedPolicyArns: [
      lambdaLoggingPolicy.arn,
      asgSetCapacityPolicy.arn,
      asgDescribePolicy.arn,
      sqsReadOnlyPolicy.arn,
    ],
  },
  { provider },
);

const startFromZeroLambda = new aws.lambda.Function(
  'start-from-zero-lambda',
  {
    name: `${stackName}-start-from-zero-lambda`,
    description: 'Lekent Start from Zero Lambda',
    code: new pulumi.asset.FileArchive(
      '../../dist/scaling-alarm-lambda/start-from-zero',
    ),
    runtime: aws.lambda.Runtime.NodeJS18dX,
    role: startFromZeroLambdaRole.arn,
    handler: 'index.handler',
    timeout: lambdaTimeoutInSeconds,
    environment: {
      variables: {
        AUTOSCALING_GROUP: pulumi.interpolate`${autoScalingGroup.name}`,
        SQS_QUEUE_URL: pulumi.interpolate`${comfyQueue.url}`,
      },
    },
  },
  { provider },
);

const startFromZeroLambdaLogGroup = new aws.cloudwatch.LogGroup(
  'start-from-zero-lambda-log-group',
  {
    name: pulumi.interpolate`/aws/lambda/${startFromZeroLambda.name}`,
    retentionInDays: logRetentionInDays,
  },
  { provider },
);

const lambdaInvokePolicy = new aws.iam.Policy(
  'lambda-invoke-policy',
  {
    name: `${stackName}-lambda-invoke-policy`,
    policy: JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Action: ['lambda:InvokeFunction'],
          Effect: 'Allow',
          Resource: '*',
        },
      ],
    }),
  },
  { provider },
);

const sfnLoggingPolicy = new aws.iam.Policy(
  'sfn-logging-policy',
  {
    name: `${stackName}-sfn-logging-policy`,
    policy: JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Action: [
            'logs:CreateLogDelivery',
            'logs:GetLogDelivery',
            'logs:UpdateLogDelivery',
            'logs:DeleteLogDelivery',
            'logs:ListLogDeliveries',
            'logs:PutLogEvents',
            'logs:PutResourcePolicy',
            'logs:DescribeResourcePolicies',
            'logs:DescribeLogGroups',
          ],
          Effect: 'Allow',
          Resource: '*',
        },
      ],
    }),
  },
  { provider },
);

const updateServicePolicy = new aws.iam.Policy(
  'update-service-policy',
  {
    name: `${stackName}-update-service-policy`,
    description: 'IAM policy to allow updating an ECS service',
    policy: JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Action: 'ecs:UpdateService',
          // TODO: Look into why the service in Pulumi
          // is missing the `arn` property
          Resource: '*',
        },
      ],
    }),
  },
  { provider },
);

const xRayPolicy = new aws.iam.Policy(
  'xray-policy',
  {
    name: `${stackName}-xray-policy`,
    description: 'IAM policy for logging via xray',
    policy: JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Action: [
            'xray:PutTraceSegments',
            'xray:PutTelemetryRecords',
            'xray:GetSamplingRules',
            'xray:GetSamplingTargets',
          ],
          Resource: '*',
        },
      ],
    }),
  },
  { provider },
);

const startFromZeroSfnRole = new aws.iam.Role(
  'start-from-zero-sfn-role',
  {
    name: `${stackName}-start-from-zero-sfn-role`,
    assumeRolePolicy: JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'sts:AssumeRole',
          Effect: 'Allow',
          Sid: '',
          Principal: {
            Service: ['states.amazonaws.com'],
          },
        },
      ],
    }),
    managedPolicyArns: [
      lambdaInvokePolicy.arn,
      sfnLoggingPolicy.arn,
      updateServicePolicy.arn,
      xRayPolicy.arn,
    ],
  },
  { provider },
);

// TODO: Make it type EXPRESS and only log ERRORS to a dedicated log group
/* eslint-disable quote-props */
const startFromZeroStateMachine = new aws.sfn.StateMachine(
  'start-from-zero-sfn',
  {
    name: `${stackName}-start-from-zero`,
    roleArn: startFromZeroSfnRole.arn,
    // type: 'EXPRESS',
    definition: pulumi
      .all([startFromZeroLambda.arn])
      .apply(([startFromZeroLambdaArn]) =>
        JSON.stringify({
          Comment: 'A description of my state machine',
          StartAt: 'Lambda Invoke',
          States: {
            'Lambda Invoke': {
              Type: 'Task',
              Resource: 'arn:aws:states:::lambda:invoke',
              OutputPath: '$.Payload',
              Parameters: {
                FunctionName: `${startFromZeroLambdaArn}:$LATEST`,
              },
              Retry: [
                {
                  ErrorEquals: [
                    'Lambda.ServiceException',
                    'Lambda.AWSLambdaException',
                    'Lambda.SdkClientException',
                  ],
                  IntervalSeconds: 2,
                  MaxAttempts: 6,
                  BackoffRate: 2,
                },
              ],
              Next: 'Choice',
              Comment:
                'Updates ASG to 1: If zero instances and 1 item in SQS queue.',
            },
            'Choice': {
              Type: 'Choice',
              Choices: [
                {
                  Variable: '$',
                  BooleanEquals: true,
                  Next: 'Start from Zero',
                },
              ],
              Default: 'Exit',
              Comment: 'Either exits or continues to update ECS Service',
            },
            'Exit': {
              Type: 'Pass',
              End: true,
            },
            'Start from Zero': {
              Type: 'Pass',
              Next: 'Wait',
            },
            'Wait': {
              Type: 'Wait',
              Seconds: 55,
              Next: 'UpdateService',
              Comment:
                'Wait X time for EC2 instance to come online following Lambda and become registered to ECS cluster',
            },
            'UpdateService': {
              Type: 'Task',
              End: true,
              Parameters: {
                Service: stackName,
                DesiredCount: 1,
                Cluster: stackName,
              },
              Resource: 'arn:aws:states:::aws-sdk:ecs:updateService',
              Comment: 'Update Service from 0 -> 1',
            },
          },
        }),
      ),
  },
  { provider },
);
/* eslint-enable quote-props */

const startFromZeroAlarm = new aws.cloudwatch.MetricAlarm(
  'start-from-zero-alarm',
  {
    name: `${stackName}-start-from-zero`,
    comparisonOperator: 'GreaterThanOrEqualToThreshold',
    evaluationPeriods: 1,
    datapointsToAlarm: 1,
    metricName: 'ApproximateNumberOfMessages',
    namespace: 'SQS AutoScaling',
    period: 10,
    statistic: 'Average',
    threshold: 0.2,
    alarmDescription:
      'This metric alarms when there is something in the queue or process in the queue.',
    insufficientDataActions: [],
    alarmActions: [],
    dimensions: {
      SQS: pulumi.interpolate`${comfyQueue.name}`,
    },
  },
  { provider },
);

/* eslint-disable quote-props */
const startFromZeroEventRule = new aws.cloudwatch.EventRule(
  'start-from-zero-event-rule',
  {
    name: `${stackName}-start-from-zero`,
    description:
      'Run start-from-zero step function when transitioning to ALARM state',
    eventPattern: pulumi.all([startFromZeroAlarm.arn]).apply(([alarmArn]) =>
      JSON.stringify({
        'source': ['aws.cloudwatch'],
        'detail-type': ['CloudWatch Alarm State Change'],
        'resources': [alarmArn],
        'detail': {
          state: {
            value: ['ALARM'],
          },
        },
      }),
    ),
  },
  { provider },
);
/* eslint-enable quote-props */

const startFromZeroStartExecutionPolicy = new aws.iam.Policy(
  'start-from-zero-start-execution-policy',
  {
    name: `${stackName}-start-from-zero-start-execution-policy`,
    description: 'IAM policy for triggering step function',
    policy: pulumi
      .all([startFromZeroStateMachine.arn])
      .apply(([stateMachineArn]) =>
        JSON.stringify({
          Version: '2012-10-17',
          Statement: [
            {
              Action: ['states:StartExecution'],
              Effect: 'Allow',
              Resource: stateMachineArn,
            },
          ],
        }),
      ),
  },
  { provider },
);

const startFromZeroEventRuleRole = new aws.iam.Role(
  'start-from-zero-event-rule-role',
  {
    name: `${stackName}-start-from-zero-event-rule-role`,
    assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
      Service: ['events.amazonaws.com'],
    }),
    managedPolicyArns: [startFromZeroStartExecutionPolicy.arn],
  },
  { provider },
);

const startFromZeroEventTarget = new aws.cloudwatch.EventTarget(
  'start-from-zero-event-target',
  {
    rule: startFromZeroEventRule.name,
    roleArn: startFromZeroEventRuleRole.arn,
    targetId: `${stackName}-trigger-start-from-zero`,
    arn: startFromZeroStateMachine.arn,
  },
  { provider },
);

const cwMetricSfnRole = new aws.iam.Role(
  'cw-metric-sfn-role',
  {
    name: `${stackName}-cw-metric-sfn-role`,
    assumeRolePolicy: JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'sts:AssumeRole',
          Effect: 'Allow',
          Sid: '',
          Principal: {
            Service: ['states.amazonaws.com'],
          },
        },
      ],
    }),
    managedPolicyArns: [
      lambdaInvokePolicy.arn,
      xRayPolicy.arn,
      sfnLoggingPolicy.arn,
      updateServicePolicy.arn,
    ],
  },
  { provider },
);

// TODO: Make it type EXPRESS and only log ERRORS to a dedicated log group
/* eslint-disable quote-props */
const cwMetricStateMachine = new aws.sfn.StateMachine(
  'cw-metric-state-machine',
  {
    name: stackName,
    roleArn: cwMetricSfnRole.arn,
    // type: 'EXPRESS',
    definition: pulumi
      .all([
        cwMetricLambda.arn,
        comfyQueue.url,
        comfyQueue.name,
        awsCurrentAccountId,
        comfyDiffusionEcsService.name,
        comfyEcsCluster.name,
      ])
      .apply(
        ([
          cwMetricLambdaArn,
          comfyQueueUrl,
          comfyQueueName,
          accountId,
          serviceName,
          clusterName,
        ]) =>
          JSON.stringify({
            Comment: 'A description of my state machine',
            StartAt: 'Lambda Invoke',
            States: {
              'Lambda Invoke': {
                Type: 'Task',
                Resource: 'arn:aws:states:::lambda:invoke',
                OutputPath: '$.Payload',
                Parameters: {
                  FunctionName: cwMetricLambdaArn,
                  Payload: {
                    queueUrl: comfyQueueUrl,
                    queueName: comfyQueueName,
                    accountId: accountId,
                    service_name: serviceName,
                    cluster_name: clusterName,
                    acceptable_latency: '90',
                    time_process_per_message: '15',
                  },
                },
                Retry: [
                  {
                    ErrorEquals: [
                      'Lambda.ServiceException',
                      'Lambda.AWSLambdaException',
                      'Lambda.SdkClientException',
                    ],
                    IntervalSeconds: 2,
                    MaxAttempts: 6,
                    BackoffRate: 2,
                  },
                ],
                Next: 'Wait',
              },
              'Wait': {
                Type: 'Wait',
                Seconds: 9,
                Next: 'Lambda Invoke (1)',
              },
              'Lambda Invoke (1)': {
                Type: 'Task',
                Resource: 'arn:aws:states:::lambda:invoke',
                OutputPath: '$.Payload',
                Parameters: {
                  FunctionName: cwMetricLambdaArn,
                  Payload: {
                    queueUrl: comfyQueueUrl,
                    queueName: comfyQueueName,
                    accountId: accountId,
                    service_name: serviceName,
                    cluster_name: clusterName,
                    acceptable_latency: '90',
                    time_process_per_message: '15',
                  },
                },
                Retry: [
                  {
                    ErrorEquals: [
                      'Lambda.ServiceException',
                      'Lambda.AWSLambdaException',
                      'Lambda.SdkClientException',
                    ],
                    IntervalSeconds: 2,
                    MaxAttempts: 6,
                    BackoffRate: 2,
                  },
                ],
                Next: 'Wait (2)',
              },
              'Wait (2)': {
                Type: 'Wait',
                Seconds: 9,
                Next: 'Lambda Invoke (2)',
              },
              'Lambda Invoke (2)': {
                Type: 'Task',
                Resource: 'arn:aws:states:::lambda:invoke',
                OutputPath: '$.Payload',
                Parameters: {
                  FunctionName: cwMetricLambdaArn,
                  Payload: {
                    queueUrl: comfyQueueUrl,
                    queueName: comfyQueueName,
                    accountId: accountId,
                    service_name: serviceName,
                    cluster_name: clusterName,
                    acceptable_latency: '90',
                    time_process_per_message: '15',
                  },
                },
                Retry: [
                  {
                    ErrorEquals: [
                      'Lambda.ServiceException',
                      'Lambda.AWSLambdaException',
                      'Lambda.SdkClientException',
                    ],
                    IntervalSeconds: 2,
                    MaxAttempts: 6,
                    BackoffRate: 2,
                  },
                ],
                Next: 'Wait (1)',
              },
              'Wait (1)': {
                Type: 'Wait',
                Seconds: 9,
                Next: 'Lambda Invoke (3)',
              },
              'Lambda Invoke (3)': {
                Type: 'Task',
                Resource: 'arn:aws:states:::lambda:invoke',
                OutputPath: '$.Payload',
                Parameters: {
                  FunctionName: cwMetricLambdaArn,
                  Payload: {
                    queueUrl: comfyQueueUrl,
                    queueName: comfyQueueName,
                    accountId: accountId,
                    service_name: serviceName,
                    cluster_name: clusterName,
                    acceptable_latency: '90',
                    time_process_per_message: '15',
                  },
                },
                Retry: [
                  {
                    ErrorEquals: [
                      'Lambda.ServiceException',
                      'Lambda.AWSLambdaException',
                      'Lambda.SdkClientException',
                    ],
                    IntervalSeconds: 2,
                    MaxAttempts: 6,
                    BackoffRate: 2,
                  },
                ],
                Next: 'Wait (3)',
              },
              'Wait (3)': {
                Type: 'Wait',
                Seconds: 9,
                Next: 'Lambda Invoke (4)',
              },
              'Lambda Invoke (4)': {
                Type: 'Task',
                Resource: 'arn:aws:states:::lambda:invoke',
                OutputPath: '$.Payload',
                Parameters: {
                  FunctionName: cwMetricLambdaArn,
                  Payload: {
                    queueUrl: comfyQueueUrl,
                    queueName: comfyQueueName,
                    accountId: accountId,
                    service_name: serviceName,
                    cluster_name: clusterName,
                    acceptable_latency: '90',
                    time_process_per_message: '15',
                  },
                },
                Retry: [
                  {
                    ErrorEquals: [
                      'Lambda.ServiceException',
                      'Lambda.AWSLambdaException',
                      'Lambda.SdkClientException',
                    ],
                    IntervalSeconds: 2,
                    MaxAttempts: 6,
                    BackoffRate: 2,
                  },
                ],
                Next: 'Wait (4)',
              },
              'Wait (4)': {
                Type: 'Wait',
                Seconds: 9,
                Next: 'Lambda Invoke (5)',
              },
              'Lambda Invoke (5)': {
                Type: 'Task',
                Resource: 'arn:aws:states:::lambda:invoke',
                OutputPath: '$.Payload',
                Parameters: {
                  FunctionName: cwMetricLambdaArn,
                  Payload: {
                    queueUrl: comfyQueueUrl,
                    queueName: comfyQueueName,
                    accountId: accountId,
                    service_name: serviceName,
                    cluster_name: clusterName,
                    acceptable_latency: '90',
                    time_process_per_message: '15',
                  },
                },
                Retry: [
                  {
                    ErrorEquals: [
                      'Lambda.ServiceException',
                      'Lambda.AWSLambdaException',
                      'Lambda.SdkClientException',
                    ],
                    IntervalSeconds: 2,
                    MaxAttempts: 6,
                    BackoffRate: 2,
                  },
                ],
                End: true,
              },
            },
          }),
      ),
  },
  { provider },
);

const cwMetricStartExecutionPolicy = new aws.iam.Policy(
  'cw-metric-start-execution-policy',
  {
    name: `${stackName}-cw-metric-start-execution-policy`,
    description: 'IAM policy for triggering step function',
    policy: pulumi.all([cwMetricStateMachine.arn]).apply(([stateMachineArn]) =>
      JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Action: ['states:StartExecution'],
            Effect: 'Allow',
            Resource: stateMachineArn,
          },
        ],
      }),
    ),
  },
  { provider },
);

const cwMetricEventRuleRole = new aws.iam.Role(
  'cw-metric-event-rule-role',
  {
    name: `${stackName}-cw-metric-event-rule-role`,
    assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
      Service: ['events.amazonaws.com'],
    }),
    managedPolicyArns: [cwMetricStartExecutionPolicy.arn],
  },
  { provider },
);

// EventBridge Rule to trigger Step Function
const cwMetricEventRule = new aws.cloudwatch.EventRule(
  'cw-metric-event-rule',
  {
    name: `${stackName}-cw-metric-event-rule`,
    description: 'Trigger CW Lambda for custom metric every minute',
    scheduleExpression: 'rate(1 minute)',
  },
  { provider },
);

const cwMetricEventTarget = new aws.cloudwatch.EventTarget(
  'cw-metric-event-target',
  {
    rule: cwMetricEventRule.name,
    targetId: `${stackName}-trigger-step-cw-metric`,
    arn: cwMetricStateMachine.arn,
    roleArn: cwMetricEventRuleRole.arn,
  },
  { provider },
);
