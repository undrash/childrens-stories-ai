const mockGet = jest.fn().mockResolvedValue({});
const mockPut = jest.fn().mockResolvedValue({});
const mockDelete = jest.fn().mockResolvedValue({});
const mockUpdate = jest.fn().mockResolvedValue({});

export const DynamoTable = jest.fn().mockImplementation(() => ({
  get: mockGet,
  put: mockPut,
  delete: mockDelete,
  update: mockUpdate,
}));
