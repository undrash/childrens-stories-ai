import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';

// Export project-specific configs from here
export const childrensBooksConfig = new pulumi.Config('childrens-books');
export const comfyConfig = new pulumi.Config('comfy-ui-headless');

export const stackName = pulumi.getStack();

export const provider = new aws.Provider('childrens-books', {
  region: aws.config.region,
  defaultTags: {
    tags: {
      // eslint-disable-next-line quote-props
      'Project': stackName,
      'auto-delete': 'no',
    },
  },
});
