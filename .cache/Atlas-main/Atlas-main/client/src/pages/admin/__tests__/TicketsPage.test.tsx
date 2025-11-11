import test from 'node:test';
import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  TicketDrawerFields,
  TicketStatusBadge,
  TicketsTableCard,
  TICKET_STATUS_LABELS,
  TICKET_STATUS_OPTIONS,
  initializeTicketFormState,
  mockUpdateTicket,
} from '../TicketsPage';
import type { AdminTicket } from '../types';

const sampleTickets: AdminTicket[] = [
  { id: 'ticket-1001', status: 'open', assignee: 'sam@atlas.dev' },
  { id: 'ticket-1002', status: 'pending', assignee: null },
];

test('TicketsTableCard renders loading, error, empty, and populated states', () => {
  void React;

  const renderCard = (props: Partial<React.ComponentProps<typeof TicketsTableCard>>) =>
    renderToStaticMarkup(
      createElement(TicketsTableCard, {
        tickets: [],
        isLoading: false,
        isError: false,
        onRetry: () => undefined,
        onSelect: () => undefined,
        selectedTicketId: null,
        ...props,
      }),
    );

  const loadingMarkup = renderCard({ isLoading: true });
  assert.match(loadingMarkup, /data-testid="tickets-loading"/);
  assert.match(loadingMarkup, /Fetching support tickets/);

  const errorMarkup = renderCard({ isError: true });
  assert.match(errorMarkup, /data-testid="tickets-error"/);
  assert.match(errorMarkup, /Try again/);

  const emptyMarkup = renderCard({ tickets: [] });
  assert.match(emptyMarkup, /data-testid="tickets-empty"/);
  assert.match(emptyMarkup, /No tickets to review right now/);

  const dataMarkup = renderCard({ tickets: sampleTickets });
  assert.match(dataMarkup, /data-testid="tickets-table"/);
  sampleTickets.forEach((ticket) => {
    assert.match(
      dataMarkup,
      new RegExp(`data-testid="ticket-row-${ticket.id}"`),
      `expected row for ${ticket.id}`,
    );
  });
});

test('Ticket drawer helpers initialize state and sanitize payloads', async () => {
  void React;
  const target = sampleTickets[0];
  const formState = initializeTicketFormState(target);
  assert.equal(formState.status, 'open');
  assert.equal(formState.assignee, 'sam@atlas.dev');

  const unknownFormState = initializeTicketFormState({ id: 'ticket-x', status: 'unknown' });
  assert.equal(unknownFormState.status, 'open');
  assert.equal(unknownFormState.assignee, '');

  const markup = renderToStaticMarkup(
    createElement(TicketDrawerFields, {
      formState,
      onFieldChange: () => undefined,
    }),
  );

  assert.match(markup, /ticket-status-select/);
  assert.match(markup, /ticket-assignee-input/);
  TICKET_STATUS_OPTIONS.forEach((status) => {
    assert.match(markup, new RegExp(`ticket-status-option-${status}`));
  });

  const result = await mockUpdateTicket({
    id: target.id,
    status: 'pending',
    assignee: '  alex@atlas.dev  ',
  });

  assert.deepEqual(result, {
    mock: true,
    ticket: {
      id: target.id,
      status: 'pending',
      assignee: 'alex@atlas.dev',
    },
  });
});

test('TicketStatusBadge renders the correct label for each status', () => {
  void React;
  TICKET_STATUS_OPTIONS.forEach((status) => {
    const markup = renderToStaticMarkup(
      createElement(TicketStatusBadge, { status }),
    );

    assert.match(markup, new RegExp(`ticket-status-${status}`));
    assert.match(markup, new RegExp(TICKET_STATUS_LABELS[status]));
  });
});
