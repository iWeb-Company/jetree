import { executeAgentChat, type ExecutionResult } from '@/lib/agents/orchestrator';
import { callAIProvider } from '@/lib/agents/provider-adapter';
import { generationTarget, imageAdvice, imageRequest, needsImageHistory, type ImageInput } from '@/lib/chat-images';
import { describeImages, generateImage } from './image-provider';

export async function executeImageChat(
  args: Parameters<typeof executeAgentChat>,
  images: ImageInput[],
  receivedImage: boolean,
  explicitGeneration = false,
) {
  const [agent, message, , history = [], keys = {}] = args;
  if(!receivedImage&&!needsImageHistory(message,explicitGeneration))images=[];
  images = images.slice(-3);
  while (images.length > 1 && images.reduce((total, image) => total + image.bytes.length, 0) > 12 * 1024 * 1024) images.shift();
  const request = imageRequest(message, explicitGeneration);
  if (request.generate) {
    if (!request.prompt) throw new Error('IMAGE_GENERATION_EMPTY');
    const target = generationTarget(agent);
    const startedAt = new Date().toISOString();
    const context = history.slice(-4).map(item => `${item.role}: ${item.content.slice(0, 1500)}`).join('\n');
    const image = await generateImage(target.provider, target.model, `${agent.systemPrompt.slice(0, 3000)}\nContexto anterior:\n${context}\nPedido actual: ${request.prompt}`, keys[target.provider], images);
    const logs: ExecutionResult['logs'] = [
      { id: crypto.randomUUID(), timestamp: startedAt, agentId: agent.id, agentName: agent.name, type: 'agent_executing', message: `${agent.name} inició la generación de una imagen con ${target.model}.` },
      { id: crypto.randomUUID(), timestamp: new Date().toISOString(), agentId: agent.id, agentName: agent.name, type: 'completed', message: `${agent.name} recibió la imagen generada.` },
    ];
    return { reply: `Imagen generada con ${target.model}.\n\n${imageAdvice('generation', target.provider)}`, delegation: undefined, logs, generatedImage: image, imageProvider: target.provider, imageModel: target.model };
  }
  args[5] = images.length ? (actingAgent, prompt, apiKeys) => describeImages(actingAgent, prompt, images, apiKeys[actingAgent.provider]) : args[5] || callAIProvider;
  const result = await executeAgentChat(...args);
  if (receivedImage) result.reply = `${result.reply.slice(0, 11000)}\n\n${imageAdvice('vision', agent.provider)}`;
  return { ...result, generatedImage: undefined, imageProvider: undefined, imageModel: undefined };
}
