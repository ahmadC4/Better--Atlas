import { OutputTemplate, OutputTemplateValidation } from '../shared/schema.js';

const BOLD_WRAPPER_PATTERN = String.raw`(?:\*\*|__)`;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractJsonCandidate(content: string): string | null {
  const trimmed = content.trim();
  if (!trimmed) {
    return null;
  }

  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    return codeBlockMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1).trim();
  }

  return trimmed;
}

function parseJsonContent(content: string): Record<string, unknown> | null {
  const candidate = extractJsonCandidate(content);
  if (!candidate) {
    return null;
  }

  try {
    return JSON.parse(candidate) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function buildOutputTemplateInstruction(template: OutputTemplate): string {
  const sections = Array.isArray(template.requiredSections) ? template.requiredSections : [];
  const header = `You must follow the \"${template.name}\" output template (${template.category}).`;
  const details = template.instructions?.trim() ? template.instructions.trim() : '';

  const sectionLines = sections.map((section, index) => {
    const hint = section.description?.trim() ? ` — ${section.description.trim()}` : '';
    const keyInfo = template.format === 'json' ? ` [key: ${section.key}]` : '';
    return `${index + 1}. ${section.title}${keyInfo}${hint}`;
  });

  const formatInstruction = template.format === 'json'
    ? `Return a single valid JSON object with keys: ${sections.map(section => `"${section.key}"`).join(', ')}. Do not include any commentary or markdown outside of the JSON.`
    : 'Structure the response using Markdown headings for each required section above, presented in the same order.';

  return [
    header,
    details,
    sectionLines.length > 0 ? 'Required sections:' : '',
    sectionLines.length > 0 ? sectionLines.join('\n') : '',
    formatInstruction,
    'Include every required section even if the correct response is "None" or "Not applicable".'
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function validateOutputTemplateContent(
  template: OutputTemplate,
  content: string,
): OutputTemplateValidation {
  const sections = Array.isArray(template.requiredSections) ? template.requiredSections : [];
  const missingSections: string[] = [];

  if (!content || !content.trim()) {
    missingSections.push(...sections.map(section => section.title));
  } else if (template.format === 'json') {
    const parsed = parseJsonContent(content);
    if (!parsed) {
      missingSections.push(...sections.map(section => section.title));
    } else {
      for (const section of sections) {
        const value = parsed[section.key as keyof typeof parsed];
        const hasValue = value !== undefined && value !== null && !(typeof value === 'string' && value.trim() === '');
        if (!hasValue) {
          missingSections.push(section.title);
        }
      }
    }
  } else {
    const normalized = content.replace(/\r/g, '');
    for (const section of sections) {
      const label = escapeRegExp(section.title.trim());
      const headingPattern = String.raw`(^|\n)\s*(?:#{1,6}\s*)${label}(\s|$)`;
      const colonPattern = String.raw`(^|\n)\s*(?:${BOLD_WRAPPER_PATTERN})?${label}(?:${BOLD_WRAPPER_PATTERN})?\s*[:\-]`;
      const headingRegex = new RegExp(headingPattern, 'i');
      const colonRegex = new RegExp(colonPattern, 'i');
      if (!headingRegex.test(normalized) && !colonRegex.test(normalized)) {
        missingSections.push(section.title);
      }
    }
  }

  return {
    status: missingSections.length === 0 ? 'pass' : 'fail',
    missingSections,
    checkedAt: new Date().toISOString(),
  };
}
