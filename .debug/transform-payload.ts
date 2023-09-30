/**
 * If we have an API key on the environment, we'll use it to override the Authorization header.
 * @param payload The lambda input
 */
export const transformPayload = (payload: any) => {
  if (payload.headers && payload.headers.Authorization) {
    if (!process.env.CHILDRENS_BOOKS_API_KEY) {
      throw new Error('Missing CHILDRENS_BOOKS_API_KEY from environment.');
    }

    payload.headers.Authorization = process.env.CHILDRENS_BOOKS_API_KEY;
    payload.multiValueHeaders.Authorization = [
      process.env.CHILDRENS_BOOKS_API_KEY,
    ];
  }
};
