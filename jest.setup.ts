global.console = {
  ...console,
  log: jest.fn(), // console.log are ignored in tests
  error: jest.fn(), // console.error are ignored in tests
};
