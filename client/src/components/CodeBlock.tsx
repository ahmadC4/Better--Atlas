import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { highlightCode } from '@/lib/codeHighlighter';

export interface CodeBlockProps {
  code: string;
  lang?: string;
  isDarkMode?: boolean;
}

export function CodeBlock({ code, lang, isDarkMode = false }: CodeBlockProps) {
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    if (!isCopied) return;
    const timer = setTimeout(() => setIsCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [isCopied]);

  const { html, label } = useMemo(() => highlightCode(code, lang), [code, lang]);
  const theme = 'dark';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setIsCopied(true);
    } catch (error) {
      console.error('Failed to copy code:', error);
    }
  };

  return (
    <div
      className={cn(
        'atlas-codebox overflow-hidden rounded-xl border shadow-sm backdrop-blur-sm transition',
        'border-slate-800/70 bg-[#0b0b0f] text-slate-100'
      )}
      data-theme={theme}
    >
      <div className="atlas-codebox__header">
        <span className="truncate" title={label}>
          {label}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[11px]"
          onClick={handleCopy}
          aria-label="Copy code snippet"
        >
          {isCopied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <div className="atlas-codebox__content">
        <pre className="atlas-codebox__pre" role="region" aria-live="off">
          <code
            className="atlas-codebox__code"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </pre>
      </div>
    </div>
  );
}
