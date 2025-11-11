import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';

import { AgentsPanel, getRunResponseSnippet, getRunTimestamp, type N8nAgentRun } from '../client/src/components/AgentsPanel';
import type { N8nAgent } from '@shared/schema';

test('AgentsPanel renders connected agents with test controls', () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  const agent: N8nAgent = {
    id: 'agent-1',
    userId: 'user-1',
    workflowId: 'wf-123',
    name: 'Demo Agent',
    description: 'Syncs data from CRM.',
    status: 'active',
    webhookUrl: 'https://example.com/hook',
    metadata: null,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-02T00:00:00.000Z'),
  };

  queryClient.setQueryData(['/api/integrations/n8n/agents'], [agent]);

  const { hook } = memoryLocation({ path: '/', static: true });

  const html = renderToString(
    <QueryClientProvider client={queryClient}>
      <Router hook={hook}>
        <AgentsPanel />
      </Router>
    </QueryClientProvider>,
  );

  assert.match(html, /Demo Agent/);
  assert.match(html, /Test agent/);
  assert.match(html, /View recent runs/);
});

test('getRunTimestamp prefers finishedAt before createdAt', () => {
  const run: N8nAgentRun = {
    id: 'run-1',
    status: 'success',
    createdAt: '2024-01-01T00:00:00.000Z',
    finishedAt: '2024-01-01T00:05:00.000Z',
  };

  const date = getRunTimestamp(run);
  assert.ok(date, 'expected timestamp to be parsed');
  assert.equal(date?.toISOString(), '2024-01-01T00:05:00.000Z');
});

test('getRunResponseSnippet truncates lengthy payloads', () => {
  const run: N8nAgentRun = {
    id: 'run-2',
    status: 'failed',
    response: 'x'.repeat(200),
  };

  const snippet = getRunResponseSnippet(run, 32);
  assert.equal(snippet.length, 32);
  assert.ok(snippet.endsWith('…'));
});
