import type { UserStatus } from '@shared/schema';
import type { ReleaseStatus } from './types';

export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        const base64 = result.includes(',') ? result.split(',')[1] ?? '' : result;
        resolve(base64);
      } else {
        reject(new Error('Unable to read file'));
      }
    };
    reader.onerror = () => reject(new Error('Unable to read file'));
    reader.readAsDataURL(file);
  });
};

export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  active: 'Active',
  suspended: 'Suspended',
  deleted: 'Deleted',
};

export const userStatusOptions: Array<{ value: UserStatus; label: string; description: string }> = [
  { value: 'active', label: 'Active', description: 'User can sign in and use the workspace.' },
  { value: 'suspended', label: 'Suspended', description: 'Temporarily block access without deleting data.' },
  { value: 'deleted', label: 'Deleted', description: 'Deactivate the account and prevent access.' },
];

export const OUTPUT_TEMPLATE_CATEGORY_LABELS: Record<string, string> = {
  how_to: 'How-To',
  executive_brief: 'Executive Brief',
  json_report: 'JSON',
};

export const OUTPUT_TEMPLATE_FORMAT_LABELS: Record<string, string> = {
  markdown: 'Markdown',
  json: 'JSON',
};

export const RELEASE_STATUS_LABELS: Record<ReleaseStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  archived: 'Archived',
};

export const getOutputTemplateCategoryLabel = (category: string) =>
  OUTPUT_TEMPLATE_CATEGORY_LABELS[category] ?? category;

export const getOutputTemplateFormatLabel = (format: string) =>
  OUTPUT_TEMPLATE_FORMAT_LABELS[format] ?? format.toUpperCase();
