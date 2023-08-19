import * as awsx from '@pulumi/awsx';
import * as aws from '@pulumi/aws';

import { stackName, provider } from '../config';

const comfyRepo = new awsx.ecr.Repository(
  stackName,
  {
    forceDelete: true,
  },
  { provider },
);

const comfyHeadlessImage = new awsx.ecr.Image(
  stackName,
  {
    repositoryUrl: comfyRepo.url,
    path: '../../comfy-ui-headless',
  },
  { provider },
);

const comfyRepositoryArn = new aws.ssm.Parameter(
  `${stackName}-repository-arn`,
  {
    type: 'String',
    overwrite: true,
    name: `/${stackName}/${aws.config.region}/comfy-ui-headless/repository-arn`,
    value: comfyRepo.repository.arn,
  },
  { provider },
);

const comfyImageUri = new aws.ssm.Parameter(
  `${stackName}-image-uri`,
  {
    type: 'String',
    overwrite: true,
    name: `/${stackName}/${aws.config.region}/comfy-ui-headless/image-uri`,
    value: comfyHeadlessImage.imageUri,
  },
  { provider },
);
