import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

import { useAdminInventoryDiagnostics } from '../AdminLayout';

const ensureMinimalDom = () => {
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    return;
  }

  class MinimalElement {
    nodeType = 1;
    ownerDocument: Document;
    tagName: string;
    nodeName: string;
    firstChild: MinimalElement | MinimalTextNode | null = null;
    childNodes: Array<MinimalElement | MinimalTextNode> = [];
    parentNode: MinimalElement | null = null;
    listeners = new Map<string, Set<EventListener>>();
    attributes = new Map<string, string>();
    classList = {
      add: () => {},
      remove: () => {},
      contains: () => false,
    };
    style: Record<string, unknown> = {};

    constructor(tagName: string | undefined, ownerDocument: Document) {
      this.tagName = (tagName ?? 'div').toUpperCase();
      this.nodeName = this.tagName;
      this.ownerDocument = ownerDocument;
    }

    appendChild(child: MinimalElement | MinimalTextNode) {
      child.parentNode = this;
      this.childNodes.push(child);
      if (!this.firstChild) {
        this.firstChild = child;
      }
      return child;
    }

    removeChild(child: MinimalElement | MinimalTextNode) {
      const index = this.childNodes.indexOf(child);
      if (index >= 0) {
        this.childNodes.splice(index, 1);
        child.parentNode = null;
        this.firstChild = this.childNodes[0] ?? null;
      }
      return child;
    }

    addEventListener(type: string, listener: EventListener) {
      const listeners = this.listeners.get(type) ?? new Set<EventListener>();
      listeners.add(listener);
      this.listeners.set(type, listeners);
    }

    removeEventListener(type: string, listener: EventListener) {
      const listeners = this.listeners.get(type);
      if (!listeners) return;
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.listeners.delete(type);
      }
    }

    setAttribute(name: string, value: string) {
      this.attributes.set(name, value);
    }

    removeAttribute(name: string) {
      this.attributes.delete(name);
    }
  }

  class MinimalHTMLElement extends MinimalElement {}

  class MinimalTextNode {
    nodeType = 3;
    data: string;
    parentNode: MinimalElement | null = null;
    ownerDocument: Document;

    constructor(data: string, ownerDocument: Document) {
      this.data = data;
      this.ownerDocument = ownerDocument;
    }
  }

  class MinimalDocument {
    listeners = new Map<string, Set<EventListener>>();
    body: MinimalHTMLElement;
    documentElement: MinimalHTMLElement;
    defaultView: any;

    constructor(windowRef: any) {
      this.defaultView = windowRef;
      this.body = this.createElement('body');
      this.documentElement = this.createElement('html');
    }

    createElement(tagName: string) {
      return new MinimalHTMLElement(tagName, this as unknown as Document);
    }

    createTextNode(text: string) {
      return new MinimalTextNode(text, this as unknown as Document);
    }

    addEventListener(type: string, listener: EventListener) {
      const listeners = this.listeners.get(type) ?? new Set<EventListener>();
      listeners.add(listener);
      this.listeners.set(type, listeners);
    }

    removeEventListener(type: string, listener: EventListener) {
      const listeners = this.listeners.get(type);
      if (!listeners) return;
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.listeners.delete(type);
      }
    }

    dispatchEvent(event: Event) {
      const listeners = this.listeners.get(event.type);
      if (!listeners) return true;
      for (const listener of listeners) {
        listener.call(this, event);
      }
      return !event.defaultPrevented;
    }
  }

  const windowRef: any = {};
  const documentRef = new MinimalDocument(windowRef);
  windowRef.document = documentRef;
  windowRef.navigator = { userAgent: 'node' };
  windowRef.HTMLElement = MinimalHTMLElement;
  windowRef.HTMLIFrameElement = class extends MinimalHTMLElement {};
  windowRef.Event = class {
    type: string;
    defaultPrevented = false;
    constructor(type: string) {
      this.type = type;
    }
    preventDefault() {
      this.defaultPrevented = true;
    }
  };
  windowRef.requestAnimationFrame = (cb: any) => setTimeout(cb, 0);
  windowRef.cancelAnimationFrame = (id: any) => clearTimeout(id);
  windowRef.getComputedStyle = () => ({});
  windowRef.self = windowRef;
  windowRef.IS_REACT_ACT_ENVIRONMENT = true;

  Object.assign(globalThis, windowRef, {
    window: windowRef,
    document: documentRef,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
};

const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));

ensureMinimalDom();

const mockConsoleMethod = (method: 'info' | 'warn') => {
  const original = console[method];
  const stub = mock.fn((..._args: unknown[]) => {});
  (console as any)[method] = stub as unknown as typeof console[typeof method];
  return {
    fn: stub,
    restore: () => {
      (console as any)[method] = original;
    },
  };
};

const createDiagnosticsProbe = (isAdmin: boolean) => {
  return function DiagnosticsProbe() {
    useAdminInventoryDiagnostics(isAdmin);
    return React.createElement(React.Fragment);
  };
};

test('logs inventory summary when no items are missing', async () => {
  const sampleInventory = [
    { route: '/admin/users', items: [{ status: 'OK' }, { status: 'OK' }] },
    { routeId: 'plans', items: [{ status: 'OK' }] },
  ];

  const originalFetch = globalThis.fetch;
  const fetchMock = mock.fn(async () =>
    new Response(JSON.stringify(sampleInventory), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  (globalThis as any).fetch = fetchMock as unknown as typeof fetch;
  const infoMock = mockConsoleMethod('info');
  const warnMock = mockConsoleMethod('warn');

  const Probe = createDiagnosticsProbe(true);
  const container = document.createElement('div');
  const root = createRoot(container as unknown as Element);

  try {
    await act(async () => {
      root.render(React.createElement(Probe));
      await flushMicrotasks();
    });
    await flushMicrotasks();

    assert.equal(fetchMock.mock.callCount(), 1);
    assert.equal(infoMock.fn.mock.callCount(), 1);
    assert.equal(warnMock.fn.mock.callCount(), 0);

    const [message, payload] = infoMock.fn.mock.calls[0].arguments;
    assert.equal(message, '[admin-inventory] No missing admin inventory items detected.');
    assert.deepEqual(payload, { missingByRoute: {}, totalMissing: 0 });
  } finally {
    await act(async () => {
      root.unmount();
    });
    (globalThis as any).fetch = originalFetch;
    infoMock.restore();
    warnMock.restore();
  }
});

test('warns when the admin inventory report contains missing items', async () => {
  const sampleInventory = [
    {
      routeId: 'plans',
      items: [
        { status: 'OK' },
        { status: 'MISSING' },
      ],
    },
    {
      section: {
        path: '/admin/agents',
        status: 'MISSING',
      },
    },
  ];

  const originalFetch = globalThis.fetch;
  const fetchMock = mock.fn(async () =>
    new Response(JSON.stringify(sampleInventory), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  (globalThis as any).fetch = fetchMock as unknown as typeof fetch;
  const infoMock = mockConsoleMethod('info');
  const warnMock = mockConsoleMethod('warn');

  const Probe = createDiagnosticsProbe(true);
  const container = document.createElement('div');
  const root = createRoot(container as unknown as Element);

  try {
    await act(async () => {
      root.render(React.createElement(Probe));
      await flushMicrotasks();
    });
    await flushMicrotasks();

    assert.equal(fetchMock.mock.callCount(), 1);
    assert.equal(infoMock.fn.mock.callCount(), 0);
    assert.equal(warnMock.fn.mock.callCount(), 1);

    const [message, payload] = warnMock.fn.mock.calls[0].arguments;
    assert.equal(message, '[admin-inventory] Missing admin inventory items detected.');
    assert.deepEqual(payload, {
      missingByRoute: {
        '/admin/agents': 1,
        plans: 1,
      },
      totalMissing: 2,
    });
  } finally {
    await act(async () => {
      root.unmount();
    });
    (globalThis as any).fetch = originalFetch;
    infoMock.restore();
    warnMock.restore();
  }
});
