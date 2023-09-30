# Children's Stories AI

A project to create children's stories using the latest in generative AI. The development is broken down into episodes, and each episode has its own branch, as well as a PR to the main branch.

## Getting Started

To get started, you'll need to have the following on your machine:

- [git](https://git-scm.com/)
- [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
- NodeJs - ideally installed with [nvm](https://www.freecodecamp.org/news/node-version-manager-nvm-install-guide/)
- [Docker](https://docs.docker.com/engine/install/)
- [Pulumi](https://www.pulumi.com/docs/install/)
- [Conda](https://conda.io/projects/conda/en/latest/user-guide/install/index.html)

---

Clone the repository and run the commands listed below.

Install the node dependencies:

```sh
npm ci
```

Initialize the ComfyUI project dependency:

```sh
npm run init:comfy
```

Initialize a Conda environment for ComfyUI and install its dependencies:

```sh
cd comfy-ui-headless/src

conda create --name childrens-stories-ai-comfy python=3.10.9

conda activate childrens-stories-ai-comfy

pip install torch torchvision torchaudio --extra-index-url https://download.pytorch.org/whl/cu118 xformers

pip install -r requirements.txt
```

## Deployment

The deployment is done using the open-source IaC tool [Pulumi](https://www.pulumi.com/).

There are multiple ways to deploy, but the easiest I found is an S3 bucket and the Pulumi CLI. Log in to your AWS account and create an S3 bucket to store the Pulumi state. Also, make sure you have access to your bucket from your local terminal through the AWS CLI.

Use the bucket as the Pulumi state store:

```sh
pulumi login s3://your-bucket-name
```

Navigate to the `pulumi/comfy-ui-headless` directory.

Create your own Pulumi stack:

```sh
pulumi stack init <YOUR_STACK_NAME>
```

Copy the `config` section of the `Pulumi.dev-comfy-ui-headless.yaml` file into your own stack config.

Deploy the stack by running:

```sh
pulumi up
```

Repeat the process for the `Pulumi.dev-childrens-stories.yaml` stack file in the `pulumi/childrens-stories` directory, and update the `config` section values as needed.

The childrens-stories stack has the following dependencies:

- `childrens-stories:keyPairName` - Create a Key Pair in your AWS EC2 console and set set the name as the value for this stack config variable.

The childrens-stories stack has the following _secret_ dependencies:

- `childrens-stories:apiKey` - Any random string will do the job or even an empty string.
- `childrens-stories:vpcId` - This is the VPC ID of your AWS account.

Example commands:

```sh
pulumi config set --secret childrens-books:apiKey yourSecretApiKey

pulumi config set --secret childrens-books:vpcId vpc-YOUR-VPC-ID
```

## AWS Prerequisites

This solution is designed to run on AWS and expects certain configurations to be present in your account. Please follow the steps below to get up and running.

### Create an AWS Account

If you don’t already have one, you should [create an AWS account](https://aws.amazon.com/resources/create-account/). Ideally, you would sign up through an offer that gives you free credits, but I haven’t found any recently.

### Create an IAM User

We also need an IAM user with programmatic access. If you don’t know what you’re doing, just attach the `AdministratorAccess` policy directly, and you should be good to go.

### Increase EC2 Limit

We're using `g4dn.xlarge` instances for inference, which need 4 vCPU per instance, but the quota should be increased to at least 8 vCPU so that we can see the autoscaling in action between 0 and 2 instances.
The limit is called Running On-Demand G and VT instances, and you can check your current limit on your [service quotas dashboard](https://console.aws.amazon.com/servicequotas/home/services/ec2/quotas/).

For more information about quota increases, [click here](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-resource-limits.html#request-increase).

### Tag your Public Subnets

If you're going to use your own virtual private cloud (VPC), make sure to tag your public subnets with key: `Tier` and value: `Public`.
If you don't have your own, there's a default VPC in the account anyway, so we can simply use that. Go to the VPC dashboard, click Subnets in the menu, and tag your subnets with the key: `Tier` and value: `Public`.
