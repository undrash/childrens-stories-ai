require('ts-node/register');

const setup = (): void => {
  const Env = {
    REGION: 'test',
    ENVIRONMENT_NAME: 'test',
    API_KEY: 'test',
    IMAGE_TABLE_NAME: 'test',
    COMFY_QUEUE_URL: 'test',
    COMFY_QUEUE_NAME: 'test',
    ECS_SERVICE_NAME: 'test',
    ECS_CLUSTER: 'test',
    LATENCY_SECONDS: '60',
    TIME_PER_MESSAGE: '15',
  };

  process.env = { ...process.env, ...Env };
};

export default setup;
