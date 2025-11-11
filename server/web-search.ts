// Web Search Service using Perplexity API
export interface WebSearchResult {
  query: string;
  answer: string;
  sources?: string[];
}

const PERPLEXITY_ENDPOINT = 'https://api.perplexity.ai/chat/completions';
const PERPLEXITY_SEARCH_MODEL = 'sonar-pro';

export async function performWebSearch(query: string): Promise<WebSearchResult> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    throw new Error('Perplexity API key is required for web search');
  }

  try {
    const response = await fetch(PERPLEXITY_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: PERPLEXITY_SEARCH_MODEL,
        messages: [
          {
            role: 'user',
            content: query,
          },
        ],
        max_tokens: 500,
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Web search error ${response.status}:`, errorText);
      throw new Error(`Web search failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const answer = data.choices[0]?.message?.content || '';

    return {
      query,
      answer,
      sources: data.citations || [],
    };
  } catch (error) {
    console.error('Web search error:', error);
    throw new Error(`Web search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
