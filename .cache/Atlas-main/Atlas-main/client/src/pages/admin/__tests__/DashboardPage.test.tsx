import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { getSystemQuickCards, buildUserTabCards, type DashboardUserCardMetrics } from '../DashboardPage';
import { getAdminSectionTabTriggers } from '../../../components/admin/AdminSectionTabs';
import {
  ADMIN_ROUTES,
  getAdminRouteById,
  getDashboardRoutes,
  getRouteDashboardCard,
  type AdminRouteId,
} from '@shared/adminRoutes';
import { PERMISSIONS } from '@shared/constants';

test('system tab exposes system cards with expected titles and actions', () => {
  const cards = getSystemQuickCards(() => true);
  const systemRoutes = getDashboardRoutes('system');

  assert.equal(
    cards.length,
    systemRoutes.length,
    `expected ${systemRoutes.length} system cards`,
  );

  const routeIds = cards.map((card) => card.id);
  assert.deepEqual(
    routeIds,
    systemRoutes.map((route) => route.id),
    'system route ids should match dashboard inventory',
  );
  assert.ok(routeIds.includes('api-access'), 'expected API Access system card to be present');

  const titles = cards.map((card) => card.props.title);
  const expectedTitles = systemRoutes.map((route) => getRouteDashboardCard(route, 'system')?.title ?? null);
  assert.deepEqual(titles, expectedTitles);

  const actions = cards.map((card) => card.props.action?.label ?? null);
  const expectedActionLabels = systemRoutes.map(
    (route) => getRouteDashboardCard(route, 'system')?.actionLabel ?? null,
  );
  assert.deepEqual(actions, expectedActionLabels);

  const hrefs = cards.map((card) => {
    const routeKey = card.props.action?.routeKey ?? null;
    return routeKey ? ADMIN_ROUTES.system[routeKey]?.path ?? null : null;
  });
  const expectedHrefs = systemRoutes.map(
    (route) => ADMIN_ROUTES.system[route.id as AdminRouteId]?.path ?? null,
  );
  assert.deepEqual(hrefs, expectedHrefs);

  cards.forEach((card) => {
    const route = getAdminRouteById(card.id);
    const expectedMetadata = route.apis.map((endpoint) => ({
      label: endpoint.method,
      value: endpoint.path,
    }));

    assert.deepEqual(card.props.metadata ?? [], expectedMetadata);
    assert.equal(card.props.metadataTitle, 'Endpoints');
    assert.equal(card.props.action?.testId, `primary-${card.id}`);
  });
});

test('user tab cards expose six cards with correct metrics, actions, and links', () => {
  const metrics: DashboardUserCardMetrics = {
    totalUsers: 128,
    activeUsers: 96,
    adminUsers: 12,
    freePlanUsers: 86,
    proPlanUsers: 42,
    organizationCount: 15,
    topOrganizations: [
      { name: 'Acme Co', members: 12 },
      { name: 'Globex', members: 9 },
      { name: 'Initech', members: null },
    ],
    agentCount: 30,
    activeAgentCount: 24,
    knowledgeItemCount: 80,
    memoryItemCount: 35,
    totalTickets: 18,
    openTickets: 5,
    pendingTickets: 3,
  };

  const cards = buildUserTabCards(metrics, () => true);

  assert.equal(cards.length, 6, 'expected six user cards when all permissions are granted');

  const titles = cards.map((card) => card.props.title);
  const expectedTitles = cards.map((card) => {
    const route = getAdminRouteById(card.id);
    const dashboardCard = getRouteDashboardCard(route, 'workspace');
    return dashboardCard?.title;
  });
  assert.deepEqual(titles, expectedTitles);

  const actionLabels = cards.map((card) => card.props.action?.label ?? null);
  const expectedActionLabels = cards.map((card) => {
    const route = getAdminRouteById(card.id);
    const dashboardCard = getRouteDashboardCard(route, 'workspace');
    return dashboardCard?.actionLabel ?? null;
  });
  assert.deepEqual(actionLabels, expectedActionLabels);

  const scopes = cards.map((card) => card.props.action?.scope);
  assert.deepEqual(scopes, ['user', 'user', 'user', 'user', 'user', 'user']);

  const paths = cards.map((card) => {
    const action = card.props.action;
    return action?.routeKey ? ADMIN_ROUTES.user[action.routeKey]?.path ?? null : null;
  });
  assert.deepEqual(paths, [
    '/admin/users',
    '/admin/orgs',
    '/admin/plans',
    '/admin/agents',
    '/admin/memory',
    '/admin/tickets',
  ]);

  const organizationMetadata = cards[1].props.metadata ?? [];
  assert.equal(organizationMetadata[0]?.value, '12 members');
  assert.equal(organizationMetadata[2]?.value, 'n/a');

  const renderedUsersCard = renderToStaticMarkup(createElement('div', null, cards[0].props.children));
  assert.match(renderedUsersCard, /128/);
  assert.match(renderedUsersCard, /Total accounts/);

  const renderedTicketsCard = renderToStaticMarkup(createElement('div', null, cards[5].props.children));
  assert.match(renderedTicketsCard, /5/);
  assert.match(renderedTicketsCard, /Open support cases/);
});

test('user tab cards respect permission gating', () => {
  const metrics: DashboardUserCardMetrics = {
    totalUsers: 10,
    activeUsers: 8,
    adminUsers: 2,
    freePlanUsers: 6,
    proPlanUsers: 4,
    organizationCount: 2,
    topOrganizations: [],
    agentCount: 3,
    activeAgentCount: 2,
    knowledgeItemCount: 5,
    memoryItemCount: 1,
    totalTickets: 2,
    openTickets: 1,
    pendingTickets: 0,
  };

  const cards = buildUserTabCards(metrics, (permission) => permission !== PERMISSIONS.PLANS_VIEW);

  assert.equal(cards.length, 5, 'expected plans card to be hidden without plans permission');
  assert.equal(cards.some((card) => card.id === 'plans'), false);
});





test('header User tab triggers the provided change handler', () => {
  const recorded: string[] = [];
  const triggers = getAdminSectionTabTriggers({
    onValueChange: (value) => recorded.push(value),
    systemDisabled: false,
    userDisabled: false,
  });

  triggers.user.onClick();
  triggers.system.onClick();

  assert.deepEqual(recorded, ['user', 'system']);
});
