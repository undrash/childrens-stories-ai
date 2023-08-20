import { getComfyPipelineFromPrompt } from './comfy';

describe('Comfy Helpers', () => {
  it('should return the comfy pipeline with the added prompt', () => {
    const mockPrompt = 'mock-prompt';

    const pipeline = getComfyPipelineFromPrompt(mockPrompt);

    expect(pipeline.prompt['6'].inputs.text).toBe(mockPrompt);
  });
});
