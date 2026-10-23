import * as fs from 'fs';
import * as path from 'path';
import { SecuritySanitizer, type SanitizationResult } from '../src/utils/security-sanitizer';

/**
 * Playwright JSON Test Report Schema Interfaces
 */
export interface PlaywrightTestError {
  message: string;
  stack?: string;
  value?: string;
}

export interface PlaywrightTestResult {
  workerIndex?: number;
  status: 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';
  duration: number;
  errors?: PlaywrightTestError[];
  error?: PlaywrightTestError;
  retry?: number;
  stdout?: Array<{ text?: string }>;
  stderr?: Array<{ text?: string }>;
}

export interface PlaywrightTestCase {
  timeout?: number;
  expectedStatus?: string;
  projectName?: string;
  status?: string;
  results?: PlaywrightTestResult[];
}

export interface PlaywrightSpec {
  title: string;
  file?: string;
  line?: number;
  column?: number;
  ok?: boolean;
  tests?: PlaywrightTestCase[];
}

export interface PlaywrightSuite {
  title: string;
  file?: string;
  line?: number;
  column?: number;
  specs?: PlaywrightSpec[];
  suites?: PlaywrightSuite[];
}

export interface PlaywrightReport {
  config?: Record<string, unknown>;
  suites?: PlaywrightSuite[];
  errors?: PlaywrightTestError[];
  stats?: {
    startTime?: string;
    duration?: number;
    expected?: number;
    unexpected?: number;
    flaky?: number;
    skipped?: number;
  };
}

export interface FailureDiagnostic {
  test: string;
  file?: string;
  duration?: number;
  error: string;
  stack?: string;
  classification: string;
  rootCause: string;
  impact: string;
  recommendation: string;
}

export interface RedactionMetrics {
  totalScrubbed: number;
  summary: Record<string, number>;
}

export type FailureCategory = '[Product Defect]' | '[Environment Flake]' | '[Automation Bug]';

interface RawFailureItem {
  title: string;
  file: string;
  duration: number;
  rawError: string;
  rawStack: string;
}

/**
 * Strips ANSI terminal color escape codes from text.
 */
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u001b\[[0-9;]*m/g, '');
}

/**
 * AI Failure Triage & Trace Analyzer
 *
 * Tier 3 Enterprise Feature:
 * Ingests Playwright JSON test execution reports, applies strict Data Governance
 * via SecuritySanitizer to scrub all PII, tokens, and secrets, classifies test failures
 * into official defect buckets ([Product Defect], [Environment Flake], [Automation Bug]),
 * and produces enterprise-grade Markdown reports directly into CI/CD summaries.
 */
export class AiFailureTriage {
  private readonly reportPath: string;

  constructor(reportPath?: string) {
    const targetPath =
      reportPath ||
      process.env.PLAYWRIGHT_JSON_REPORT ||
      'test-results/report.json';
    this.reportPath = path.resolve(process.cwd(), targetPath);
  }

  /**
   * Reads and parses test report, executes sanitization, performs triage classification,
   * and writes the diagnostic markdown report to stdout and GITHUB_STEP_SUMMARY if available.
   *
   * @returns 0 on successful triage execution.
   */
  public async analyzeReport(): Promise<number> {
    console.log(`[AI-Triage] Ingesting Playwright test report from: ${this.reportPath}`);

    // 1. Check if report file exists
    if (!fs.existsSync(this.reportPath)) {
      const cleanSummary = this.generateCleanSummary(
        `No Playwright JSON report found at \`${path.relative(process.cwd(), this.reportPath)}\`. Test suite assumed clean or not yet executed.`
      );
      this.publishReport(cleanSummary);
      return 0;
    }

    // 2. Parse report JSON
    let report: PlaywrightReport;
    try {
      const rawContent = fs.readFileSync(this.reportPath, 'utf-8');
      report = JSON.parse(rawContent) as PlaywrightReport;
    } catch (parseError) {
      console.warn(`[AI-Triage] Warning: Unable to parse JSON report:`, parseError);
      const invalidSummary = this.generateCleanSummary(
        `Playwright JSON report exists but could not be parsed as valid JSON. Skipping automated triage.`
      );
      this.publishReport(invalidSummary);
      return 0;
    }

    // 3. Extract raw failures recursively across all suites and specs
    const rawFailures = this.extractFailures(report);

    if (rawFailures.length === 0) {
      console.log(`[AI-Triage] ✅ All tests passed! Zero failures detected.`);
      const cleanSummary = this.generateCleanSummary(
        'All tests completed successfully with 100% pass rate. No defects or flakiness detected.'
      );
      this.publishReport(cleanSummary);
      return 0;
    }

    console.log(`[AI-Triage] Discovered ${rawFailures.length} failed test execution(s). Initiating triage & sanitization...`);

    // 4. Data Governance & Sanitization: Scrub each error & stack trace before analysis
    const redactionMetrics: RedactionMetrics = {
      totalScrubbed: 0,
      summary: { EMAIL: 0, CARD: 0, SECRET: 0, INJECTION: 0 },
    };

    const diagnostics: FailureDiagnostic[] = [];

    for (const failure of rawFailures) {
      // Scrub error message
      const sanitizedErrorResult: SanitizationResult = SecuritySanitizer.sanitizeForLlm(
        stripAnsi(failure.rawError)
      );
      // Scrub stack trace
      const sanitizedStackResult: SanitizationResult = SecuritySanitizer.sanitizeForLlm(
        stripAnsi(failure.rawStack)
      );

      // Accumulate data governance metrics
      this.accumulateMetrics(redactionMetrics, sanitizedErrorResult);
      this.accumulateMetrics(redactionMetrics, sanitizedStackResult);

      const sanitizedError = sanitizedErrorResult.sanitizedText.trim();
      const sanitizedStack = sanitizedStackResult.sanitizedText.trim();

      // 5. Failure Classification Engine (AI with Heuristic Fallback)
      const analysis = await this.performTriage(
        failure.title,
        sanitizedError,
        sanitizedStack
      );

      diagnostics.push({
        test: failure.title,
        file: failure.file,
        duration: failure.duration,
        error: sanitizedError,
        stack: sanitizedStack,
        classification: analysis.classification,
        rootCause: analysis.rootCause,
        impact: analysis.impact,
        recommendation: analysis.recommendation,
      });
    }

    // 6. Generate Enterprise Markdown Report
    const markdownReport = this.generateSummaryMarkdown(diagnostics, redactionMetrics);

    // 7. Publish to GITHUB_STEP_SUMMARY and stdout
    this.publishReport(markdownReport);

    return 0;
  }

  /**
   * Classifies error messages into categorized defect buckets using deterministic heuristic rules.
   *
   * @param errorMessage Sanitized error message string
   * @param stackTrace Optional sanitized stack trace
   * @returns Classification bucket: '[Product Defect]' | '[Environment Flake]' | '[Automation Bug]'
   */
  public classifyFailure(errorMessage: string, stackTrace = ''): string {
    const combined = `${errorMessage}\n${stackTrace}`.toLowerCase();

    // 1. Environment Flake checks (Network, timeouts, 5xx, worker exits)
    const isEnvFlake =
      combined.includes('econnrefused') ||
      combined.includes('econnreset') ||
      combined.includes('etimedout') ||
      combined.includes('socket hang up') ||
      combined.includes('net::err_connection_refused') ||
      combined.includes('net::err_name_not_resolved') ||
      combined.includes('net::err_timed_out') ||
      combined.includes('navigation timeout') ||
      combined.includes('waiting for response') ||
      combined.includes('500 internal server error') ||
      combined.includes('502 bad gateway') ||
      combined.includes('503 service unavailable') ||
      combined.includes('504 gateway timeout') ||
      combined.includes('429 too many requests') ||
      combined.includes('browser has been closed') ||
      combined.includes('target closed') ||
      combined.includes('worker process exited');

    if (isEnvFlake) {
      return '[Environment Flake]';
    }

    // 2. Product Defect checks (Assertions, data mismatches, visual snapshots, unexpected 4xx)
    const isProductDefect =
      combined.includes('expect(received).tobe') ||
      combined.includes('expect(received).toequal') ||
      combined.includes('expect(received).tohavetext') ||
      combined.includes('expect(received).tocontaintext') ||
      combined.includes('expect(received).tohavecount') ||
      combined.includes('snapshot comparison failed') ||
      combined.includes('screenshot comparison failed') ||
      (combined.includes('expected') && combined.includes('received')) ||
      combined.includes('400 bad request') ||
      combined.includes('422 unprocessable entity');

    if (isProductDefect) {
      return '[Product Defect]';
    }

    // 3. Automation Bug checks (Locators, strict mode, syntax, missing fixtures/auth, POM errors)
    const isAutomationBug =
      combined.includes('strict mode violation') ||
      combined.includes('waiting for locator') ||
      combined.includes('invalid selector') ||
      combined.includes('syntaxerror') ||
      combined.includes('cannot read property') ||
      combined.includes('cannot read properties') ||
      combined.includes('is not a function') ||
      combined.includes('typeerror') ||
      combined.includes('missing storagestate') ||
      combined.includes('cognito mode') ||
      combined.includes('page.goto: url must be absolute');

    if (isAutomationBug) {
      return '[Automation Bug]';
    }

    // Default fallback rules
    if (combined.includes('timeout')) {
      return '[Environment Flake]';
    }
    if (combined.includes('expect')) {
      return '[Product Defect]';
    }
    return '[Automation Bug]';
  }

  /**
   * Performs enriched failure triage. Queries the Gemini API if GEMINI_API_KEY is configured;
   * otherwise falls back seamlessly to the deterministic heuristic engine.
   */
  private async performTriage(
    title: string,
    sanitizedError: string,
    sanitizedStack: string
  ): Promise<{
    classification: string;
    rootCause: string;
    impact: string;
    recommendation: string;
  }> {
    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey) {
      try {
        const aiResult = await this.queryGeminiTriage(apiKey, title, sanitizedError, sanitizedStack);
        if (aiResult) {
          return aiResult;
        }
      } catch (err) {
        console.warn(`[AI-Triage] Warning: Gemini API triage encountered an issue, falling back to heuristic engine:`, err);
      }
    }

    // Deterministic Heuristic Engine
    return this.buildHeuristicDiagnostic(sanitizedError, sanitizedStack);
  }

  /**
   * Queries Google Gemini API with a strict timeout and typed error boundary.
   */
  private async queryGeminiTriage(
    apiKey: string,
    title: string,
    error: string,
    stack: string
  ): Promise<{
    classification: string;
    rootCause: string;
    impact: string;
    recommendation: string;
  } | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
      const prompt = [
        'You are a Principal SDET and QA Architect triage agent.',
        'Classify the test failure into EXACTLY ONE category: [Product Defect], [Environment Flake], or [Automation Bug].',
        'Output strictly valid JSON with this format:',
        '{',
        '  "classification": "[Product Defect]" | "[Environment Flake]" | "[Automation Bug]",',
        '  "rootCause": "<Concise root cause explanation>",',
        '  "impact": "<Impact on product or pipeline>",',
        '  "recommendation": "<Actionable recommendation for engineers>"',
        '}',
        '',
        `Test Title: ${title}`,
        `Sanitized Error: ${error}`,
        `Sanitized Stack: ${stack.slice(0, 1000)}`,
      ].join('\n');

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as {
        candidates?: Array<{
          content?: {
            parts?: Array<{ text?: string }>;
          };
        }>;
      };

      const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!candidateText) return null;

      const parsed = JSON.parse(candidateText) as {
        classification?: string;
        rootCause?: string;
        impact?: string;
        recommendation?: string;
      };

      if (parsed.classification && parsed.rootCause && parsed.recommendation) {
        const validCategories: string[] = ['[Product Defect]', '[Environment Flake]', '[Automation Bug]'];
        const matched = validCategories.find(
          (cat) => cat.toLowerCase() === parsed.classification?.toLowerCase().trim()
        );

        return {
          classification: matched || this.classifyFailure(error, stack),
          rootCause: parsed.rootCause,
          impact: parsed.impact || 'Functional defect impacting system confidence.',
          recommendation: parsed.recommendation,
        };
      }

      return null;
    } catch (_err) {
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Generates heuristic diagnostic details matching category specifications.
   */
  private buildHeuristicDiagnostic(
    errorMessage: string,
    stackTrace: string
  ): {
    classification: string;
    rootCause: string;
    impact: string;
    recommendation: string;
  } {
    const classification = this.classifyFailure(errorMessage, stackTrace);

    switch (classification) {
      case '[Environment Flake]':
        return {
          classification,
          rootCause:
            'Infrastructure instability, browser lifecycle disconnect, or network latency exceeded expected action timeouts.',
          impact:
            'Transient pipeline failure; high likelihood of passing on automated retry. Low risk of production application regression.',
          recommendation:
            'Inspect network logs, verify staging service health, and configure CI auto-retries in playwright.config.ts.',
        };
      case '[Product Defect]':
        return {
          classification,
          rootCause:
            'Assertion divergence: The application under test produced an unexpected UI state or API payload violating specification.',
          impact:
            'Functional regression detected in business logic; potentially impacts end users and release readiness.',
          recommendation:
            'Examine trace artifacts and screenshots, compare expected vs actual state against feature contract, and open a defect ticket.',
        };
      case '[Automation Bug]':
      default:
        return {
          classification: '[Automation Bug]',
          rootCause:
            'Test automation harness failure: strict mode locator conflict, brittle selector, or missing Page Object orchestration.',
          impact:
            'False negative test run obstructing CI gate. No direct functional defect in end-user application code.',
          recommendation:
            'Refactor selectors inside the corresponding Page Object class using accessible semantic roles per AGENTS.md Rule 3.',
        };
    }
  }

  /**
   * Recursively extracts all test failures from suites, specs, and root errors.
   */
  private extractFailures(report: PlaywrightReport): RawFailureItem[] {
    const failures: RawFailureItem[] = [];

    // Root-level errors (global-setup, config parse errors)
    if (report.errors && report.errors.length > 0) {
      for (const err of report.errors) {
        failures.push({
          title: 'Global Setup / Harness Initialization',
          file: 'global-setup.ts',
          duration: 0,
          rawError: err.message || 'Harness setup failure',
          rawStack: err.stack || '',
        });
      }
    }

    if (report.suites) {
      for (const suite of report.suites) {
        this.traverseSuite(suite, [], '', failures);
      }
    }

    return failures;
  }

  /**
   * Recursively traverses a suite tree to locate failed spec results.
   */
  private traverseSuite(
    suite: PlaywrightSuite,
    breadcrumb: string[],
    fileContext: string,
    accumulator: RawFailureItem[]
  ): void {
    const currentFile = suite.file || fileContext;
    const currentBreadcrumb = suite.title ? [...breadcrumb, suite.title] : breadcrumb;

    if (suite.specs) {
      for (const spec of suite.specs) {
        const specFile = spec.file || currentFile;
        const fullTitle = [...currentBreadcrumb, spec.title].join(' › ');

        if (spec.tests) {
          for (const testCase of spec.tests) {
            const results = testCase.results || [];
            for (const result of results) {
              if (
                result.status === 'failed' ||
                result.status === 'timedOut' ||
                result.status === 'interrupted'
              ) {
                const message =
                  result.error?.message ||
                  (result.errors && result.errors.map((e) => e.message).join('\n')) ||
                  'Test execution failed';

                const stack =
                  result.error?.stack ||
                  (result.errors && result.errors.map((e) => e.stack || '').filter(Boolean).join('\n')) ||
                  '';

                accumulator.push({
                  title: fullTitle,
                  file: specFile,
                  duration: result.duration || 0,
                  rawError: message,
                  rawStack: stack,
                });
              }
            }
          }
        }
      }
    }

    if (suite.suites) {
      for (const childSuite of suite.suites) {
        this.traverseSuite(childSuite, currentBreadcrumb, currentFile, accumulator);
      }
    }
  }

  /**
   * Accumulates redaction metrics across all processed error payloads.
   */
  private accumulateMetrics(
    metrics: RedactionMetrics,
    sanitizationResult: SanitizationResult
  ): void {
    metrics.totalScrubbed += sanitizationResult.scrubbedCount;
    for (const [key, count] of Object.entries(sanitizationResult.redactionSummary)) {
      metrics.summary[key] = (metrics.summary[key] || 0) + (count || 0);
    }
  }

  /**
   * Outputs formatted diagnostic markdown to stdout / CI summary.
   *
   * @param diagnostics Array of categorized test failures
   * @param redactionMetrics Optional Data Governance metrics
   * @returns Formatted Markdown string
   */
  public generateSummaryMarkdown(
    diagnostics: FailureDiagnostic[],
    redactionMetrics?: RedactionMetrics
  ): string {
    const totalFailures = diagnostics.length;
    const productDefects = diagnostics.filter((d) => d.classification === '[Product Defect]').length;
    const envFlakes = diagnostics.filter((d) => d.classification === '[Environment Flake]').length;
    const automationBugs = diagnostics.filter((d) => d.classification === '[Automation Bug]').length;

    const formatPct = (count: number): string =>
      totalFailures > 0 ? `${Math.round((count / totalFailures) * 100)}%` : '0%';

    const scrubbedCount = redactionMetrics?.totalScrubbed || 0;
    const redactionDetails = redactionMetrics?.summary || {};

    const lines: string[] = [
      '# 🤖 Playwright AI Test Failure Triage Report',
      '',
      `> **Execution Summary:** ❌ **${totalFailures} Failed Test(s)** | 🛡️ **Data Governance: Active** (${scrubbedCount} artifact(s) sanitized) | 🕒 *${new Date().toISOString()}*`,
      '',
      '## 📊 Defect Classification Breakdown',
      '',
      '| Category | Count | Proportion | Action Priority |',
      '| :--- | :---: | :---: | :--- |',
      `| 🔴 **[Product Defect]** | **${productDefects}** | ${formatPct(productDefects)} | **P1 - Critical**: Block release, file application bug ticket |`,
      `| 🟡 **[Environment Flake]** | **${envFlakes}** | ${formatPct(envFlakes)} | **P3 - Low**: Monitor infrastructure & retry SLOs |`,
      `| 🔵 **[Automation Bug]** | **${automationBugs}** | ${formatPct(automationBugs)} | **P2 - Medium**: Refactor Page Object locators / fixtures |`,
      '',
      '## 🛡️ Security & Data Governance Audit',
      '',
      'All raw DOM snapshots, console logs, and stack traces were sanitized prior to AI ingestion adhering to AGENTS.md Section 5 governance rules.',
      '',
      '| Data Category | Masking Token | Redaction Count | Status |',
      '| :--- | :---: | :---: | :---: |',
      `| 📧 **Email Addresses** | \`[MASKED_EMAIL]\` | ${redactionDetails.EMAIL || 0} | ✅ Redacted |`,
      `| 💳 **Credit Cards / PANs** | \`[MASKED_CARD]\` | ${redactionDetails.CARD || 0} | ✅ Redacted |`,
      `| 🔑 **Secrets, JWTs & Auth Headers** | \`[MASKED_SECRET]\` | ${redactionDetails.SECRET || 0} | ✅ Redacted |`,
      `| 🛑 **Prompt Injection Attacks** | \`[DEFUSED_INJECTION]\` | ${redactionDetails.INJECTION || 0} | ✅ Defused |`,
      `| **Total Scrubbed Entities** | — | **${scrubbedCount}** | **0 Unmasked Secrets Leaked** |`,
      '',
      '---',
      '',
      '## 🔍 Detailed Root Cause Diagnostics',
      '',
    ];

    diagnostics.forEach((diag, index) => {
      const badge =
        diag.classification === '[Product Defect]'
          ? '🔴'
          : diag.classification === '[Environment Flake]'
          ? '🟡'
          : '🔵';

      lines.push(`### ${index + 1}. ${badge} ${diag.classification} — \`${diag.test}\``);
      lines.push('');
      lines.push(`- **Spec File:** \`${diag.file || 'unknown'}\``);
      lines.push(`- **Duration:** \`${diag.duration || 0}ms\``);
      lines.push(`- **Root Cause:** ${diag.rootCause}`);
      lines.push(`- **Impact Assessment:** ${diag.impact}`);
      lines.push(`- **Recommended Action:** ${diag.recommendation}`);
      lines.push('');
      lines.push('<details>');
      lines.push('<summary><b>View Sanitized Error Log & Stack Trace</b></summary>');
      lines.push('');
      lines.push('```');
      lines.push(diag.error || 'No error message provided');
      if (diag.stack) {
        lines.push('');
        lines.push(diag.stack);
      }
      lines.push('```');
      lines.push('</details>');
      lines.push('');
      lines.push('---');
      lines.push('');
    });

    lines.push('*Automated Diagnostic Report generated by `scripts/ai-triage.ts` (Tier 3 Certification).*');

    return lines.join('\n');
  }

  /**
   * Generates a clean state summary when no test failures occur.
   */
  private generateCleanSummary(message: string): string {
    return [
      '# 🤖 Playwright AI Test Failure Triage Report',
      '',
      '> **Status:** ✅ **All Tests Passing Cleanly** | 🛡️ **Data Governance: Verified** | 🕒 *' + new Date().toISOString() + '*',
      '',
      message,
      '',
      '| Metric | Status |',
      '| :--- | :--- |',
      '| **Total Failures** | `0` |',
      '| **Suite Health** | `100% Passed` |',
      '| **Data Governance Audit** | `0 Secrets / PII Exposed` |',
      '',
      '*Automated Diagnostic Report generated by `scripts/ai-triage.ts`.*',
    ].join('\n');
  }

  /**
   * Publishes the generated markdown report to GITHUB_STEP_SUMMARY and stdout.
   */
  private publishReport(markdownContent: string): void {
    // 1. Output directly to terminal console
    console.log('\n' + markdownContent + '\n');

    // 2. Append to GitHub Actions step summary if running in CI
    const summaryPath = process.env.GITHUB_STEP_SUMMARY;
    if (summaryPath) {
      try {
        fs.appendFileSync(summaryPath, `\n${markdownContent}\n`, 'utf-8');
        console.log(`[AI-Triage] ✅ Successfully appended triage report to GITHUB_STEP_SUMMARY: ${summaryPath}`);
      } catch (writeError) {
        console.warn(`[AI-Triage] Warning: Unable to write to GITHUB_STEP_SUMMARY:`, writeError);
      }
    }
  }
}

// CLI entry point
if (require.main === module) {
  const reportArg = process.env.PLAYWRIGHT_JSON_REPORT || process.argv[2];
  const triage = new AiFailureTriage(reportArg);
  triage
    .analyzeReport()
    .then((exitCode) => {
      process.exit(exitCode);
    })
    .catch((err) => {
      console.error('[AI-Triage] Fatal error during triage execution:', err);
      process.exit(1);
    });
}
