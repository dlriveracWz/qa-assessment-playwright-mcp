/**
 * Security & Data Governance Sanitizer
 *
 * Tier 3 Enterprise Feature:
 * Provides pure, strongly typed functions and utilities to sanitize text,
 * DOM snapshots, console logs, network traces, and stack traces before
 * transmitting them to external AI endpoints, LLMs, or MCP clients.
 *
 * Adheres strictly to AGENTS.md Data Governance and Security guidelines:
 * - Emails replaced by [MASKED_EMAIL]
 * - Credit Cards / PANs validated via Luhn algorithm replaced by [MASKED_CARD]
 * - Tokens, Keys, JWTs, Bearer headers, Passwords replaced by [MASKED_SECRET]
 * - Prompt Injections defused and replaced by [DEFUSED_INJECTION]
 * - Zero unmasked secrets or PII reach external AI APIs
 */

export interface SanitizationResult {
  sanitizedText: string;
  scrubbedCount: number;
  redactionSummary: Record<string, number>;
}

// ---------------------------------------------------------------------------
// 1. Email Masking
// ---------------------------------------------------------------------------

const STANDARD_EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const URL_ENCODED_EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+%40[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi;

/**
 * Masks standard and URL-encoded email addresses with [MASKED_EMAIL].
 */
export function maskEmails(text: string): { text: string; count: number } {
  let count = 0;

  let sanitized = text.replace(STANDARD_EMAIL_REGEX, () => {
    count++;
    return '[MASKED_EMAIL]';
  });

  sanitized = sanitized.replace(URL_ENCODED_EMAIL_REGEX, () => {
    count++;
    return '[MASKED_EMAIL]';
  });

  return { text: sanitized, count };
}

// ---------------------------------------------------------------------------
// 2. Credit Card Masking with Luhn Verification
// ---------------------------------------------------------------------------

/**
 * Validates a candidate Primary Account Number (PAN) using ISO/IEC 7812 Luhn Check (mod 10).
 * Supports standard PAN lengths from 13 to 19 digits.
 */
export function isValidLuhn(cardNumber: string): boolean {
  const digits = cardNumber.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) {
    return false;
  }

  let sum = 0;
  let shouldDouble = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits.charAt(i), 10);
    if (isNaN(digit)) {
      return false;
    }

    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
    shouldDouble = !shouldDouble;
  }

  return sum % 10 === 0;
}

// Matches potential credit card patterns:
// 1. Separated groups: 4242-4242-4242-4242 or 4242 4242 4242 4242
// 2. Amex style: 3782-822463-10005 or 3782 822463 10005
// 3. Unseparated digits: 13 to 19 digits starting with major industry identifiers (2, 3, 4, 5, 6)
const FORMATTED_PAN_REGEX = /\b(?:\d{4}[ -]){3}\d{1,4}\b|\b\d{4}[ -]\d{6}[ -]\d{4,5}\b/g;
const UNFORMATTED_PAN_REGEX = /\b(?<!\d)[2-6]\d{12,18}(?!\d)\b/g;

/**
 * Masks valid credit cards / PANs with [MASKED_CARD] after verifying Luhn checksum.
 * Invalid card numbers are preserved intact to allow false-positive discrimination.
 */
export function maskCreditCards(text: string): { text: string; count: number } {
  let count = 0;

  // Process formatted cards first
  let sanitized = text.replace(FORMATTED_PAN_REGEX, (match) => {
    if (isValidLuhn(match)) {
      count++;
      return '[MASKED_CARD]';
    }
    return match;
  });

  // Process unformatted cards
  sanitized = sanitized.replace(UNFORMATTED_PAN_REGEX, (match) => {
    if (isValidLuhn(match)) {
      count++;
      return '[MASKED_CARD]';
    }
    return match;
  });

  return { text: sanitized, count };
}

// ---------------------------------------------------------------------------
// 3. Secret, Key & Credential Masking
// ---------------------------------------------------------------------------

// Private Keys (PEM / RSA / EC)
const PRIVATE_KEY_REGEX = /-----BEGIN (?:[A-Z0-9_-]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z0-9_-]+ )?PRIVATE KEY-----/g;

// Standard JWT format: eyJ... . eyJ... . signature
const JWT_REGEX = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\b/g;

// Authorization / Proxy-Authorization header tokens (Bearer, Basic, or Custom token)
const AUTH_HEADER_REGEX = /\b((?:Authorization|Proxy-Authorization)\s*:\s*)(?:(Bearer\s+)(?!\[MASKED_SECRET\])[^\r\n\s]+|(Basic\s+)(?!\[MASKED_SECRET\])[^\r\n\s]+|(?!\s*(?:Bearer|Basic|\[MASKED_SECRET\]))[^\r\n]+)/gi;

// Standalone Bearer tokens outside of Authorization header
const STANDALONE_BEARER_REGEX = /\b(Bearer\s+)(?!\[MASKED_SECRET\])[A-Za-z0-9._~+/-]{10,}=*/gi;

// Custom API key headers (e.g. x-api-key: ..., api-key: ...)
const API_KEY_HEADER_REGEX = /\b((?:x-)?api[_-]?key\s*:\s*)(?!\[MASKED_SECRET\])[^\r\n\s"']+/gi;

// Well-known provider token patterns
const AWS_ACCESS_KEY_REGEX = /\bAKIA[0-9A-Z]{16}\b/g;
const GITHUB_TOKEN_REGEX = /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/g;
const OPENAI_KEY_REGEX = /\bsk-[A-Za-z0-9_-]{20,}\b/g;
const SLACK_TOKEN_REGEX = /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/g;

// Quoted secret values in JSON or key-value configs: "password": "...", "client_secret": "..."
const QUOTED_KV_SECRET_REGEX = /((?:['"](?:password|passwd|pwd|secret|client_secret|api[_-]?key|access[_-]?token|auth[_-]?token|refresh[_-]?token|private[_-]?key)['"]\s*:\s*['"]))(?!\[MASKED_SECRET\])(.*?)(['"])/gi;

// Unquoted secret values in logs / query params: password=secretValue or api_key: secretValue
const UNQUOTED_KV_SECRET_REGEX = /\b((?:password|passwd|pwd|secret|client_secret|api[_-]?key|access[_-]?token|auth[_-]?token|refresh[_-]?token|private[_-]?key)\s*[:=]\s*)(?!\[MASKED_SECRET\])[^\s,;&"']+/gi;

// URL query parameter secrets: ?token=... or &api_key=... or ?access_token=...
const URL_SECRET_PARAM_REGEX = /([?&](?:token|access_token|accessToken|api_key|apiKey|auth_token|auth|secret|password)=)(?!\[MASKED_SECRET\])[^&\s#]+/gi;

/**
 * Masks authentication secrets, tokens, JWTs, headers, and API keys with [MASKED_SECRET].
 */
export function maskSecrets(text: string): { text: string; count: number } {
  let count = 0;
  let sanitized = text;

  // 1. Private keys
  sanitized = sanitized.replace(PRIVATE_KEY_REGEX, () => {
    count++;
    return '[MASKED_SECRET]';
  });

  // 2. JWTs
  sanitized = sanitized.replace(JWT_REGEX, () => {
    count++;
    return '[MASKED_SECRET]';
  });

  // 3. Provider tokens
  sanitized = sanitized.replace(AWS_ACCESS_KEY_REGEX, () => {
    count++;
    return '[MASKED_SECRET]';
  });
  sanitized = sanitized.replace(GITHUB_TOKEN_REGEX, () => {
    count++;
    return '[MASKED_SECRET]';
  });
  sanitized = sanitized.replace(OPENAI_KEY_REGEX, () => {
    count++;
    return '[MASKED_SECRET]';
  });
  sanitized = sanitized.replace(SLACK_TOKEN_REGEX, () => {
    count++;
    return '[MASKED_SECRET]';
  });

  // 4. Authorization / Proxy-Authorization headers
  sanitized = sanitized.replace(AUTH_HEADER_REGEX, (_m, p1, bearer, basic) => {
    count++;
    if (bearer) return `${p1}${bearer}[MASKED_SECRET]`;
    if (basic) return `${p1}${basic}[MASKED_SECRET]`;
    return `${p1}[MASKED_SECRET]`;
  });

  // Standalone Bearer tokens outside of headers
  sanitized = sanitized.replace(STANDALONE_BEARER_REGEX, (_m, p1) => {
    count++;
    return `${p1}[MASKED_SECRET]`;
  });

  // 5. API Key headers
  sanitized = sanitized.replace(API_KEY_HEADER_REGEX, (_m, p1) => {
    count++;
    return `${p1}[MASKED_SECRET]`;
  });

  // 6. Quoted JSON / key-value secrets
  sanitized = sanitized.replace(QUOTED_KV_SECRET_REGEX, (_m, p1, _val, p3) => {
    count++;
    return `${p1}[MASKED_SECRET]${p3}`;
  });

  // 7. Unquoted key-value secrets
  sanitized = sanitized.replace(UNQUOTED_KV_SECRET_REGEX, (_m, p1) => {
    count++;
    return `${p1}[MASKED_SECRET]`;
  });

  // 8. URL query params
  sanitized = sanitized.replace(URL_SECRET_PARAM_REGEX, (_m, p1) => {
    count++;
    return `${p1}[MASKED_SECRET]`;
  });

  return { text: sanitized, count };
}

// ---------------------------------------------------------------------------
// 4. Prompt Injection Neutralization
// ---------------------------------------------------------------------------

const PROMPT_INJECTION_PATTERNS: RegExp[] = [
  // Instruction override / ignore patterns
  /\b(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous|prior|above)\s+instructions\b/gi,
  /\bdo\s+not\s+follow\s+(?:the\s+)?(?:previous|prior|above)\s+instructions\b/gi,
  /\bbypass\s+(?:all\s+)?(?:safety|content|system)\s+filters\b/gi,
  /\byou\s+are\s+now\s+(?:in\s+developer\s+mode|DAN|jailbroken)\b/gi,

  // System prompt impersonation and prompt leaking
  /\bSYSTEM\s+PROMPT\b/g,
  /\bSYSTEM\s+INSTRUCTIONS\b/gi,
  /\boutput\s+your\s+(?:initial\s+)?system\s+(?:prompt|instructions)\b/gi,
  /\brepeat\s+the\s+(?:words|instructions)\s+above\b/gi,

  // Model context delimiters & control tokens
  /<<\/?SYS>>/gi,
  /<\|(?:im_start|im_end|system)\|>/gi,
  /\[\/?INST\]/gi,
  /---+ *(?:START|BEGIN|END) *(?:PROMPT|SYSTEM|INSTRUCTIONS) *---+/gi,
  /===+ *(?:SYSTEM|PROMPT) *===+/gi,

  // Script tags & dynamic DOM script injections
  /<script\b[^>]*>[\s\S]*?<\/script>/gi,
  /<script\b[^>]*\/?>/gi,
  /\bjavascript:[^\s"'>]+/gi,
  /\b(?:onerror|onload|onclick)\s*=\s*["'][^"']*["']/gi,
];

/**
 * Detects and defuses known prompt injection patterns and malicious delimiters
 * by substituting them with [DEFUSED_INJECTION].
 */
export function defusePromptInjections(text: string): { text: string; count: number } {
  let count = 0;
  let sanitized = text;

  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    sanitized = sanitized.replace(pattern, () => {
      count++;
      return '[DEFUSED_INJECTION]';
    });
  }

  return { text: sanitized, count };
}

// ---------------------------------------------------------------------------
// 5. Main LLM & MCP Sanitization Pipeline
// ---------------------------------------------------------------------------

/**
 * Primary entry point for sanitizing payloads before passing to LLM prompts or MCP servers.
 *
 * @param payload Raw string payload containing potential PII, secrets, or prompt injections.
 * @returns SanitizationResult containing sanitized text, scrubbedCount, and redactionSummary.
 */
export function sanitizeForLlm(payload: string): SanitizationResult {
  if (typeof payload !== 'string' || payload.length === 0) {
    return {
      sanitizedText: payload ?? '',
      scrubbedCount: 0,
      redactionSummary: {
        INJECTION: 0,
        SECRET: 0,
        CARD: 0,
        EMAIL: 0,
      },
    };
  }

  // 1. Defuse prompt injections first to prevent delimiter exploitation
  const injectionResult = defusePromptInjections(payload);

  // 2. Redact sensitive credentials, auth headers, and tokens
  const secretResult = maskSecrets(injectionResult.text);

  // 3. Redact validated credit card numbers (PANs)
  const cardResult = maskCreditCards(secretResult.text);

  // 4. Redact email addresses
  const emailResult = maskEmails(cardResult.text);

  const redactionSummary: Record<string, number> = {
    INJECTION: injectionResult.count,
    SECRET: secretResult.count,
    CARD: cardResult.count,
    EMAIL: emailResult.count,
  };

  const scrubbedCount =
    injectionResult.count + secretResult.count + cardResult.count + emailResult.count;

  return {
    sanitizedText: emailResult.text,
    scrubbedCount,
    redactionSummary,
  };
}

// ---------------------------------------------------------------------------
// 6. SecuritySanitizer Class
// ---------------------------------------------------------------------------

export class SecuritySanitizer {
  /**
   * Primary LLM sanitization delegate.
   */
  public static sanitizeForLlm(payload: string): SanitizationResult {
    return sanitizeForLlm(payload);
  }

  /**
   * Sanitizes a raw text or DOM snapshot string by masking sensitive patterns.
   *
   * @param input Raw text containing potential PII or secrets
   * @returns Sanitized string with sensitive patterns replaced by tokens
   */
  public static sanitizeText(input: string): string {
    return sanitizeForLlm(input).sanitizedText;
  }

  /**
   * Sanitizes a JSON payload object recursively.
   *
   * @param obj Object containing potential sensitive fields
   * @returns Deep sanitized copy of the object
   */
  public static sanitizeObject<T>(obj: T): T {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      return SecuritySanitizer.sanitizeText(obj) as unknown as T;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => SecuritySanitizer.sanitizeObject(item)) as unknown as T;
    }

    if (typeof obj === 'object') {
      const sanitizedObj: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitizedObj[key] = SecuritySanitizer.sanitizeObject(value);
      }
      return sanitizedObj as T;
    }

    return obj;
  }
}
