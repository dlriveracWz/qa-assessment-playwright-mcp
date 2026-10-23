import { type Page, type Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

export class PlaywrightHomePage extends BasePage {
  private readonly searchButton: Locator;
  private readonly searchInput: Locator;
  private readonly searchResults: Locator;
  private readonly themeToggle: Locator;
  private readonly htmlRoot: Locator;

  constructor(page: Page) {
    super(page);
    this.searchButton = page.getByRole('button', { name: 'Search' });
    this.searchInput = page.getByPlaceholder('Search docs');
    this.searchResults = page.getByRole('listbox').getByRole('option');
    this.themeToggle = page.getByRole('button', {
      name: /Switch between dark and light mode/i,
    });
    this.htmlRoot = page.locator('html');
  }

  async goto(): Promise<void> {
    await this.navigate('/');
    await expect(this.htmlRoot).toHaveAttribute('data-has-hydrated', 'true');
    await expect(this.searchButton).toBeVisible();
  }

  async searchFor(term: string): Promise<void> {
    await this.searchButton.click();
    await expect(this.searchInput).toBeVisible();
    await this.searchInput.fill(term);
    await expect(this.searchResults.first()).toBeVisible();
  }

  async selectSearchResult(term: string): Promise<void> {
    const result = this.searchResults.filter({ hasText: term }).first();
    await expect(result).toBeVisible();
    await result.click();
    await this.waitForPageLoad();
  }

  async toggleTheme(): Promise<void> {
    await expect(this.htmlRoot).toHaveAttribute('data-has-hydrated', 'true');
    const currentTheme = (await this.htmlRoot.getAttribute('data-theme')) || 'light';
    const targetTheme = currentTheme === 'dark' ? 'light' : 'dark';

    // En Docusaurus, cuando el botón está en "system mode", el primer clic solo fija
    // la preferencia a manual manteniendo el mismo tema. Si es el caso, se ejecuta un clic adicional.
    const ariaLabel = await this.themeToggle.getAttribute('aria-label');
    if (ariaLabel?.includes('system mode')) {
      await this.themeToggle.click();
    }

    await this.themeToggle.click();
    await expect(this.htmlRoot).toHaveAttribute('data-theme', targetTheme);
  }

  async verifyTheme(expectedTheme: 'dark' | 'light'): Promise<void> {
    await expect(this.htmlRoot).toHaveAttribute('data-theme', expectedTheme);
  }

  async getCurrentTheme(): Promise<string> {
    await expect(this.htmlRoot).toHaveAttribute('data-has-hydrated', 'true');
    const theme = await this.htmlRoot.getAttribute('data-theme');
    return theme || 'light';
  }
}