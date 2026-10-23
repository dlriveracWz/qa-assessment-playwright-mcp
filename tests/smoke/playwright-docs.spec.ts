import { test, expect } from '../../src/fixtures/test.fixture';

test.describe('Playwright Documentation Explorer @smoke @foundational', () => {
  test.beforeEach(async ({ playwrightHomePage }) => {
    await playwrightHomePage.goto();
  });

  test('should navigate via search to Locators documentation and switch language', async ({
    playwrightHomePage,
    docsPage,
  }) => {
    await playwrightHomePage.searchFor('Locators');
    await playwrightHomePage.selectSearchResult('Locators');

    await docsPage.verifyTitle('Locators');
    await docsPage.switchLanguage('Python');
    await docsPage.verifySnippetContains('page.');
  });

  test('should toggle dark/light theme and verify html root attribute updates', async ({
    playwrightHomePage,
  }) => {
    const initialTheme = await playwrightHomePage.getCurrentTheme();
    const targetTheme = initialTheme === 'dark' ? 'light' : 'dark';

    await playwrightHomePage.toggleTheme();
    await playwrightHomePage.verifyTheme(targetTheme);

    await playwrightHomePage.toggleTheme();
    await playwrightHomePage.verifyTheme(initialTheme as 'dark' | 'light');
  });
});