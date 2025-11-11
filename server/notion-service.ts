import { Client } from '@notionhq/client';
import { storage } from './storage/index.js';

const NOTION_NOT_CONNECTED_ERROR = 'Notion not connected';

class NotionNotConnectedError extends Error {
  constructor(message = NOTION_NOT_CONNECTED_ERROR) {
    super(message);
    this.name = 'NotionNotConnectedError';
  }
}

async function getUserNotionApiKey(userId: string): Promise<string> {
  const record = await storage.getUserApiKey(userId, 'notion');
  if (!record?.apiKey) {
    throw new NotionNotConnectedError();
  }
  return record.apiKey;
}

// WARNING: Never cache this client.
// Access tokens can be rotated, so a new client must be created each time.
export async function getUncachableNotionClient(userId: string) {
  const apiKey = await getUserNotionApiKey(userId);
  return new Client({ auth: apiKey });
}

export async function checkNotionConnection(
  userId: string,
): Promise<{ connected: boolean; needsAuth?: boolean; error?: string }> {
  try {
    const client = await getUncachableNotionClient(userId);
    await client.users.me({});
    return { connected: true };
  } catch (error: any) {
    if (error instanceof NotionNotConnectedError) {
      return { connected: false, needsAuth: true };
    }

    const code = error?.code ?? error?.body?.code;
    if (code === 'unauthorized' || error?.status === 401) {
      return { connected: false, needsAuth: true, error: 'Invalid Notion API key' };
    }

    return {
      connected: false,
      needsAuth: true,
      error: error instanceof Error ? error.message : 'Failed to verify Notion connection',
    };
  }
}

export async function getNotionDatabases(userId: string) {
  try {
    const client = await getUncachableNotionClient(userId);
    const response = await client.search({
      page_size: 100,
    });
    return response.results.filter((item: any) => item.object === 'database');
  } catch (error) {
    if (error instanceof NotionNotConnectedError) {
      throw new Error(NOTION_NOT_CONNECTED_ERROR);
    }
    throw error;
  }
}

export async function getNotionPages(userId: string) {
  try {
    const client = await getUncachableNotionClient(userId);
    const response = await client.search({
      filter: {
        property: 'object',
        value: 'page',
      },
      page_size: 100,
    });
    return response.results;
  } catch (error) {
    if (error instanceof NotionNotConnectedError) {
      throw new Error(NOTION_NOT_CONNECTED_ERROR);
    }
    throw error;
  }
}

export { NOTION_NOT_CONNECTED_ERROR };
