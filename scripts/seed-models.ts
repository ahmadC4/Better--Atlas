import { db } from "../server/db";
import { models } from "@shared/schema";
import type { InsertModel } from "@shared/schema";

const modelData: InsertModel[] = [
  // OpenAI Models
  {
    provider: "openai",
    modelId: "gpt-5",
    displayName: "GPT-5",
    description: "Most capable OpenAI model with advanced reasoning",
    capabilities: {
      code: true,
      web: true,
      vision: true,
      audio: true,
      streaming: true,
    },
    basePricing: {
      input_per_1k_usd: 0.015,
      output_per_1k_usd: 0.06,
    },
    contextWindow: 128000,
    maxOutputTokens: 16384,
    isActive: true,
  },
  {
    provider: "openai",
    modelId: "gpt-5-mini",
    displayName: "GPT-5 Mini",
    description: "Smaller, faster, and more cost-effective GPT-5 variant",
    capabilities: {
      code: true,
      web: true,
      vision: false,
      audio: false,
      streaming: true,
    },
    basePricing: {
      input_per_1k_usd: 0.0003,
      output_per_1k_usd: 0.0015,
    },
    contextWindow: 128000,
    maxOutputTokens: 16384,
    isActive: true,
  },
  {
    provider: "openai",
    modelId: "gpt-4-turbo",
    displayName: "GPT-4 Turbo",
    description: "Previous generation with vision capabilities",
    capabilities: {
      code: true,
      web: false,
      vision: true,
      audio: false,
      streaming: true,
    },
    basePricing: {
      input_per_1k_usd: 0.01,
      output_per_1k_usd: 0.03,
    },
    contextWindow: 128000,
    maxOutputTokens: 4096,
    isActive: true,
  },
  // Anthropic Models
  {
    provider: "anthropic",
    modelId: "claude-4.5-sonnet",
    displayName: "Claude 4.5 Sonnet",
    description: "Most intelligent Claude model with advanced analysis",
    capabilities: {
      code: true,
      web: false,
      vision: true,
      audio: false,
      streaming: true,
    },
    basePricing: {
      input_per_1k_usd: 0.003,
      output_per_1k_usd: 0.015,
    },
    contextWindow: 200000,
    maxOutputTokens: 8192,
    isActive: true,
  },
  {
    provider: "anthropic",
    modelId: "claude-4.5-haiku",
    displayName: "Claude 4.5 Haiku",
    description: "Fast and cost-effective Claude model",
    capabilities: {
      code: true,
      web: false,
      vision: false,
      audio: false,
      streaming: true,
    },
    basePricing: {
      input_per_1k_usd: 0.00025,
      output_per_1k_usd: 0.00125,
    },
    contextWindow: 200000,
    maxOutputTokens: 8192,
    isActive: true,
  },
  {
    provider: "anthropic",
    modelId: "claude-3-opus",
    displayName: "Claude 3 Opus",
    description: "Previous generation top-tier Claude model",
    capabilities: {
      code: true,
      web: false,
      vision: true,
      audio: false,
      streaming: true,
    },
    basePricing: {
      input_per_1k_usd: 0.015,
      output_per_1k_usd: 0.075,
    },
    contextWindow: 200000,
    maxOutputTokens: 4096,
    isActive: true,
  },
  // Groq Models
  {
    provider: "groq",
    modelId: "llama-3.1-70b",
    displayName: "Llama 3.1 70B",
    description: "Large open-source model with fast inference",
    capabilities: {
      code: true,
      web: false,
      vision: false,
      audio: false,
      streaming: true,
    },
    basePricing: {
      input_per_1k_usd: 0.00059,
      output_per_1k_usd: 0.00079,
    },
    contextWindow: 131072,
    maxOutputTokens: 8192,
    isActive: true,
  },
  {
    provider: "groq",
    modelId: "llama-3.1-8b",
    displayName: "Llama 3.1 8B",
    description: "Smaller Llama model with very fast inference",
    capabilities: {
      code: true,
      web: false,
      vision: false,
      audio: false,
      streaming: true,
    },
    basePricing: {
      input_per_1k_usd: 0.00005,
      output_per_1k_usd: 0.00008,
    },
    contextWindow: 131072,
    maxOutputTokens: 8192,
    isActive: true,
  },
  {
    provider: "groq",
    modelId: "mixtral-8x7b",
    displayName: "Mixtral 8x7B",
    description: "Mixture of experts model with good performance",
    capabilities: {
      code: true,
      web: false,
      vision: false,
      audio: false,
      streaming: true,
    },
    basePricing: {
      input_per_1k_usd: 0.00024,
      output_per_1k_usd: 0.00024,
    },
    contextWindow: 32768,
    maxOutputTokens: 8192,
    isActive: true,
  },
  // Perplexity Models
  {
    provider: "perplexity",
    modelId: "sonar-large",
    displayName: "Sonar Large",
    description: "Advanced model with web search capabilities",
    capabilities: {
      code: false,
      web: true,
      vision: false,
      audio: false,
      streaming: true,
    },
    basePricing: {
      input_per_1k_usd: 0.001,
      output_per_1k_usd: 0.001,
    },
    contextWindow: 127000,
    maxOutputTokens: 4096,
    isActive: true,
  },
  {
    provider: "perplexity",
    modelId: "sonar-small",
    displayName: "Sonar Small",
    description: "Fast search-enabled model",
    capabilities: {
      code: false,
      web: true,
      vision: false,
      audio: false,
      streaming: true,
    },
    basePricing: {
      input_per_1k_usd: 0.0002,
      output_per_1k_usd: 0.0002,
    },
    contextWindow: 127000,
    maxOutputTokens: 4096,
    isActive: true,
  },
];

async function seedModels() {
  console.log("🌱 Starting to seed models...");

  try {
    // Clear existing models
    console.log("Clearing existing models...");
    await db.delete(models);

    // Insert new models
    console.log(`Inserting ${modelData.length} models...`);
    const insertedModels = await db.insert(models).values(modelData).returning();

    console.log("✅ Successfully seeded models:");
    insertedModels.forEach((model) => {
      console.log(`  - ${model.provider}: ${model.displayName} (${model.modelId})`);
    });

    console.log(`\n📊 Summary:`);
    console.log(`  Total models: ${insertedModels.length}`);
    const providers = [...new Set(insertedModels.map((m) => m.provider))];
    console.log(`  Providers: ${providers.join(", ")}`);

    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding models:", error);
    process.exit(1);
  }
}

// Run the seeding function
seedModels();