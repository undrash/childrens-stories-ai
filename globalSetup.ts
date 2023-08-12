require('ts-node/register');

const setup = (): void => {
  const Env = {
    REGION: 'eu-north-1',
    ENVIRONMENT_NAME: 'dev',
  };

  process.env = { ...process.env, ...Env };
};

export default setup;
