import test from 'node:test';
import assert from 'node:assert/strict';

import { validateOutputTemplateContent, buildOutputTemplateInstruction } from '../server/output-template-utils';
import type { OutputTemplate } from '@shared/schema';

test('validateOutputTemplateContent detects missing markdown sections', () => {
  const template: OutputTemplate = {
    id: 'template-1',
    name: 'How-To Guide',
    category: 'how_to',
    format: 'markdown',
    description: null,
    instructions: null,
    requiredSections: [
      { key: 'overview', title: 'Overview' },
      { key: 'steps', title: 'Step-by-Step' },
    ],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const passingContent = `## Overview\nThis is the overview.\n\n## Step-by-Step\n1. Do this.`;
  const failingContent = `## Overview\nThis is the overview.`;

  const passResult = validateOutputTemplateContent(template, passingContent);
  assert.equal(passResult.status, 'pass');
  assert.deepEqual(passResult.missingSections, []);

  const failResult = validateOutputTemplateContent(template, failingContent);
  assert.equal(failResult.status, 'fail');
  assert.deepEqual(failResult.missingSections, ['Step-by-Step']);
});

test('validateOutputTemplateContent validates JSON payloads', () => {
  const template: OutputTemplate = {
    id: 'template-2',
    name: 'API Response',
    category: 'json_report',
    format: 'json',
    description: 'Machine-readable summary',
    instructions: 'Return a JSON object only.',
    requiredSections: [
      { key: 'summary', title: 'Summary' },
      { key: 'status', title: 'Status' },
    ],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const passingContent = '{"summary":"All good","status":"ok"}';
  const failingContent = '```json\n{"summary":"All good"}\n```';

  const passResult = validateOutputTemplateContent(template, passingContent);
  assert.equal(passResult.status, 'pass');

  const failResult = validateOutputTemplateContent(template, failingContent);
  assert.equal(failResult.status, 'fail');
  assert.deepEqual(failResult.missingSections, ['Status']);
});

test('buildOutputTemplateInstruction includes template details', () => {
  const template: OutputTemplate = {
    id: 'template-3',
    name: 'Executive Brief',
    category: 'executive_brief',
    format: 'markdown',
    description: 'Summarize for leadership',
    instructions: 'Focus on actions and impact.',
    requiredSections: [
      { key: 'summary', title: 'Summary', description: 'Concise overview' },
      { key: 'actions', title: 'Recommended Actions' },
    ],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const instruction = buildOutputTemplateInstruction(template);
  assert.match(instruction, /Executive Brief/);
  assert.match(instruction, /Summary/);
  assert.match(instruction, /Recommended Actions/);
  assert.match(instruction, /Include every required section/);
});
