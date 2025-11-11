import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const adminSettingsModule = await import('../client/src/hooks/use-admin-settings.ts');
const adminLayoutModule = await import('../client/src/components/AdminLayout.tsx');
const adminComponentsModule = await import('../client/src/components/admin/index.ts');

const layoutValue = {
  setHeader: () => {},
  resetHeader: () => {},
  breadcrumbs: [],
  activeTab: 'system' as const,
  setActiveTab: () => {},
};

interface PageUnderTest {
  name: string;
  importPath: string;
  testId: string;
  expectedTitle: string;
}

const pages: PageUnderTest[] = [
  {
    name: 'APIAccessPage',
    importPath: '../client/src/pages/admin/APIAccessPage.tsx',
    testId: 'admin-settings-error-state-api-access',
    expectedTitle: "We couldn't load API Access settings.",
  },
  {
    name: 'AgentsPage',
    importPath: '../client/src/pages/admin/AgentsPage.tsx',
    testId: 'admin-settings-error-state-agents',
    expectedTitle: "We couldn't load AI Agents settings.",
  },
  {
    name: 'KnowledgeBasePage',
    importPath: '../client/src/pages/admin/KnowledgeBasePage.tsx',
    testId: 'admin-settings-error-state-knowledge-base',
    expectedTitle: "We couldn't load Knowledge Base settings.",
  },
  {
    name: 'MemoryPage',
    importPath: '../client/src/pages/admin/MemoryPage.tsx',
    testId: 'admin-settings-error-state-memory',
    expectedTitle: "We couldn't load Memory & Personalization settings.",
  },
  {
    name: 'PlansPage',
    importPath: '../client/src/pages/admin/PlansPage.tsx',
    testId: 'admin-settings-error-state-plans',
    expectedTitle: "We couldn't load Plan Configuration settings.",
  },
  {
    name: 'TemplatesProjectsPage',
    importPath: '../client/src/pages/admin/TemplatesProjectsPage.tsx',
    testId: 'admin-settings-error-state-templates-projects',
    expectedTitle: "We couldn't load Templates & Projects settings.",
  },
];

for (const page of pages) {
  test(`${page.name} renders the shared error state and retries`, async () => {
    const refetchMock = mock.fn(async () => {});

    const settingsMock = mock.method(adminSettingsModule, 'useAdminSettings', () => ({
      settings: null,
      draft: null,
      setDraft: () => {},
      isLoading: false,
      isError: true,
      isSaving: false,
      handleSave: async () => {},
      resetDraft: () => {},
      hasChanges: false,
      refetch: refetchMock,
    }));

    const layoutMock = mock.method(adminLayoutModule, 'useAdminLayout', () => layoutValue);

    let capturedProps: {
      title: string;
      description: string;
      onRetry: () => Promise<unknown> | void;
      testId?: string;
    } | null = null;

    const errorComponentMock = mock.method(
      adminComponentsModule,
      'AdminSettingsErrorState',
      (props: {
        title: string;
        description: string;
        onRetry: () => Promise<unknown> | void;
        testId?: string;
      }) => {
        capturedProps = props;
        return null;
      },
    );

    try {
      const module = await import(page.importPath);
      const PageComponent = module.default;

      renderToStaticMarkup(createElement(PageComponent));

      assert.ok(capturedProps, 'expected shared error state to render when query errors');
      assert.equal(capturedProps?.testId, page.testId);
      assert.equal(capturedProps?.title, page.expectedTitle);
      assert.match(capturedProps?.description ?? '', /Please check your connection and try again./);
      assert.strictEqual(capturedProps?.onRetry, refetchMock);

      await capturedProps?.onRetry?.();
      assert.equal(refetchMock.mock.callCount(), 1, 'expected retry to trigger refetch');
    } finally {
      errorComponentMock.restore();
      layoutMock.restore();
      settingsMock.restore();
    }
  });
}
