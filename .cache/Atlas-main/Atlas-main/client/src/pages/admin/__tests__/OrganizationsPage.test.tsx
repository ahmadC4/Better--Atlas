import test from 'node:test';
import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  DEFAULT_ORGANIZATION_SORT,
  OrganizationFormFields,
  OrganizationsTableCard,
  initializeOrganizationFormState,
  mockUpdateOrganization,
  sortOrganizations,
  type OrganizationFormState,
} from '../OrganizationsPage';
import type { AdminOrganization } from '../types';

const sampleOrganizations: AdminOrganization[] = [
  { id: 'org-2', name: 'Globex Research', members: 9 },
  { id: 'org-1', name: 'Atlas Labs', members: 18 },
  { id: 'org-3', name: 'Initech', members: 6 },
];

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('sortOrganizations sorts by name and members as expected', () => {
  const byNameAsc = sortOrganizations(sampleOrganizations, { key: 'name', direction: 'asc' });
  assert.deepEqual(
    byNameAsc.map((org) => org.name),
    ['Atlas Labs', 'Globex Research', 'Initech'],
  );

  const byNameDesc = sortOrganizations(sampleOrganizations, { key: 'name', direction: 'desc' });
  assert.deepEqual(
    byNameDesc.map((org) => org.name),
    ['Initech', 'Globex Research', 'Atlas Labs'],
  );

  const byMembersAsc = sortOrganizations(sampleOrganizations, { key: 'members', direction: 'asc' });
  assert.deepEqual(
    byMembersAsc.map((org) => org.members),
    [6, 9, 18],
  );

  const byMembersDesc = sortOrganizations(sampleOrganizations, { key: 'members', direction: 'desc' });
  assert.deepEqual(
    byMembersDesc.map((org) => org.members),
    [18, 9, 6],
  );
});

test('OrganizationsTableCard renders loading, error, empty, and data states', () => {
  void React;

  const renderCard = (props: Partial<React.ComponentProps<typeof OrganizationsTableCard>>) =>
    renderToStaticMarkup(
      createElement(OrganizationsTableCard, {
        organizations: [],
        isLoading: false,
        isError: false,
        onRetry: () => undefined,
        sortState: DEFAULT_ORGANIZATION_SORT,
        onSortChange: () => undefined,
        onEdit: () => undefined,
        ...props,
      }),
    );

  const loadingMarkup = renderCard({ isLoading: true });
  assert.match(loadingMarkup, /data-testid="organizations-loading"/);
  assert.match(loadingMarkup, /Fetching organizations/);

  const errorMarkup = renderCard({ isError: true });
  assert.match(errorMarkup, /data-testid="organizations-error"/);
  assert.match(errorMarkup, /Retry/);

  const emptyMarkup = renderCard({ organizations: [] });
  assert.match(emptyMarkup, /data-testid="organizations-empty"/);
  assert.match(emptyMarkup, /No organizations have been connected yet/);

  const dataMarkup = renderCard({ organizations: sampleOrganizations });
  assert.match(dataMarkup, /data-testid="organizations-table"/);
  sampleOrganizations.forEach((org) => {
    assert.match(
      dataMarkup,
      new RegExp(escapeRegExp(`data-testid="organization-row-${org.id}"`)),
      `expected row for ${org.name}`,
    );
  });
});

test('Organization form helpers prepare and render drawer fields', async () => {
  void React;
  const target = sampleOrganizations[0];
  const formState = initializeOrganizationFormState(target);
  assert.equal(formState.name, target.name);
  assert.equal(formState.members, target.members.toString());

  const markup = renderToStaticMarkup(
    createElement(OrganizationFormFields, {
      formState,
      onFieldChange: () => undefined,
    }),
  );

  assert.match(markup, /Organization name/);
  assert.match(markup, new RegExp(`value="${escapeRegExp(target.name)}"`));
  assert.match(markup, new RegExp(`value="${target.members}"`));

  const payload: OrganizationFormState = {
    name: '  Updated Org  ',
    members: '42',
    notes: '  Mock notes  ',
  };

  const result = await mockUpdateOrganization({ id: target.id, ...payload });
  assert.equal(result.mock, true);
  assert.deepEqual(result.organization, {
    id: target.id,
    name: 'Updated Org',
    members: 42,
    notes: 'Mock notes',
  });
});
