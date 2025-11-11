import { nanoid } from 'nanoid';

/**
 * Estimate token count from text using a simple heuristic
 * ~1 token per 4 characters for English text
 * This is a rough approximation and will be marked as estimated=true
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  // Average of 4 characters per token (conservative estimate)
  return Math.ceil(text.length / 4);
}

/**
 * Calculate cost in USD based on token counts and pricing
 */
export function calculateCost(
  inputTokens: number,
  outputTokens: number,
  inputPricePerK: string,
  outputPricePerK: string
): string {
  const inputCost = (inputTokens / 1000) * parseFloat(inputPricePerK);
  const outputCost = (outputTokens / 1000) * parseFloat(outputPricePerK);
  const totalCost = inputCost + outputCost;
  
  // Return as string with 6 decimal places to preserve precision
  return totalCost.toFixed(6);
}

/**
 * Generate a unique request ID for tracking
 */
export function generateRequestId(): string {
  return nanoid();
}

/**
 * Estimate tokens from messages array
 */
export function estimateMessagesTokens(messages: Array<{ role: string; content: string }>): number {
  const totalText = messages.map(m => m.content).join(' ');
  return estimateTokens(totalText);
}
