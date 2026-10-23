/**
 * Custom MCP Test Data Generator for TodoMVC
 *
 * Implements pure deterministic logic to generate synthetic Todo datasets
 * for parameterized, data-driven tests and MCP JSON-RPC tool consumption.
 * Strictly typed with full zero-timeout & AGENTS.md compliance.
 */

export type TodoState = 'active' | 'completed' | 'mixed';

export type TodoCategory = 'standard' | 'unicode' | 'boundary_long' | 'special_symbols';

export interface GenerateTodoDatasetParams {
  count: number;
  includeSpecialChars: boolean;
  state: TodoState;
}

export interface TodoItem {
  id: string;
  title: string;
  completed: boolean;
  category: TodoCategory;
  createdAt: string;
}

export interface TodoDatasetMetadata {
  totalCount: number;
  activeCount: number;
  completedCount: number;
  hasSpecialChars: boolean;
  stateRequested: TodoState;
  generatedAt: string;
}

export interface TodoDatasetResult {
  items: TodoItem[];
  metadata: TodoDatasetMetadata;
}

export interface BoundaryTestCase {
  name: string;
  input: string;
  expectedTitle: string;
  expectedOutcome: 'rejected' | 'created';
  category: 'empty' | 'whitespace' | 'trimming' | 'unicode' | 'extreme_length';
}

/** Pre-curated pool of standard todo task descriptions */
const STANDARD_TITLES: readonly string[] = [
  'Review Playwright POM architecture and fixtures',
  'Implement Spec-Driven Development feature contract',
  'Configure MCP server tools and schema definitions',
  'Execute regression suite with zero timeouts',
  'Validate auto-waiting on dynamic locators',
  'Refactor state machine transition verifications',
  'Verify items left counter under filter transitions',
  'Audit network route interception for offline state',
  'Inspect DOM accessibility roles with Playwright MCP',
  'Validate toggle-all bulk completion invariants',
  'Sanitize test logs and remove any sensitive tokens',
  'Prepare Tier 2 assessment pull request and summary',
];

/** Curated pool of boundary, Unicode, and edge-case items */
const SPECIAL_CHAR_ITEMS: readonly { title: string; category: TodoCategory }[] = [
  {
    title: '🚀 Ship release v2.0 with zero flakiness',
    category: 'unicode',
  },
  {
    title: '✨ Polish UI micro-interactions & CSS transitions',
    category: 'unicode',
  },
  {
    title: '🛒 Supermarché: acheter du café, thé & pain frais',
    category: 'unicode',
  },
  {
    title: '🔥 Fix critical race condition in async worker',
    category: 'unicode',
  },
  {
    title: '🌟 Tarea con tildes y eñes: canción, pingüino, caña',
    category: 'unicode',
  },
  {
    title: '📝 待办事项: 运行自动化测试套件',
    category: 'unicode',
  },
  {
    title: '⚡ مهمة تجريبية باللغة العربية مع اتجاه النص من اليمين لليسار',
    category: 'unicode',
  },
  {
    title: "🔒 Security: <script>alert('xss-prevention')</script> & DROP TABLE todos; --",
    category: 'special_symbols',
  },
  {
    title: '🧮 Math & Symbols: ∑(x_i) = 100% | 42 ≠ 0 & [{(test)}]',
    category: 'special_symbols',
  },
  {
    title:
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit. [Length-260]',
    category: 'boundary_long',
  },
  {
    title: `Boundary 255 chars: ${'A'.repeat(225)} [END-255]`,
    category: 'boundary_long',
  },
];

/**
 * Validates input parameters for dataset generation.
 * @throws Error if parameters violate contract.
 */
export function validateParams(params: GenerateTodoDatasetParams): void {
  if (!params || typeof params !== 'object') {
    throw new Error('GenerateTodoDatasetParams must be a non-null object.');
  }

  if (typeof params.count !== 'number' || !Number.isInteger(params.count) || params.count < 1) {
    throw new Error(`Invalid 'count' parameter: ${params.count}. Must be an integer greater than or equal to 1.`);
  }

  if (typeof params.includeSpecialChars !== 'boolean') {
    throw new Error(
      `Invalid 'includeSpecialChars' parameter: ${String(params.includeSpecialChars)}. Must be a boolean.`
    );
  }

  const validStates: TodoState[] = ['active', 'completed', 'mixed'];
  if (!validStates.includes(params.state)) {
    throw new Error(
      `Invalid 'state' parameter: "${params.state}". Expected one of: ${validStates.join(', ')}.`
    );
  }
}

/**
 * Determines completion status based on requested state distribution.
 */
function resolveCompletionState(state: TodoState, index: number, total: number): boolean {
  switch (state) {
    case 'completed':
      return true;
    case 'active':
      return false;
    case 'mixed':
      // Alternates state: even index is active, odd index is completed
      // Guaranteeing at least 1 active and 1 completed when total >= 2
      return index % 2 === 1;
    default:
      return false;
  }
}

/**
 * Core pure function to generate a typed array of TodoItems for data-driven testing.
 *
 * @param params Generation options (count, includeSpecialChars, state)
 * @returns Typed array of TodoItem objects
 */
export function generateTodoDataset(params: GenerateTodoDatasetParams): TodoItem[] {
  validateParams(params);

  const items: TodoItem[] = [];
  const baseTimestamp = new Date('2026-10-23T11:00:00.000Z');

  for (let i = 0; i < params.count; i++) {
    const id = `todo-${String(i + 1).padStart(3, '0')}`;
    const completed = resolveCompletionState(params.state, i, params.count);

    let title: string;
    let category: TodoCategory;

    if (params.includeSpecialChars && i % 2 === 1) {
      const specialIndex = Math.floor(i / 2) % SPECIAL_CHAR_ITEMS.length;
      const special = SPECIAL_CHAR_ITEMS[specialIndex];
      title = special.title;
      category = special.category;
    } else {
      const standardIndex = i % STANDARD_TITLES.length;
      title = `${STANDARD_TITLES[standardIndex]} #${i + 1}`;
      category = 'standard';
    }

    const itemTimestamp = new Date(baseTimestamp.getTime() + i * 60000).toISOString();

    items.push({
      id,
      title,
      completed,
      category,
      createdAt: itemTimestamp,
    });
  }

  return items;
}

/**
 * Generates todo dataset with attached statistical metadata.
 */
export function generateTodoDatasetWithMetadata(params: GenerateTodoDatasetParams): TodoDatasetResult {
  const items = generateTodoDataset(params);
  const completedCount = items.filter((item) => item.completed).length;
  const activeCount = items.length - completedCount;

  return {
    items,
    metadata: {
      totalCount: items.length,
      activeCount,
      completedCount,
      hasSpecialChars: params.includeSpecialChars,
      stateRequested: params.state,
      generatedAt: new Date().toISOString(),
    },
  };
}

/**
 * Returns canonical boundary test cases for negative & edge testing.
 */
export function getBoundaryTestCases(): readonly BoundaryTestCase[] {
  return [
    {
      name: 'Empty string submission',
      input: '',
      expectedTitle: '',
      expectedOutcome: 'rejected',
      category: 'empty',
    },
    {
      name: 'Spaces only whitespace submission',
      input: '     ',
      expectedTitle: '',
      expectedOutcome: 'rejected',
      category: 'whitespace',
    },
    {
      name: 'Tab and newline whitespace submission',
      input: '\t  \n  ',
      expectedTitle: '',
      expectedOutcome: 'rejected',
      category: 'whitespace',
    },
    {
      name: 'Leading and trailing spaces trimming',
      input: '   Trimmed Todo Item   ',
      expectedTitle: 'Trimmed Todo Item',
      expectedOutcome: 'created',
      category: 'trimming',
    },
    {
      name: 'Multi-byte Unicode & emojis',
      input: '🚀 UTF-8 Test: áéíóú ñ Ñ ç ü | 待办事项 | مهمة',
      expectedTitle: '🚀 UTF-8 Test: áéíóú ñ Ñ ç ü | 待办事项 | مهمة',
      expectedOutcome: 'created',
      category: 'unicode',
    },
    {
      name: 'Extreme length string (> 250 characters)',
      input:
        'A'.repeat(260),
      expectedTitle: 'A'.repeat(260),
      expectedOutcome: 'created',
      category: 'extreme_length',
    },
  ];
}

/**
 * MCP JSON-RPC tool execution handler.
 * Can be plugged directly into an MCP Server router.
 */
export async function handleGenerateTodoDatasetMcp(
  rawArgs: unknown
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  try {
    const args = rawArgs as Record<string, unknown>;
    const params: GenerateTodoDatasetParams = {
      count: Number(args.count ?? 5),
      includeSpecialChars: Boolean(args.includeSpecialChars ?? false),
      state: (args.state as TodoState) ?? 'active',
    };

    const result = generateTodoDatasetWithMetadata(params);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: message }, null, 2),
        },
      ],
    };
  }
}
