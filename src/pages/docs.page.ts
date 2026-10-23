import { type Page, type Locator, expect } from '@playwright/test';

import { BasePage } from './base.page';

type DocsLanguage = 'Python' | 'Java' | 'Node.js';

export class DocsPage extends BasePage {
  private readonly pageTitle: Locator;
  private readonly mainNav: Locator;
  private readonly languageMenuButton: Locator;
  private readonly codeSnippet: Locator;

  constructor(page: Page) {
    super(page);
    this.pageTitle = page.getByRole('heading', { level: 1 });
    this.mainNav = page.getByRole('navigation', { name: 'Main' });
    this.languageMenuButton = this.mainNav.getByRole('button', {
      name: /Node\.js|Python|Java|\.NET/,
    });
    this.codeSnippet = page.getByRole('article').locator('pre').first();
  }

  async verifyTitle(text: string): Promise<void> {
    await expect(this.pageTitle).toBeVisible();
    await expect(this.pageTitle).toContainText(text);
  }

  async switchLanguage(targetLang: DocsLanguage): Promise<void> {
    await expect(this.languageMenuButton).toBeVisible();
    await this.languageMenuButton.hover();
    await this.languageMenuButton.click();

    const languageOption = this.mainNav.getByRole('link', {
      name: targetLang,
      exact: true,
    });
    await expect(languageOption).toBeVisible();
    await languageOption.click();
    await this.waitForPageLoad();
    await expect(this.languageMenuButton).toHaveText(targetLang);
  }

  async verifySnippetContains(expectedSnippetText: string): Promise<void> {
    await expect(this.codeSnippet).toBeVisible();
    await expect(this.codeSnippet).toContainText(expectedSnippetText);
  }
}
