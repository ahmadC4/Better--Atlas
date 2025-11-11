const KEYWORD_SETS: Record<string, ReadonlySet<string>> = {
  typescript: new Set([
    'abstract','any','as','asserts','async','await','boolean','break','case','catch','class','const','continue','debugger','default','delete','do','else','enum','export','extends','false','finally','for','from','function','get','if','implements','import','in','infer','instanceof','interface','is','keyof','let','module','namespace','new','null','number','object','override','package','private','protected','public','readonly','require','return','satisfies','set','static','string','super','switch','symbol','this','throw','true','try','type','typeof','undefined','unique','unknown','using','var','void','while','with','yield'
  ]),
  javascript: new Set([
    'async','await','break','case','catch','class','const','continue','debugger','default','delete','do','else','export','extends','false','finally','for','function','if','import','in','instanceof','let','new','null','return','super','switch','this','throw','true','try','typeof','var','void','while','with','yield'
  ]),
  python: new Set([
    'and','as','assert','async','await','break','class','continue','def','del','elif','else','except','False','finally','for','from','global','if','import','in','is','lambda','None','nonlocal','not','or','pass','raise','return','True','try','while','with','yield'
  ]),
  bash: new Set([
    'alias','bg','break','case','command','continue','do','done','elif','else','esac','eval','exec','exit','export','false','fi','for','function','getopts','if','in','local','read','readonly','return','select','set','shift','then','time','trap','true','typeset','ulimit','umask','unset','until','while'
  ]),
  powershell: new Set([
    'begin','break','catch','class','continue','data','default','do','dynamicparam','else','elseif','end','enum','exit','filter','finally','for','foreach','from','function','if','in','param','process','return','switch','throw','trap','try','until','using','var','while'
  ]),
  sql: new Set([
    'select','insert','update','delete','from','where','and','or','inner','left','right','join','on','group','by','order','limit','values','into','create','table','primary','key','foreign','references','not','null','constraint','drop','alter','add','unique','default','case','when','then','else','end','as','distinct','having','exists'
  ]),
  go: new Set([
    'break','case','chan','const','continue','default','defer','else','fallthrough','for','func','go','goto','if','import','interface','map','package','range','return','select','struct','switch','type','var'
  ]),
  rust: new Set([
    'as','async','await','break','const','continue','crate','dyn','else','enum','extern','false','fn','for','if','impl','in','let','loop','match','mod','move','mut','pub','ref','return','self','Self','static','struct','super','trait','true','type','unsafe','use','where','while'
  ]),
  java: new Set([
    'abstract','assert','boolean','break','byte','case','catch','char','class','const','continue','default','do','double','else','enum','extends','final','finally','float','for','goto','if','implements','import','instanceof','int','interface','long','native','new','package','private','protected','public','return','short','static','strictfp','super','switch','synchronized','this','throw','throws','transient','try','void','volatile','while'
  ]),
  c: new Set([
    'auto','break','case','char','const','continue','default','do','double','else','enum','extern','float','for','goto','if','inline','int','long','register','restrict','return','short','signed','sizeof','static','struct','switch','typedef','union','unsigned','void','volatile','while'
  ]),
  cpp: new Set([
    'alignas','alignof','and','and_eq','asm','auto','bitand','bitor','bool','break','case','catch','char','char16_t','char32_t','class','compl','const','constexpr','const_cast','continue','decltype','default','delete','do','double','dynamic_cast','else','enum','explicit','export','extern','false','float','for','friend','goto','if','inline','int','long','mutable','namespace','new','noexcept','not','not_eq','nullptr','operator','or','or_eq','private','protected','public','register','reinterpret_cast','return','short','signed','sizeof','static','static_cast','struct','switch','template','this','thread_local','throw','true','try','typedef','typeid','typename','union','unsigned','using','virtual','void','volatile','wchar_t','while','xor','xor_eq'
  ]),
  csharp: new Set([
    'abstract','as','base','bool','break','byte','case','catch','char','checked','class','const','continue','decimal','default','delegate','do','double','else','enum','event','explicit','extern','false','finally','fixed','float','for','foreach','goto','if','implicit','in','int','interface','internal','is','lock','long','namespace','new','null','object','operator','out','override','params','private','protected','public','readonly','ref','return','sbyte','sealed','short','sizeof','stackalloc','static','string','struct','switch','this','throw','true','try','typeof','uint','ulong','unchecked','unsafe','ushort','using','virtual','void','volatile','while'
  ]),
  swift: new Set([
    'as','associatedtype','break','case','catch','class','continue','default','defer','deinit','do','else','enum','extension','fallthrough','false','fileprivate','for','func','guard','if','import','in','init','inout','internal','is','let','nil','operator','private','protocol','public','repeat','return','self','static','struct','subscript','super','switch','throw','throws','true','try','typealias','var','where','while'
  ]),
  kotlin: new Set([
    'abstract','actual','annotation','as','break','by','catch','class','companion','const','constructor','continue','crossinline','data','do','else','enum','expect','external','false','final','finally','for','fun','if','import','in','infix','init','inline','inner','interface','internal','is','lateinit','noinline','null','object','open','operator','out','override','package','private','protected','public','reified','return','sealed','super','suspend','tailrec','this','throw','true','try','typealias','val','var','vararg','when','where','while'
  ]),
  php: new Set([
    'abstract','and','array','as','break','callable','case','catch','class','clone','const','continue','declare','default','die','do','echo','else','elseif','empty','enddeclare','endfor','endforeach','endif','endswitch','endwhile','eval','exit','extends','final','finally','for','foreach','function','global','goto','if','implements','include','include_once','instanceof','insteadof','interface','isset','list','namespace','new','or','print','private','protected','public','require','require_once','return','static','switch','throw','trait','try','unset','use','var','while','xor','yield'
  ]),
  ruby: new Set([
    'BEGIN','END','__ENCODING__','__END__','__FILE__','__LINE__','alias','and','begin','break','case','class','def','defined?','do','else','elsif','end','ensure','false','for','if','in','module','next','nil','not','or','redo','rescue','retry','return','self','super','then','true','undef','unless','until','when','while','yield'
  ]),
  scala: new Set([
    'abstract','case','catch','class','def','do','else','extends','false','final','finally','for','forSome','if','implicit','import','lazy','match','new','null','object','override','package','private','protected','return','sealed','super','this','throw','trait','true','try','type','val','var','while','with','yield'
  ]),
  sqlpl: new Set(),
  yaml: new Set(['true','false','null','yes','no','on','off']),
  json: new Set(),
  markdown: new Set(),
  plaintext: new Set(),
};

const BOOLEAN_LITERALS: Record<string, ReadonlySet<string>> = {
  typescript: new Set(['true','false','null','undefined']),
  javascript: new Set(['true','false','null','undefined']),
  python: new Set(['True','False','None']),
  bash: new Set(['true','false']),
  powershell: new Set(['$true','$false','true','false','null']),
  sql: new Set(['true','false','null']),
  go: new Set(['true','false','iota']),
  rust: new Set(['true','false']),
  java: new Set(['true','false','null']),
  c: new Set(['true','false','NULL']),
  cpp: new Set(['true','false','NULL']),
  csharp: new Set(['true','false','null']),
  swift: new Set(['true','false','nil']),
  kotlin: new Set(['true','false','null']),
  php: new Set(['true','false','null']),
  ruby: new Set(['true','false','nil']),
  scala: new Set(['true','false','null']),
  yaml: new Set(['true','false','null','yes','no','on','off']),
  json: new Set(['true','false','null']),
  markdown: new Set(),
  plaintext: new Set(),
};

export type HighlightTokenType =
  | 'keyword'
  | 'string'
  | 'number'
  | 'comment'
  | 'boolean'
  | 'punctuation'
  | 'plain';

interface HighlightToken {
  type: HighlightTokenType;
  value: string;
}

interface LanguageConfig {
  keywords: ReadonlySet<string>;
  booleans: ReadonlySet<string>;
  lineComments?: string[];
  blockComments?: Array<[string, string]>;
  allowTemplateStrings?: boolean;
  tripleQuoteStrings?: boolean;
}

const PUNCTUATION_CHARS = new Set('{}[]().,:;+-*/%<>=!&|^~?');

const DEFAULT_CONFIG: LanguageConfig = {
  keywords: KEYWORD_SETS.plaintext,
  booleans: BOOLEAN_LITERALS.plaintext,
};

const LANGUAGE_CONFIGS: Record<string, LanguageConfig> = {
  typescript: {
    keywords: KEYWORD_SETS.typescript,
    booleans: BOOLEAN_LITERALS.typescript,
    lineComments: ['//'],
    blockComments: [['/*', '*/']],
    allowTemplateStrings: true,
  },
  javascript: {
    keywords: KEYWORD_SETS.javascript,
    booleans: BOOLEAN_LITERALS.javascript,
    lineComments: ['//'],
    blockComments: [['/*', '*/']],
    allowTemplateStrings: true,
  },
  tsx: {
    keywords: KEYWORD_SETS.typescript,
    booleans: BOOLEAN_LITERALS.typescript,
    lineComments: ['//'],
    blockComments: [['/*', '*/']],
    allowTemplateStrings: true,
  },
  jsx: {
    keywords: KEYWORD_SETS.javascript,
    booleans: BOOLEAN_LITERALS.javascript,
    lineComments: ['//'],
    blockComments: [['/*', '*/']],
    allowTemplateStrings: true,
  },
  python: {
    keywords: KEYWORD_SETS.python,
    booleans: BOOLEAN_LITERALS.python,
    lineComments: ['#'],
    tripleQuoteStrings: true,
  },
  bash: {
    keywords: KEYWORD_SETS.bash,
    booleans: BOOLEAN_LITERALS.bash,
    lineComments: ['#'],
  },
  powershell: {
    keywords: KEYWORD_SETS.powershell,
    booleans: BOOLEAN_LITERALS.powershell,
    lineComments: ['#'],
  },
  sh: {
    keywords: KEYWORD_SETS.bash,
    booleans: BOOLEAN_LITERALS.bash,
    lineComments: ['#'],
  },
  shell: {
    keywords: KEYWORD_SETS.bash,
    booleans: BOOLEAN_LITERALS.bash,
    lineComments: ['#'],
  },
  sql: {
    keywords: KEYWORD_SETS.sql,
    booleans: BOOLEAN_LITERALS.sql,
    lineComments: ['--'],
    blockComments: [['/*', '*/']],
  },
  go: {
    keywords: KEYWORD_SETS.go,
    booleans: BOOLEAN_LITERALS.go,
    lineComments: ['//'],
    blockComments: [['/*', '*/']],
  },
  rust: {
    keywords: KEYWORD_SETS.rust,
    booleans: BOOLEAN_LITERALS.rust,
    lineComments: ['//'],
    blockComments: [['/*', '*/']],
  },
  java: {
    keywords: KEYWORD_SETS.java,
    booleans: BOOLEAN_LITERALS.java,
    lineComments: ['//'],
    blockComments: [['/*', '*/']],
  },
  c: {
    keywords: KEYWORD_SETS.c,
    booleans: BOOLEAN_LITERALS.c,
    lineComments: ['//'],
    blockComments: [['/*', '*/']],
  },
  cpp: {
    keywords: KEYWORD_SETS.cpp,
    booleans: BOOLEAN_LITERALS.cpp,
    lineComments: ['//'],
    blockComments: [['/*', '*/']],
  },
  csharp: {
    keywords: KEYWORD_SETS.csharp,
    booleans: BOOLEAN_LITERALS.csharp,
    lineComments: ['//'],
    blockComments: [['/*', '*/']],
  },
  swift: {
    keywords: KEYWORD_SETS.swift,
    booleans: BOOLEAN_LITERALS.swift,
    lineComments: ['//'],
    blockComments: [['/*', '*/']],
  },
  kotlin: {
    keywords: KEYWORD_SETS.kotlin,
    booleans: BOOLEAN_LITERALS.kotlin,
    lineComments: ['//'],
    blockComments: [['/*', '*/']],
  },
  php: {
    keywords: KEYWORD_SETS.php,
    booleans: BOOLEAN_LITERALS.php,
    lineComments: ['//', '#'],
    blockComments: [['/*', '*/']],
  },
  ruby: {
    keywords: KEYWORD_SETS.ruby,
    booleans: BOOLEAN_LITERALS.ruby,
    lineComments: ['#'],
  },
  scala: {
    keywords: KEYWORD_SETS.scala,
    booleans: BOOLEAN_LITERALS.scala,
    lineComments: ['//'],
    blockComments: [['/*', '*/']],
  },
  yaml: {
    keywords: KEYWORD_SETS.yaml,
    booleans: BOOLEAN_LITERALS.yaml,
    lineComments: ['#'],
  },
  json: {
    keywords: KEYWORD_SETS.json,
    booleans: BOOLEAN_LITERALS.json,
  },
  markdown: {
    keywords: KEYWORD_SETS.markdown,
    booleans: BOOLEAN_LITERALS.markdown,
  },
  plaintext: DEFAULT_CONFIG,
};

const LANGUAGE_LABELS: Record<string, string> = {
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  tsx: 'TSX',
  jsx: 'JSX',
  python: 'Python',
  bash: 'Bash',
  sh: 'Shell',
  shell: 'Shell',
  powershell: 'PowerShell',
  sql: 'SQL',
  go: 'Go',
  rust: 'Rust',
  java: 'Java',
  c: 'C',
  cpp: 'C++',
  csharp: 'C#',
  swift: 'Swift',
  kotlin: 'Kotlin',
  php: 'PHP',
  ruby: 'Ruby',
  scala: 'Scala',
  yaml: 'YAML',
  json: 'JSON',
  markdown: 'Markdown',
  plaintext: 'Plain Text',
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeLanguage(raw?: string): string {
  if (!raw) {
    return 'plaintext';
  }
  const token = raw.trim().toLowerCase();
  if (!token) {
    return 'plaintext';
  }
  switch (token) {
    case 'ts':
      return 'typescript';
    case 'tsx':
      return 'tsx';
    case 'js':
      return 'javascript';
    case 'jsx':
      return 'jsx';
    case 'py':
      return 'python';
    case 'shell':
    case 'bash':
    case 'sh':
      return 'bash';
    case 'ps1':
      return 'powershell';
    case 'c#':
    case 'cs':
      return 'csharp';
    case 'c++':
      return 'cpp';
    case 'yml':
      return 'yaml';
    case 'md':
      return 'markdown';
    case 'plaintext':
    case 'text':
    case 'txt':
      return 'plaintext';
    default:
      if (LANGUAGE_CONFIGS[token]) {
        return token;
      }
      return 'plaintext';
  }
}

function isIdentifierStart(char: string): boolean {
  return /[A-Za-z_$]/.test(char);
}

function isIdentifierPart(char: string): boolean {
  return /[A-Za-z0-9_$]/.test(char);
}

function isDigit(char: string): boolean {
  return /[0-9]/.test(char);
}

function tokenize(code: string, lang: string): HighlightToken[] {
  const config = LANGUAGE_CONFIGS[lang] ?? DEFAULT_CONFIG;
  const tokens: HighlightToken[] = [];
  const length = code.length;
  let index = 0;

  const pushToken = (type: HighlightTokenType, value: string) => {
    if (value.length === 0) return;
    tokens.push({ type, value });
  };

  outer: while (index < length) {
    const char = code[index];

    if (char === '\n') {
      pushToken('plain', '\n');
      index += 1;
      continue;
    }

    if (char === '\r') {
      if (code[index + 1] === '\n') {
        pushToken('plain', '\r\n');
        index += 2;
      } else {
        pushToken('plain', '\r');
        index += 1;
      }
      continue;
    }

    if (char === ' ' || char === '\t') {
      let end = index + 1;
      while (end < length && (code[end] === ' ' || code[end] === '\t')) {
        end += 1;
      }
      pushToken('plain', code.slice(index, end));
      index = end;
      continue;
    }

    if (config.lineComments) {
      for (const prefix of config.lineComments) {
        if (prefix && code.startsWith(prefix, index)) {
          let end = index + prefix.length;
          while (end < length && code[end] !== '\n' && code[end] !== '\r') {
            end += 1;
          }
          pushToken('comment', code.slice(index, end));
          index = end;
          continue outer;
        }
      }
    }

    if (config.blockComments) {
      for (const [start, endDelimiter] of config.blockComments) {
        if (code.startsWith(start, index)) {
          let end = index + start.length;
          while (end < length && !code.startsWith(endDelimiter, end)) {
            end += 1;
          }
          if (end < length) {
            end += endDelimiter.length;
          }
          pushToken('comment', code.slice(index, end));
          index = end;
          continue outer;
        }
      }
    }

    if (config.tripleQuoteStrings && index + 2 < length) {
      const triple = code.slice(index, index + 3);
      if (triple === "'''" || triple === '"""') {
        let end = index + 3;
        while (end < length && !code.startsWith(triple, end)) {
          end += 1;
        }
        if (end < length) {
          end += 3;
        }
        pushToken('string', code.slice(index, end));
        index = end;
        continue;
      }
    }

    if (char === '"' || char === '\'' || (char === '`' && config.allowTemplateStrings)) {
      const delimiter = char;
      let end = index + 1;
      let escaped = false;

      while (end < length) {
        const current = code[end];
        end += 1;
        if (escaped) {
          escaped = false;
          continue;
        }
        if (current === '\\') {
          escaped = true;
          continue;
        }
        if (current === delimiter) {
          break;
        }
      }

      pushToken('string', code.slice(index, end));
      index = end;
      continue;
    }

    if (isDigit(char) || (char === '.' && isDigit(code[index + 1] ?? ''))) {
      let end = index + 1;

      if (char === '0' && (code[index + 1] === 'x' || code[index + 1] === 'X')) {
        end += 1;
        while (end < length && /[0-9a-fA-F]/.test(code[end])) {
          end += 1;
        }
      } else {
        while (end < length && /[0-9_]/.test(code[end])) {
          end += 1;
        }
        if (code[end] === '.' && /[0-9]/.test(code[end + 1] ?? '')) {
          end += 1;
          while (end < length && /[0-9_]/.test(code[end])) {
            end += 1;
          }
        }
        if (code[end] && (code[end] === 'e' || code[end] === 'E')) {
          let expIndex = end + 1;
          if (code[expIndex] === '+' || code[expIndex] === '-') {
            expIndex += 1;
          }
          if (isDigit(code[expIndex] ?? '')) {
            end = expIndex + 1;
            while (end < length && /[0-9]/.test(code[end])) {
              end += 1;
            }
          }
        }
      }

      pushToken('number', code.slice(index, end));
      index = end;
      continue;
    }

    if (isIdentifierStart(char)) {
      let end = index + 1;
      while (end < length && isIdentifierPart(code[end])) {
        end += 1;
      }
      const value = code.slice(index, end);
      const keywordSet = config.keywords;
      const booleanSet = config.booleans;
      if (keywordSet.has(value) || keywordSet.has(value.toLowerCase())) {
        pushToken('keyword', value);
      } else if (booleanSet.has(value) || booleanSet.has(value.toLowerCase())) {
        pushToken('boolean', value);
      } else {
        pushToken('plain', value);
      }
      index = end;
      continue;
    }

    if (PUNCTUATION_CHARS.has(char)) {
      let end = index + 1;
      while (end < length && PUNCTUATION_CHARS.has(code[end])) {
        end += 1;
      }
      pushToken('punctuation', code.slice(index, end));
      index = end;
      continue;
    }

    pushToken('plain', char);
    index += 1;
  }

  return tokens;
}

export interface HighlightResult {
  html: string;
  languageId: string;
  label: string;
}

export function highlightCode(code: string, rawLanguage?: string): HighlightResult {
  const languageId = normalizeLanguage(rawLanguage);
  const tokens = tokenize(code, languageId);
  const html = tokens
    .map((token) => {
      const escaped = escapeHtml(token.value);
      switch (token.type) {
        case 'keyword':
          return `<span class="atlas-codebox__token atlas-codebox__token--keyword">${escaped}</span>`;
        case 'string':
          return `<span class="atlas-codebox__token atlas-codebox__token--string">${escaped}</span>`;
        case 'number':
          return `<span class="atlas-codebox__token atlas-codebox__token--number">${escaped}</span>`;
        case 'comment':
          return `<span class="atlas-codebox__token atlas-codebox__token--comment">${escaped}</span>`;
        case 'boolean':
          return `<span class="atlas-codebox__token atlas-codebox__token--boolean">${escaped}</span>`;
        case 'punctuation':
          return `<span class="atlas-codebox__token atlas-codebox__token--punctuation">${escaped}</span>`;
        default:
          return escaped;
      }
    })
    .join('');

  const label = LANGUAGE_LABELS[languageId] ?? (rawLanguage?.trim() || 'code');

  return {
    html,
    languageId,
    label,
  };
}
