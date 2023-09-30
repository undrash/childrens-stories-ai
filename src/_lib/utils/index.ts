export const promisifyInBatches = async (
  functions: ((
    resolve: (value?: unknown) => void,
    reject: (reason?: unknown) => void,
  ) => void)[],
  batchSize = 25,
) => {
  let position = 0;
  let results: unknown[] = [];

  if (batchSize < 1) batchSize = functions.length;

  while (position < functions.length) {
    const batch = functions.slice(position, position + batchSize);

    const promises = [];

    for (const func of batch) {
      promises.push(new Promise(func));
    }

    results = [...results, ...(await Promise.all(promises))];
    position += batchSize;
  }

  return results;
};

export const getEnvValue = (key: string) => {
  const value = process.env[key];
  if (value) return value;

  throw new Error(`Missing required environment variable: ${key}`);
};

export const requireEnvironmentVariables = (requiredEnvVars: string[]) => {
  if (!requiredEnvVars || !requiredEnvVars.length) {
    throw new Error(
      'Please specify an array of required environment variables.',
    );
  }

  const missingEnvVars = requiredEnvVars.filter(
    (envVar) => !process.env[envVar],
  );

  if (missingEnvVars.length) {
    throw new Error(
      `Missing required environment variables: ${missingEnvVars.join(', ')}`,
    );
  }
};
