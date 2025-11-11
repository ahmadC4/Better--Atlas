import { forwardRef, useState, useEffect, useImperativeHandle, useRef, type ReactNode } from 'react';
import { User, Bot, Copy, RotateCcw, ThumbsUp, ThumbsDown, ChevronDown, ChevronRight, Brain, Sparkles, Globe, Code, BookOpen, ExternalLink, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { parseMarkdownTable, looksLikeTableDivider, looksLikeTableRow } from '@/lib/markdownTable';
import type { MarkdownTableParseResult } from '@/lib/markdownTable';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import type { Message as MessageType, Reaction, MessageMetadata } from '@shared/schema';
import { CodeBlock } from './CodeBlock';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface Message extends MessageType {
  // Extended interface for any additional frontend properties
}

type ContentSegment =
  | { type: 'text'; content: string }
  | { type: 'code'; content: string; lang?: string; rawLang?: string };

type ViewMode = 'formatted' | 'plain';

type ScrollBlockOption = 'start' | 'center' | 'end' | 'nearest';

export interface ChatMessagesHandle {
  scrollToBottom: (options?: ScrollToOptions) => void;
  scrollToTop: (options?: ScrollToOptions) => void;
  scrollToMessage: (messageId: string, options?: { behavior?: ScrollBehavior; block?: ScrollBlockOption }) => void;
}

const CODE_BLOCK_REGEX = /```([\w+-]*)\s*\n([\s\S]*?)```/g;

function parseMessageContent(content: string): ContentSegment[] {
  if (!content) {
    return [];
  }

  const segments: ContentSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = CODE_BLOCK_REGEX.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const textPortion = content.slice(lastIndex, match.index);
      if (textPortion) {
        segments.push({ type: 'text', content: textPortion });
      }
    }

    const rawLang = (match[1] || '').trim();
    segments.push({
      type: 'code',
      content: match[2],
      lang: rawLang || undefined,
      rawLang: rawLang || undefined,
    });

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    const remainder = content.slice(lastIndex);
    if (remainder) {
      segments.push({ type: 'text', content: remainder });
    }
  }

  return segments.length > 0 ? segments : [{ type: 'text', content }];
}

const segmentsToString = (segments: ContentSegment[]): string =>
  segments
    .map((segment) => {
      if (segment.type === 'code') {
        const langToken = segment.rawLang ?? segment.lang ?? '';
        return `\`\`\`${langToken}\n${segment.content}\n\`\`\``;
      }
      return segment.content;
    })
    .join('');

interface ParsedSource {
  id: string;
  label: string;
  href?: string;
  raw: string;
}

const SOURCE_SECTION_REGEX = /(?:\r?\n){1,}\s*\**\s*Sources:\s*\**\s*(?:\r?\n)([\s\S]+)$/i;

function parseSourceLine(line: string, index: number): ParsedSource {
  const cleaned = line.replace(/^\s*\d+[.)-]?\s*/, '').trim();
  const markdownLink = cleaned.match(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/);
  if (markdownLink) {
    return {
      id: `${index}`,
      label: markdownLink[1].trim(),
      href: markdownLink[2],
      raw: line,
    };
  }

  const urlMatch = cleaned.match(/(https?:\/\/\S+)/);
  if (urlMatch) {
    const label = cleaned.replace(urlMatch[1], '').trim();
    return {
      id: `${index}`,
      label: label || urlMatch[1],
      href: urlMatch[1],
      raw: line,
    };
  }

  return {
    id: `${index}`,
    label: cleaned || `Source ${index + 1}`,
    raw: line,
  };
}

function extractSources(content: string): { body: string; sources: ParsedSource[] } {
  const match = content.match(SOURCE_SECTION_REGEX);
  if (!match) {
    return { body: content, sources: [] };
  }

  const body = content.slice(0, match.index).trimEnd();
  const sourcesText = match[1].trim();
  if (!sourcesText) {
    return { body, sources: [] };
  }

  const lines = sourcesText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return {
    body,
    sources: lines.map((line, index) => parseSourceLine(line, index)),
  };
}

type InlinePatternType = 'link' | 'url' | 'bold' | 'italic' | 'underline' | 'code';

interface InlinePattern {
  type: InlinePatternType;
  create: () => RegExp;
}

const INLINE_PATTERNS: InlinePattern[] = [
  { type: 'link', create: () => /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/ },
  { type: 'url', create: () => /(https?:\/\/[^\s)]+)/ },
  { type: 'bold', create: () => /\*\*(.+?)\*\*/ },
  { type: 'bold', create: () => /__(.+?)__/ },
  { type: 'underline', create: () => /\+\+(.+?)\+\+/ },
  { type: 'italic', create: () => /\*(.+?)\*/ },
  { type: 'italic', create: () => /_(.+?)_/ },
  { type: 'code', create: () => /`([^`]+)`/ },
];

const tableAlignmentClassMap: Record<'left' | 'center' | 'right', string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

function renderTableBlock(
  table: MarkdownTableParseResult,
  key: string,
  isUser: boolean,
  keyPrefix: string,
): ReactNode {
  const headerKeyBase = `${keyPrefix}-table-header`;
  const bodyKeyBase = `${keyPrefix}-table-body`;
  return (
    <div
      key={key}
      className={cn(
        'table-responsive',
        isUser ? 'table-responsive-user' : 'table-responsive-assistant'
      )}
    >
      <div className="table-scroll">
        <table className="w-full min-w-full border-collapse text-xs sm:text-sm sm:min-w-[480px]">
          <thead className="bg-muted/60">
            <tr>
              {table.headers.map((header, headerIndex) => (
                <th
                  key={`${headerKeyBase}-${headerIndex}`}
                  className={cn(
                    'px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground',
                    tableAlignmentClassMap[table.alignments[headerIndex] ?? 'left'],
                  )}
                >
                  {parseInlineMarkdown(header, `${headerKeyBase}-${headerIndex}-content`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {table.rows.map((row, rowIndex) => (
              <tr key={`${bodyKeyBase}-${rowIndex}`} className={isUser ? 'bg-primary/20' : 'bg-card'}>
                {row.map((cell, cellIndex) => (
                  <td
                    key={`${bodyKeyBase}-${rowIndex}-${cellIndex}`}
                    className={cn(
                      'px-3 py-2 align-top text-[13px] leading-5 text-pretty sm:px-4 sm:text-[15px] sm:leading-6',
                      isUser ? 'text-primary-foreground' : 'text-card-foreground',
                      tableAlignmentClassMap[table.alignments[cellIndex] ?? 'left'],
                    )}
                  >
                    {parseInlineMarkdown(cell, `${bodyKeyBase}-${rowIndex}-${cellIndex}-content`)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-stacked">
        {table.rows.map((row, rowIndex) => (
          <div key={`${bodyKeyBase}-stacked-${rowIndex}`} className="table-stacked-row">
            {row.map((cell, cellIndex) => (
              <div key={`${bodyKeyBase}-stacked-${rowIndex}-${cellIndex}`} className="table-stacked-cell">
                <div className="table-stacked-label">
                  {parseInlineMarkdown(table.headers[cellIndex] ?? '', `${headerKeyBase}-stacked-${cellIndex}`)}
                </div>
                <div
                  className={cn(
                    'table-stacked-value',
                    isUser ? 'text-primary-foreground' : 'text-card-foreground'
                  )}
                >
                  {parseInlineMarkdown(cell, `${bodyKeyBase}-stacked-${rowIndex}-${cellIndex}-content`)}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function parseInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let remaining = text;
  let partIndex = 0;

  while (remaining.length > 0) {
    let earliest: { index: number; pattern: InlinePattern; match: RegExpExecArray } | null = null;

    for (const pattern of INLINE_PATTERNS) {
      const regex = pattern.create();
      const match = regex.exec(remaining);
      if (match) {
        const matchIndex = match.index;
        if (!earliest || matchIndex < earliest.index) {
          earliest = { index: matchIndex, pattern, match };
        }
      }
    }

    if (!earliest) {
      nodes.push(remaining);
      break;
    }

    if (earliest.index > 0) {
      nodes.push(remaining.slice(0, earliest.index));
    }

    const matchedText = earliest.match[0];
    const content = earliest.match[1] ?? '';
    const key = `${keyPrefix}-inline-${partIndex++}`;

    switch (earliest.pattern.type) {
      case 'link': {
        const label = content;
        const href = earliest.match[2];
        nodes.push(
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary underline underline-offset-4"
          >
            {parseInlineMarkdown(label, `${key}-label`)}
          </a>,
        );
        break;
      }
      case 'url': {
        nodes.push(
          <a
            key={key}
            href={matchedText}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary underline underline-offset-4"
          >
            {matchedText}
          </a>,
        );
        break;
      }
      case 'bold': {
        nodes.push(
          <strong key={key} className="font-semibold">
            {parseInlineMarkdown(content, `${key}-bold`)}
          </strong>,
        );
        break;
      }
      case 'italic': {
        nodes.push(
          <em key={key} className="italic">
            {parseInlineMarkdown(content, `${key}-italic`)}
          </em>,
        );
        break;
      }
      case 'underline': {
        nodes.push(
          <span key={key} className="underline">
            {parseInlineMarkdown(content, `${key}-underline`)}
          </span>,
        );
        break;
      }
      case 'code': {
        nodes.push(
          <code
            key={key}
            className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground"
          >
            {content}
          </code>,
        );
        break;
      }
    }

    remaining = remaining.slice(earliest.index + matchedText.length);
  }

  return nodes;
}

function renderMarkdownBlocks(content: string, keyPrefix: string, isUser: boolean): ReactNode[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const elements: ReactNode[] = [];
  let listBuffer: { type: 'ul' | 'ol'; items: string[] } | null = null;
  let blockquoteBuffer: string[] | null = null;
  let blockIndex = 0;

  const textColor = isUser ? 'text-primary-foreground' : 'text-card-foreground';

  const flushList = () => {
    if (!listBuffer) return;
    const listKey = `${keyPrefix}-list-${blockIndex++}`;
    if (listBuffer.type === 'ul') {
      elements.push(
        <ul key={listKey} className={cn('list-disc space-y-2 pl-5 text-[15px] leading-7 text-pretty', textColor)}>
          {listBuffer.items.map((item, idx) => (
            <li key={`${listKey}-item-${idx}`} className="break-words">
              {parseInlineMarkdown(item, `${listKey}-item-${idx}`)}
            </li>
          ))}
        </ul>,
      );
    } else {
      elements.push(
        <ol key={listKey} className={cn('list-decimal space-y-2 pl-5 text-[15px] leading-7 text-pretty', textColor)}>
          {listBuffer.items.map((item, idx) => (
            <li key={`${listKey}-item-${idx}`} className="break-words">
              {parseInlineMarkdown(item, `${listKey}-item-${idx}`)}
            </li>
          ))}
        </ol>,
      );
    }
    listBuffer = null;
  };

  const flushBlockquote = () => {
    if (!blockquoteBuffer) return;
    const quoteKey = `${keyPrefix}-quote-${blockIndex++}`;
    elements.push(
      <div
        key={quoteKey}
        className="rounded-xl border border-primary/30 bg-muted/40 px-4 py-3 text-muted-foreground"
      >
        <div className="space-y-1">
          {blockquoteBuffer.map((line, idx) => (
            <p key={`${quoteKey}-line-${idx}`} className="text-[15px] leading-7 text-pretty">
              {parseInlineMarkdown(line, `${quoteKey}-line-${idx}`)}
            </p>
          ))}
        </div>
      </div>,
    );
    blockquoteBuffer = null;
  };

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const rawLine = lines[lineIndex];
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      flushBlockquote();
      continue;
    }

    if (trimmed.startsWith('>')) {
      const quoteLine = trimmed.replace(/^>\s?/, '');
      if (!blockquoteBuffer) {
        blockquoteBuffer = [];
      }
      blockquoteBuffer.push(quoteLine);
      continue;
    }

    flushBlockquote();

    if (
      looksLikeTableRow(line) &&
      lineIndex + 1 < lines.length &&
      looksLikeTableDivider(lines[lineIndex + 1])
    ) {
      flushList();
      const parsedTable = parseMarkdownTable(lines, lineIndex);
      if (parsedTable) {
        const tableKey = `${keyPrefix}-table-${blockIndex++}`;
        elements.push(renderTableBlock(parsedTable, tableKey, isUser, keyPrefix));
        lineIndex = parsedTable.nextIndex - 1;
        continue;
      }
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushList();
      const level = Math.min(headingMatch[1].length, 4);
      const Tag = (`h${level}`) as 'h1' | 'h2' | 'h3' | 'h4';
      const headingKey = `${keyPrefix}-heading-${blockIndex++}`;
      const sizeClass =
        level === 1
          ? 'text-2xl'
          : level === 2
            ? 'text-xl'
            : level === 3
              ? 'text-lg'
              : 'text-base';
      const marginClass = elements.length === 0 ? 'mt-0' : 'mt-6';
      elements.push(
        <Tag
          key={headingKey}
          className={cn(
            sizeClass,
            marginClass,
            'font-semibold tracking-tight text-pretty',
            isUser ? 'text-primary-foreground' : 'text-foreground',
          )}
        >
          {parseInlineMarkdown(headingMatch[2].trim(), `${headingKey}-content`)}
        </Tag>,
      );
      continue;
    }

    if (/^(-{3,}|_{3,}|\*{3,})$/.test(trimmed)) {
      flushList();
      const ruleKey = `${keyPrefix}-rule-${blockIndex++}`;
      elements.push(<hr key={ruleKey} className="my-6 border-border/50" />);
      continue;
    }

    const orderedMatch = line.match(/^\d+[.)]\s+(.*)$/);
    if (orderedMatch) {
      if (!listBuffer || listBuffer.type !== 'ol') {
        flushList();
        listBuffer = { type: 'ol', items: [] };
      }
      listBuffer.items.push(orderedMatch[1]);
      continue;
    }

    const unorderedMatch = line.match(/^[-*+]\s+(.*)$/);
    if (unorderedMatch) {
      if (!listBuffer || listBuffer.type !== 'ul') {
        flushList();
        listBuffer = { type: 'ul', items: [] };
      }
      listBuffer.items.push(unorderedMatch[1]);
      continue;
    }

    flushList();
    const paragraphKey = `${keyPrefix}-paragraph-${blockIndex++}`;
    elements.push(
      <p
        key={paragraphKey}
        className={cn('text-[15px] leading-7 whitespace-pre-wrap break-words text-pretty', textColor)}
      >
        {parseInlineMarkdown(trimmed, `${paragraphKey}-content`)}
      </p>,
    );
  }

  flushBlockquote();
  flushList();

  return elements;
}

interface ChatMessagesProps {
  messages: Message[];
  isLoading?: boolean;
  onCopyMessage: (content: string) => void;
  onRegenerateResponse: (messageId: string) => void;
  className?: string;
  pendingUserMessage?: Message;
  streamingAssistantMessage?: {
    id: string;
    segments: ContentSegment[];
    metadata?: MessageMetadata;
    isComplete?: boolean;
  } | null;
  isDarkMode?: boolean;
  streamingActivity?: string | null;
  bottomOffset?: number;
}

// Hook for managing message reactions
function useMessageReactions(messageId: string) {
  const queryClient = useQueryClient();

  // Get current user to find their reactions
  const { data: user } = useQuery<{ id: string; username: string }>({
    queryKey: ['/api/user'],
  });

  const { data: reactions = [] } = useQuery<Reaction[]>({
    queryKey: ['/api/messages', messageId, 'reactions'],
    enabled: !!messageId,
  });

  const userReaction = user ? reactions.find((r) => r.userId === user.id) : undefined;

  const reactionMutation = useMutation({
    mutationFn: async (type: 'thumbs_up' | 'thumbs_down') => {
      const response = await apiRequest('POST', `/api/messages/${messageId}/reactions`, {
        type, // userId is now determined by backend auth
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/messages', messageId, 'reactions'] });
    },
  });

  const deleteReactionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('DELETE', `/api/messages/${messageId}/reactions`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/messages', messageId, 'reactions'] });
    },
  });

  const handleReaction = (type: 'thumbs_up' | 'thumbs_down') => {
    if (userReaction) {
      if (userReaction.type === type) {
        // Same reaction - remove it
        deleteReactionMutation.mutate();
      } else {
        // Different reaction - update it
        reactionMutation.mutate(type);
      }
    } else {
      // No existing reaction - create it
      reactionMutation.mutate(type);
    }
  };

  return {
    userReaction,
    handleReaction,
    isUpdating: reactionMutation.isPending || deleteReactionMutation.isPending,
  };
}

// Component for message reaction buttons
function MessageReactionButtons({ messageId }: { messageId: string }) {
  const { userReaction, handleReaction, isUpdating } = useMessageReactions(messageId);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          'h-7 px-2 bg-background/80 backdrop-blur-sm border shadow-sm',
          userReaction?.type === 'thumbs_up' && 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-300 dark:border-green-700'
        )}
        onClick={() => handleReaction('thumbs_up')}
        disabled={isUpdating}
        data-testid={`button-like-${messageId}`}
      >
        <ThumbsUp className="h-3 w-3" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          'h-7 px-2 bg-background/80 backdrop-blur-sm border shadow-sm',
          userReaction?.type === 'thumbs_down' && 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-300 dark:border-red-700'
        )}
        onClick={() => handleReaction('thumbs_down')}
        disabled={isUpdating}
        data-testid={`button-dislike-${messageId}`}
      >
        <ThumbsDown className="h-3 w-3" />
      </Button>
    </>
  );
}

// Component to display AI thinking/reasoning process
function ThinkingSection({ thinkingContent, messageId }: { thinkingContent: string; messageId: string }) {
  const [isOpen, setIsOpen] = useState(false);

  const handleCopyThinking = () => {
    navigator.clipboard.writeText(thinkingContent);
  };

  return (
    <Collapsible 
      open={isOpen} 
      onOpenChange={setIsOpen}
      className="mb-3"
    >
      <CollapsibleTrigger 
        className="flex items-center gap-2 text-xs text-muted-foreground hover-elevate px-2 py-1 rounded-md w-full"
        data-testid={`button-thinking-toggle-${messageId}`}
      >
        {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <Brain className="h-3 w-3" />
        <span>Thinking Process</span>
      </CollapsibleTrigger>
      <CollapsibleContent 
        className="mt-2 pt-2 border-t"
        data-testid={`section-thinking-${messageId}`}
      >
        <div className="relative">
          <p className="whitespace-pre-wrap text-xs text-muted-foreground leading-relaxed pr-8">
            {thinkingContent}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="absolute top-0 right-0 h-6 w-6 p-0"
            onClick={handleCopyThinking}
            data-testid={`button-copy-thinking-${messageId}`}
          >
            <Copy className="h-3 w-3" />
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function StreamingStatusPill({ activity }: { activity?: string | null }) {
  if (!activity) {
    return null;
  }

  return (
    <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
      <Loader2 className="h-3 w-3 animate-spin" />
      <span>{activity}</span>
    </div>
  );
}

function SourcesPopover({ sources, messageId }: { sources: ParsedSource[]; messageId: string }) {
  if (sources.length === 0) {
    return null;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 border-primary/40 bg-background/80 px-2 text-xs text-primary shadow-sm"
        >
          <BookOpen className="h-3.5 w-3.5" />
          Sources
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-3 p-4" align="end">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sources</div>
        <ul className="space-y-2 text-sm">
          {sources.map((source, index) => (
            <li key={`${messageId}-source-${index}`} className="flex items-start gap-2">
              <span className="mt-0.5 text-xs font-semibold text-muted-foreground">{index + 1}.</span>
              {source.href ? (
                <a
                  href={source.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-1 items-start gap-1 text-primary hover:underline"
                >
                  <span className="flex-1 break-words">{source.label}</span>
                  <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" />
                </a>
              ) : (
                <span className="flex-1 break-words text-muted-foreground">{source.label}</span>
              )}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

const ChatMessages = forwardRef<ChatMessagesHandle, ChatMessagesProps>(({ 
  messages,
  isLoading,
  onCopyMessage,
  onRegenerateResponse,
  className,
  pendingUserMessage,
  streamingAssistantMessage,
  isDarkMode = false,
  streamingActivity,
  bottomOffset = 0,
}, ref) => {
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [viewModes, setViewModes] = useState<Record<string, ViewMode>>({});
  const contentBottomPadding = Math.max(bottomOffset + 48, 160);

  // Fetch user preferences for profile picture
  const { data: userPreferences } = useQuery<{
    personalizationEnabled: boolean;
    customInstructions: string;
    name: string;
    occupation: string;
    bio: string;
    profileImageUrl?: string;
    memories: string[];
    chatHistoryEnabled: boolean;
  }>({
    queryKey: ['/api/user/preferences'],
  });
  const formatTime = (dateString: string | Date | null) => {
    if (!dateString) return '';
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const registerMessageRef = (messageId: string) => (element: HTMLDivElement | null) => {
    if (element) {
      messageRefs.current.set(messageId, element);
    } else {
      messageRefs.current.delete(messageId);
    }
  };

  const getViewMode = (messageId: string): ViewMode => viewModes[messageId] ?? 'formatted';

  const toggleViewMode = (messageId: string) => {
    setViewModes(prev => {
      const current = prev[messageId] ?? 'formatted';
      const next: ViewMode = current === 'formatted' ? 'plain' : 'formatted';
      return { ...prev, [messageId]: next };
    });
  };

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content);
    onCopyMessage(content);
  };

  const getViewport = () => {
    if (!scrollAreaRef.current) {
      return null;
    }
    return scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]') as HTMLDivElement | null;
  };

  const scrollToBottom = (options?: ScrollToOptions) => {
    const viewport = getViewport();
    if (!viewport) {
      return;
    }
    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior: options?.behavior ?? 'smooth',
    });
  };

  const scrollToTop = (options?: ScrollToOptions) => {
    const viewport = getViewport();
    if (!viewport) {
      return;
    }
    viewport.scrollTo({
      top: 0,
      behavior: options?.behavior ?? 'smooth',
    });
  };

  const scrollToMessage = (
    messageId: string,
    options?: { behavior?: ScrollBehavior; block?: ScrollBlockOption },
  ) => {
    const viewport = getViewport();
    if (!viewport) {
      return;
    }
    const target = messageRefs.current.get(messageId);
    if (!target) {
      return;
    }

    const behavior = options?.behavior ?? 'smooth';
    const block = options?.block ?? 'start';

    if (block === 'nearest') {
      target.scrollIntoView({ behavior, block: 'nearest', inline: 'nearest' });
      return;
    }

    const viewportRect = viewport.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const elementTop = targetRect.top - viewportRect.top + viewport.scrollTop;
    const elementHeight = targetRect.height;

    let scrollTop = elementTop;
    if (block === 'center') {
      scrollTop = elementTop - viewport.clientHeight / 2 + elementHeight / 2;
    } else if (block === 'end') {
      scrollTop = elementTop - viewport.clientHeight + elementHeight;
    }

    viewport.scrollTo({
      top: Math.max(0, scrollTop),
      behavior,
    });
  };

  useImperativeHandle(ref, () => ({
    scrollToBottom,
    scrollToTop,
    scrollToMessage,
  }));

  const messageContainerBaseClasses =
    'relative flex-1 min-w-0 w-full max-w-[82vw] sm:max-w-[85vw] md:max-w-3xl rounded-2xl px-3 py-2 sm:px-4 sm:py-3 shadow-sm break-words overflow-hidden';

  const renderAssistantBadges = (metadata: MessageMetadata | undefined, messageId: string) => {
    if (!metadata) {
      return null;
    }

    const executedTools = metadata.executedTools || [];
    const webSearchUsed = executedTools.some(tool => tool.toLowerCase().includes('search'));
    const codeUsed = executedTools.some(tool => tool.toLowerCase().includes('code') || tool === 'python_execute');
    const templateName = metadata.outputTemplateName;
    const templateValidation = metadata.outputTemplateValidation;

    return (
      <>
        {metadata.deepVoyageEnabled && (
          <Badge
            variant="secondary"
            className="text-[10px] px-1.5 py-0 h-4 gap-0.5 bg-indigo-100 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 border-indigo-300 dark:border-indigo-700"
            data-testid={`badge-deep-voyage-${messageId}`}
          >
            <Sparkles className="h-2.5 w-2.5" />
            Deep Voyage
          </Badge>
        )}
        {webSearchUsed && (
          <Badge
            variant="secondary"
            className="text-[10px] px-1.5 py-0 h-4 gap-0.5 bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-300 dark:border-blue-700"
            data-testid={`badge-web-search-${messageId}`}
          >
            <Globe className="h-2.5 w-2.5" />
            Web Search
          </Badge>
        )}
        {codeUsed && (
          <Badge
            variant="secondary"
            className="text-[10px] px-1.5 py-0 h-4 gap-0.5 bg-purple-100 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 border-purple-300 dark:border-purple-700"
            data-testid={`badge-code-execution-${messageId}`}
          >
            <Code className="h-2.5 w-2.5" />
            Code Execution
          </Badge>
        )}
        {templateName && (
          <Badge
            variant={templateValidation?.status === 'fail' ? 'destructive' : 'secondary'}
            className="text-[10px] px-1.5 py-0 h-4 gap-0.5"
            data-testid={`badge-output-template-${messageId}`}
            title={templateValidation?.status === 'fail'
              ? templateValidation.missingSections.length > 0
                ? `Missing sections: ${templateValidation.missingSections.join(', ')}`
                : 'Template requirements not met'
              : 'Template requirements satisfied'}
          >
            {templateValidation?.status === 'fail' ? (
              <AlertCircle className="h-2.5 w-2.5" />
            ) : (
              <CheckCircle2 className="h-2.5 w-2.5" />
            )}
            Template: {templateName}
          </Badge>
        )}
      </>
    );
  };

  const renderMessageSegments = (segments: ContentSegment[], keyPrefix: string, isUser: boolean) => (
    <div className="space-y-3 text-pretty sm:space-y-4">
      {segments.map((segment, index) => {
        const key = `${keyPrefix}-segment-${index}`;
        if (segment.type === 'code') {
          return (
            <CodeBlock
              key={key}
              code={segment.content}
              lang={segment.rawLang ?? segment.lang}
              isDarkMode={isDarkMode}
            />
          );
        }

        const blocks = renderMarkdownBlocks(segment.content, key, isUser);
        if (blocks.length === 0) {
          return (
            <p
              key={key}
              className={cn(
                'm-0 whitespace-pre-wrap break-words text-[14px] leading-6 text-pretty sm:text-[15px] sm:leading-7',
                isUser ? 'text-primary-foreground' : 'text-card-foreground'
              )}
            >
              {segment.content}
            </p>
          );
        }

        return (
          <div key={key} className="space-y-2">
            {blocks}
          </div>
        );
      })}
    </div>
  );

  return (
    <ScrollArea className={cn('flex-1 h-full min-h-0', className)} ref={scrollAreaRef}>
      <div
        className="px-4 pt-6 sm:px-6 lg:px-8"
        style={{ paddingBottom: contentBottomPadding }}
      >
        <div className="mx-auto w-full max-w-4xl space-y-6">
          {messages.length === 0 && !isLoading && !pendingUserMessage && !streamingAssistantMessage && (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <div className="p-4 rounded-full bg-accent mb-4">
                <Bot className="h-8 w-8 text-accent-foreground" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Welcome to Atlas AI</h2>
              <p className="text-muted-foreground max-w-md">
                Start a conversation by typing a message below. I'm here to help with anything you need!
              </p>
            </div>
          )}

          {messages.map((message) => {
            const metadata = message.metadata as MessageMetadata | undefined;
            const templateValidation = metadata?.outputTemplateValidation;
            const { body, sources } = extractSources(message.content);
            const segments = parseMessageContent(body);
            const messageCopy = message.content;
            const isUser = message.role === 'user';
            const viewMode = getViewMode(message.id);

            const userInitials = userPreferences?.name
              ? userPreferences.name
                  .split(' ')
                  .map(part => part[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2)
              : 'U';

            return (
              <div
                key={message.id}
                ref={registerMessageRef(message.id)}
                className={cn(
                  'group flex gap-2 px-2 py-4 sm:gap-4 sm:px-6 sm:py-6',
                  isUser
                    ? 'justify-end sm:ml-6 md:ml-12'
                    : 'justify-start sm:mr-6 md:mr-12'
                )}
                data-testid={`message-${message.id}`}
              >
                {!isUser ? (
                  <Avatar className="hidden sm:flex h-8 w-8 flex-shrink-0">
                    <AvatarFallback className="bg-accent">
                      <Bot className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                ) : (
                  <Avatar className="hidden sm:flex h-8 w-8 flex-shrink-0 order-1">
                    {userPreferences?.profileImageUrl ? (
                      <AvatarImage src={userPreferences.profileImageUrl} alt="User profile" />
                    ) : null}
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                      {userInitials}
                    </AvatarFallback>
                  </Avatar>
                )}

                <div
                  className={cn(
                    messageContainerBaseClasses,
                    isUser
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-card text-card-foreground border'
                  )}
                >
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="font-medium text-xs">
                      {isUser ? 'You' : 'Atlas AI'}
                    </span>
                    <span
                      className={cn(
                        'text-xs opacity-70',
                        isUser ? 'text-primary-foreground' : 'text-muted-foreground'
                      )}
                    >
                      {formatTime(message.createdAt)}
                    </span>
                    {!isUser && renderAssistantBadges(metadata, message.id)}
                  </div>

                  {!isUser && metadata?.thinkingContent ? (
                    <ThinkingSection
                      thinkingContent={metadata.thinkingContent}
                      messageId={message.id}
                    />
                  ) : null}

                  {viewMode === 'formatted' ? (
                    <div className="formatted-response sm:text-base">
                      {renderMessageSegments(segments, message.id, isUser)}

                      {!isUser && sources.length > 0 && (
                        <div className="pt-1">
                          <SourcesPopover sources={sources} messageId={message.id} />
                        </div>
                      )}
                      {!isUser && templateValidation?.status === 'fail' && (
                        <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                          <p className="font-semibold">Template validation failed</p>
                          {templateValidation.missingSections.length > 0 && (
                            <p className="mt-1 text-destructive/80">
                              Missing sections: {templateValidation.missingSections.join(', ')}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <pre
                        className={cn(
                          'max-h-[60vh] overflow-x-auto whitespace-pre-wrap rounded-lg border border-border/60 bg-muted/40 p-4 text-[13px] leading-6 text-pretty font-mono',
                          isUser ? 'text-primary-foreground' : 'text-card-foreground'
                        )}
                      >
                        {messageCopy}
                      </pre>

                      {!isUser && sources.length > 0 && (
                        <div className="pt-1">
                          <SourcesPopover sources={sources} messageId={message.id} />
                        </div>
                      )}
                      {!isUser && templateValidation?.status === 'fail' && (
                        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                          <p className="font-semibold">Template validation failed</p>
                          {templateValidation.missingSections.length > 0 && (
                            <p className="mt-1 text-destructive/80">
                              Missing sections: {templateValidation.missingSections.join(', ')}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn(
                        'h-7 px-2 bg-background/80 backdrop-blur-sm border shadow-sm text-xs font-medium',
                        isUser && 'text-foreground'
                      )}
                      onClick={() => toggleViewMode(message.id)}
                      data-testid={`button-toggle-view-${message.id}`}
                    >
                      {viewMode === 'formatted' ? 'Plain Text' : 'Formatted'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn(
                        'h-7 px-2 bg-background/80 backdrop-blur-sm border shadow-sm',
                        isUser && 'text-foreground'
                      )}
                      onClick={() => handleCopy(messageCopy)}
                      data-testid={`button-copy-${message.id}`}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>

                    {!isUser && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 bg-background/80 backdrop-blur-sm border shadow-sm"
                          onClick={() => onRegenerateResponse(message.id)}
                          data-testid={`button-regenerate-${message.id}`}
                        >
                          <RotateCcw className="h-3 w-3" />
                        </Button>
                        <MessageReactionButtons messageId={message.id} />
                      </>
                    )}
                  </div>
                </div>

                {isUser && (
                  <Avatar className="h-8 w-8 flex-shrink-0">
                    <AvatarImage src="" alt="User" />
                    <AvatarFallback>
                      <User className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            );
          })}

          {pendingUserMessage && (
            <div
              key={pendingUserMessage.id}
              ref={registerMessageRef(pendingUserMessage.id)}
              className="group flex gap-2 px-2 py-4 sm:px-6 sm:gap-4 sm:py-6 justify-end"
              data-testid={`message-${pendingUserMessage.id}`}
            >
              <div className={cn(messageContainerBaseClasses, 'bg-primary text-primary-foreground opacity-80')}>
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className="font-medium text-xs">You</span>
                  <span className="text-xs opacity-70 text-primary-foreground">{formatTime(new Date())}</span>
                </div>
                <div className="formatted-response sm:text-base">
                  {renderMessageSegments(parseMessageContent(pendingUserMessage.content || ''), pendingUserMessage.id, true)}
                </div>
              </div>
              <Avatar className="h-8 w-8 flex-shrink-0">
                <AvatarImage src="" alt="User" />
                <AvatarFallback>
                  <User className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
            </div>
          )}

          {streamingAssistantMessage && (
            <div
              key={streamingAssistantMessage.id}
              ref={registerMessageRef(streamingAssistantMessage.id)}
              className="group flex gap-2 px-2 py-4 sm:px-6 sm:gap-4 sm:py-6 justify-start"
              data-testid={`message-${streamingAssistantMessage.id}`}
            >
              <Avatar className="hidden sm:flex h-8 w-8 flex-shrink-0">
                <AvatarFallback className="bg-accent">
                  <Bot className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>

              <div className={cn(messageContainerBaseClasses, 'bg-card text-card-foreground border')}>
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className="font-medium text-xs">Atlas AI</span>
                  <span className="text-xs opacity-70 text-muted-foreground">{formatTime(new Date())}</span>
                  {renderAssistantBadges(streamingAssistantMessage.metadata, streamingAssistantMessage.id)}
                </div>

                {(() => {
                  const streamingViewMode = getViewMode(streamingAssistantMessage.id);
                  const fallbackSegments: ContentSegment[] = [
                    { type: 'text', content: '...' },
                  ];
                  const segmentsToRender =
                    streamingAssistantMessage.segments.length > 0
                      ? streamingAssistantMessage.segments
                      : fallbackSegments;
                  const streamingTemplateValidation = streamingAssistantMessage.metadata?.outputTemplateValidation;

                  return (
                    <>
                      {streamingViewMode === 'formatted' ? (
                        <div className="formatted-response sm:text-base">
                          <StreamingStatusPill activity={streamingActivity} />
                          {renderMessageSegments(segmentsToRender, streamingAssistantMessage.id, false)}
                          {streamingTemplateValidation?.status === 'fail' && (
                            <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                              <p className="font-semibold">Template validation failed</p>
                              {streamingTemplateValidation.missingSections.length > 0 && (
                                <p className="mt-1 text-destructive/80">
                                  Missing sections: {streamingTemplateValidation.missingSections.join(', ')}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <StreamingStatusPill activity={streamingActivity} />
                          <pre className="max-h-[60vh] overflow-x-auto whitespace-pre-wrap rounded-lg border border-border/60 bg-muted/40 p-4 text-[13px] leading-6 text-pretty font-mono">
                            {segmentsToString(segmentsToRender)}
                          </pre>
                          {streamingTemplateValidation?.status === 'fail' && (
                            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                              <p className="font-semibold">Template validation failed</p>
                              {streamingTemplateValidation.missingSections.length > 0 && (
                                <p className="mt-1 text-destructive/80">
                                  Missing sections: {streamingTemplateValidation.missingSections.join(', ')}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="mt-4 flex flex-wrap items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 bg-background/80 backdrop-blur-sm border shadow-sm text-xs font-medium"
                          onClick={() => toggleViewMode(streamingAssistantMessage.id)}
                          data-testid={`button-toggle-view-${streamingAssistantMessage.id}`}
                        >
                          {streamingViewMode === 'formatted' ? 'Plain Text' : 'Formatted'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 bg-background/80 backdrop-blur-sm border shadow-sm"
                          onClick={() => handleCopy(segmentsToString(streamingAssistantMessage.segments))}
                          data-testid={`button-copy-${streamingAssistantMessage.id}`}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Loading indicator */}
          {isLoading && !streamingAssistantMessage && (
            <div className="group flex gap-2 px-2 py-4 sm:px-6 sm:gap-4 sm:py-6 justify-start">
              <Avatar className="hidden sm:flex h-8 w-8 flex-shrink-0">
                <AvatarFallback className="bg-accent">
                  <Bot className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>

              <div className={cn(messageContainerBaseClasses, 'bg-card text-card-foreground border')}>
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className="font-medium text-xs">Atlas AI</span>
                  <span className="text-xs opacity-70 text-muted-foreground">{streamingActivity ?? 'Preparing a response...'}</span>
                </div>
                <StreamingStatusPill activity={streamingActivity} />
                <div className="mt-3 flex items-center gap-1">
                  <div className="h-2 w-2 animate-bounce rounded-full bg-primary" style={{ animationDelay: '0ms' }} />
                  <div className="h-2 w-2 animate-bounce rounded-full bg-primary" style={{ animationDelay: '150ms' }} />
                  <div className="h-2 w-2 animate-bounce rounded-full bg-primary" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  );
});

ChatMessages.displayName = 'ChatMessages';

export { ChatMessages };