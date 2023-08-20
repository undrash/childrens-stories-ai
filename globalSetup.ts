require('ts-node/register');

const setup = (): void => {
  const Env = {
    REGION: 'test',
    ENVIRONMENT_NAME: 'test',
    API_KEY: 'test',
    IMAGE_TABLE_NAME: 'test',
    COMFY_QUEUE_URL: 'test',
  };

  process.env = { ...process.env, ...Env };
};

export default setup;
