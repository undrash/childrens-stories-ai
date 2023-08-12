import * as aws from '@pulumi/aws';

export const awsCurrentAccountId = aws
  .getCallerIdentity({})
  .then((current: { accountId: string }) => current.accountId);
