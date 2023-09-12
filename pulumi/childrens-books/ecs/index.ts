import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';

import {
  childrensBooksConfig,
  stackName,
  awsCurrentAccountId,
  provider,
  logRetentionInDays,
} from '../../config';
import { comfyQueue } from '../api';

const vpcId = childrensBooksConfig.requireSecret('vpcId');

export const imageTopic = new aws.sns.Topic(
  'image-topic',
  {
    name: `${stackName}-image-topic.fifo`,
    deliveryPolicy: JSON.stringify({
      http: {
        defaultHealthyRetryPolicy: {
          minDelayTarget: 20,
          maxDelayTarget: 20,
          numRetries: 3,
          numMaxDelayRetries: 0,
          numNoDelayRetries: 0,
          numMinDelayRetries: 0,
          backoffFunction: 'linear',
        },
        disableSubscriptionOverrides: false,
      },
    }),
    fifoTopic: true,
    contentBasedDeduplication: true,
  },
  { provider },
);

const imageBucketName = `${stackName}-images`;

const imageBucket = new aws.s3.Bucket(
  imageBucketName,
  {
    bucket: imageBucketName,
    acl: 'private',
  },
  { provider },
);

export const comfyEcsCluster = new aws.ecs.Cluster(
  'ecs-cluster',
  {
    name: stackName,
  },
  { provider },
);

export const publicSubnets = vpcId.apply((id: string) =>
  aws.ec2.getSubnets({
    tags: {
      Tier: 'Public',
    },
    filters: [
      {
        name: 'vpc-id',
        values: [id],
      },
    ],
  }),
);

const ebsKmsKey = aws.kms.getKey({
  keyId: 'alias/aws/ebs',
});

const ecsGpuAmi = aws.ssm.getParameter({
  name: '/aws/service/ecs/optimized-ami/amazon-linux-2/gpu/recommended/image_id',
});

const sqsQueueExecutionPolicy = new aws.iam.Policy(
  'execution-sqs-policy',
  {
    name: `${stackName}-sqs-execution-policy`,
    path: '/',
    description: 'IAM policy for containers to query SQS queue',
    policy: pulumi.output(comfyQueue.arn).apply((queueArn) =>
      JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: [
              'sqs:ReceiveMessage',
              'sqs:DeleteMessage',
              'sqs:GetQueueAttributes',
            ],
            Resource: queueArn,
          },
          {
            Effect: 'Allow',
            Action: [
              'logs:CreateLogGroup',
              'logs:CreateLogStream',
              'logs:PutLogEvents',
            ],
            Resource: '*',
          },
        ],
      }),
    ),
  },
  { provider },
);

const s3WritePolicy = new aws.iam.Policy(
  's3-write-policy',
  {
    name: `${stackName}-s3-write-policy`,
    path: '/',
    description: 'IAM policy for containers to write to S3 (Inference Bucket)',
    policy: pulumi.output(imageBucket.arn).apply((bucketArn) =>
      JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: ['s3:ListAllMyBuckets', 's3:ListBucket', 's3:HeadBucket'],
            Resource: '*',
          },
          {
            Effect: 'Allow',
            Action: ['s3:PutObject', 's3:PutObjectAcl'],
            Resource: [bucketArn, `${bucketArn}/*`],
          },
        ],
      }),
    ),
  },
  { provider },
);

const snsPublishInferencePolicy = new aws.iam.Policy(
  'sns-publish-image-policy',
  {
    name: `${stackName}-sns-publish-image-policy`,
    path: '/',
    description: 'IAM policy for containers to publish the SNS image topic',
    policy: imageTopic.arn.apply((topicArn) =>
      JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: ['sns:Publish'],
            Resource: topicArn,
          },
        ],
      }),
    ),
  },
  { provider },
);

const containerServiceEc2Policy = new aws.iam.Policy(
  'container-service-policy',
  {
    name: `${stackName}-container-service-policy`,
    path: '/',
    description: 'IAM policy EC2 Container Service Role',
    policy: pulumi
      .all([aws.config.region, awsCurrentAccountId])
      .apply(([region, accountId]) =>
        JSON.stringify({
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Action: [
                'ecs:Poll',
                'ecs:StartTelemetrySession',
                'ecr:GetDownloadUrlForLayer',
                'ecs:UpdateContainerInstancesState',
                'ecr:BatchGetImage',
                'ecs:RegisterContainerInstance',
                'ecs:Submit*',
                'ecs:DeregisterContainerInstance',
                'ecr:BatchCheckLayerAvailability',
              ],
              Resource: [
                `arn:aws:ecr:${region}:${accountId}:repository/${stackName}`,
                `arn:aws:ecs:${region}:${accountId}:cluster/${stackName}`,
                `arn:aws:ecs:${region}:${accountId}:container-instance/${stackName}/*`,
              ],
            },
            {
              Effect: 'Allow',
              Action: [
                'ecs:DiscoverPollEndpoint',
                'logs:CreateLogStream',
                'ec2:DescribeTags',
                'ecs:CreateCluster',
                'ecr:GetAuthorizationToken',
                'logs:PutLogEvents',
              ],
              Resource: '*',
            },
          ],
        }),
      ),
  },
  { provider },
);

const ecsRole = new aws.iam.Role(
  'ecs-role',
  {
    name: `${stackName}-comfy-ecs-role`,
    assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
      Service: ['ec2.amazonaws.com'],
    }),
    managedPolicyArns: [
      sqsQueueExecutionPolicy.arn,
      containerServiceEc2Policy.arn,
      s3WritePolicy.arn,
      snsPublishInferencePolicy.arn,
    ],
  },
  { provider },
);

const ecsComfyInstanceProfile = new aws.iam.InstanceProfile(
  'ecs-instance-profile',
  {
    name: `${stackName}-ecs-comfy`,
    role: ecsRole.name,
  },
  { provider },
);

export const ecsComfySecurityGroup = new aws.ec2.SecurityGroup(
  'ecs-security-group',
  {
    name: `${stackName}-ecs-comfy`,
    description: 'Allow TLS inbound traffic',
    vpcId: vpcId,
    egress: [
      {
        fromPort: 0,
        toPort: 0,
        protocol: '-1',
        cidrBlocks: ['0.0.0.0/0'],
        ipv6CidrBlocks: ['::/0'],
      },
    ],
    ingress: [
      { protocol: 'tcp', fromPort: 22, toPort: 22, cidrBlocks: ['0.0.0.0/0'] },
    ],
  },
  { provider },
);

const comfyDiffusionLaunchTemplate = new aws.ec2.LaunchTemplate(
  'ecs-launch-template',
  {
    name: stackName,
    blockDeviceMappings: [
      {
        deviceName: '/dev/xvda',
        ebs: {
          volumeSize: 40,
          volumeType: 'gp3',
          encrypted: 'true',
          kmsKeyId: pulumi.output(ebsKmsKey).arn,
        },
      },
    ],
    iamInstanceProfile: {
      arn: ecsComfyInstanceProfile.arn,
    },
    imageId: pulumi.output(ecsGpuAmi).value,
    keyName: childrensBooksConfig.require('keyPairName'),
    updateDefaultVersion: true,
    instanceInitiatedShutdownBehavior: 'terminate',
    instanceType: 'g4dn.xlarge',
    vpcSecurityGroupIds: [ecsComfySecurityGroup.id],
    userData: pulumi
      .output(
        pulumi.interpolate`
  #!/bin/bash
  cat <<'EOF' >> /etc/ecs/ecs.config
  ECS_CLUSTER=${comfyEcsCluster.id}
  ECS_ENABLE_GPU_SUPPORT=true
  ECS_ENABLE_TASK_IAM_ROLE=true
  ECS_ENABLE_TASK_IAM_ROLE_COMPATIBILITY=true
  EOF
`,
      )
      .apply((userData) => Buffer.from(userData).toString('base64')),
    tags: {
      Name: stackName,
    },
  },
  { provider },
);

const currentDefaultTags = aws.getDefaultTags({});

const autoScalingTags = pulumi.output(currentDefaultTags).apply((tags) => {
  const autoScalingTags: {
    key: string;
    value: string;
    propagateAtLaunch: boolean;
  }[] = [];

  for (const [key, value] of Object.entries(tags)) {
    if (key === 'tags') continue;

    autoScalingTags.push({
      key,
      value: value as string,
      propagateAtLaunch: true,
    });
  }
  return autoScalingTags;
});

export const autoScalingGroup = new aws.autoscaling.Group(
  'ecs-autoscaling-group',
  {
    name: `${stackName}-asg`,
    maxSize: 2,
    minSize: 0,
    desiredCapacity: 0,
    healthCheckGracePeriod: 0,
    healthCheckType: 'EC2',
    defaultCooldown: 600,
    launchTemplate: {
      id: comfyDiffusionLaunchTemplate.id,
      version: '$Latest',
    },
    tags: autoScalingTags,
    vpcZoneIdentifiers: publicSubnets.ids,
  },
  { provider },
);

const comfyRepositoryArnParam = pulumi.output(
  aws.ssm.getParameter({
    name: `/${childrensBooksConfig.require('environment')}-comfy-ui-headless/${
      aws.config.region
    }/comfy-ui-headless/repository-arn`,
  }),
);

const taskExecutionPolicy = new aws.iam.Policy(
  'ecs-task-execution-policy',
  {
    name: `${stackName}-ecs-task-execution-policy`,
    path: '/',
    description: 'IAM policy for ECS Task Execution',
    policy: pulumi.output(comfyRepositoryArnParam.value).apply((ecrRepoArn) =>
      JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: [
              'ecr:GetDownloadUrlForLayer',
              'ecr:BatchGetImage',
              'ecr:BatchCheckLayerAvailability',
            ],
            Resource: ecrRepoArn,
          },
          {
            Effect: 'Allow',
            Action: [
              'logs:CreateLogStream',
              'ecr:GetAuthorizationToken',
              'logs:PutLogEvents',
            ],
            Resource: '*',
          },
        ],
      }),
    ),
  },
  { provider },
);

const ecsExecutionRole = new aws.iam.Role(
  'ecs-execution-role',
  {
    name: `${stackName}-ecs-execution-role`,
    assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
      Service: ['ecs-tasks.amazonaws.com'],
    }),
    managedPolicyArns: [taskExecutionPolicy.arn],
  },
  { provider },
);

const ecsTaskRole = new aws.iam.Role(
  'ecs-task-role',
  {
    name: `${stackName}-ecs-task-role`,
    assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
      Service: ['ecs-tasks.amazonaws.com'],
    }),
    managedPolicyArns: [
      sqsQueueExecutionPolicy.arn,
      s3WritePolicy.arn,
      snsPublishInferencePolicy.arn,
    ],
  },
  { provider },
);

const ecsLogGroup = new aws.cloudwatch.LogGroup(
  'ecs-log-group',
  {
    name: `${stackName}-ecs-log-group`,
    retentionInDays: logRetentionInDays,
  },
  { provider },
);

const comfyImageUriParam = pulumi.output(
  aws.ssm.getParameter({
    name: `/${childrensBooksConfig.require('environment')}-comfy-ui-headless/${
      aws.config.region
    }/comfy-ui-headless/image-uri`,
  }),
);

const ecsTaskDefinition = new aws.ecs.TaskDefinition(
  'ecs-task-definition',
  {
    family: stackName,
    executionRoleArn: ecsExecutionRole.arn,
    taskRoleArn: ecsTaskRole.arn,
    requiresCompatibilities: ['EC2'],
    networkMode: 'bridge',
    runtimePlatform: {
      operatingSystemFamily: 'LINUX',
      cpuArchitecture: 'X86_64',
    },
    containerDefinitions: pulumi
      .all([
        comfyImageUriParam.value,
        comfyQueue.url,
        imageTopic.arn,
        ecsLogGroup.name,
      ])
      .apply(([comfyImageUri, queueUrl, imageTopicArn, ecsLogGroupName]) =>
        JSON.stringify([
          {
            name: stackName,
            image: comfyImageUri,
            cpu: 4096,
            memory: 12288,
            links: [],
            portMappings: [],
            essential: true,
            entryPoint: [],
            command: [],
            healthCheck: {
              command: [
                'CMD-SHELL',
                'curl --head --fail --silent --max-time 5 http://127.0.0.1:8188 > /dev/null || exit 1',
              ],
            },
            environment: [
              {
                name: 'REGION',
                value: aws.config.region,
              },
              {
                name: 'COMFY_QUEUE_URL',
                value: queueUrl,
              },
              {
                name: 'S3_BUCKET_NAME',
                value: imageBucketName,
              },
              {
                name: 'SNS_TOPIC_ARN',
                value: imageTopicArn,
              },
              {
                name: 'NODE_ENV',
                value: 'prod',
              },
            ],
            environmentFiles: [],
            volumesFrom: [],
            secrets: [],
            dnsServers: [],
            dnsSearchDomains: [],
            extraHosts: [],
            dockerSecurityOptions: [],
            dockerLabels: {},
            ulimits: [],
            systemControls: [],
            resourceRequirements: [
              {
                value: '1',
                type: 'GPU',
              },
            ],
            logConfiguration: {
              logDriver: 'awslogs',
              options: {
                'awslogs-group': ecsLogGroupName,
                'awslogs-region': aws.config.region,
                'awslogs-stream-prefix': stackName,
              },
            },
          },
        ]),
      ),
  },
  { provider },
);

export const comfyDiffusionEcsService = new aws.ecs.Service(
  'ecs-service',
  {
    name: stackName,
    cluster: comfyEcsCluster.id,
    taskDefinition: ecsTaskDefinition.arn,
    desiredCount: 0,
    orderedPlacementStrategies: [
      {
        type: 'spread',
        field: 'instanceId',
      },
    ],
    deploymentCircuitBreaker: {
      enable: true,
      rollback: true,
    },
  },
  { provider },
);
