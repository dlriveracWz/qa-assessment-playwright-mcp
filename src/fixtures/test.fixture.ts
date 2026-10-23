import { test as baseTest, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import { TodoPage } from '../pages/todo.page';
import { createHttpClient, type HttpClient } from '../api';
import {
  authStorageStatePath,
  restoreSessionStorage,
} from '../auth/sessionStorage';
import { isCognitoMode } from '../data/constants';
import { DocsPage } from '../pages/docs.page';
import { ExamplePage } from '../pages/ExamplePage';
import { PlaywrightHomePage } from '../pages/playwright-home.page';

export type CustomFixtures = {
  httpApi: HttpClient;
  appPage: Page;
  authenticatedPage: Page;
  freshAuthPage: Page;
  examplePage: ExamplePage;
  playwrightHomePage: PlaywrightHomePage;
  docsPage: DocsPage;
  todoPage: TodoPage;
};

export const test = baseTest.extend<CustomFixtures>({
  httpApi: async ({ request }, use) => {
    await use(createHttpClient(request));
  },

  appPage: async ({ page, browser, baseURL }, use) => {
    if (!isCognitoMode()) {
      await use(page);
      return;
    }

    const sessionPath = authStorageStatePath();
    if (!fs.existsSync(sessionPath)) {
      throw new Error(
        `Cognito mode requires ${sessionPath}. Ensure globalSetup ran successfully.`,
      );
    }

    const context = await browser.newContext({
      storageState: sessionPath,
      baseURL,
    });
    await restoreSessionStorage(context);
    const authPage = await context.newPage();
    await use(authPage);
    await context.close();
  },

  authenticatedPage: async ({ browser, baseURL }, use) => {
    if (!isCognitoMode()) {
      throw new Error(
        '{ authenticatedPage } requires Cognito mode. See docs/recipes/cognito-hosted-ui.md',
      );
    }

    const sessionPath = authStorageStatePath();
    if (!fs.existsSync(sessionPath)) {
      throw new Error(`Missing ${sessionPath}. Run globalSetup in Cognito mode.`);
    }

    const context = await browser.newContext({
      storageState: sessionPath,
      baseURL,
    });
    await restoreSessionStorage(context);
    const page = await context.newPage();
    await use(page);
    await context.close();
  },

  freshAuthPage: async ({ browser, baseURL }, use) => {
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },

  examplePage: async ({ appPage }, use) => {
    await use(new ExamplePage(appPage));
  },

  playwrightHomePage: async ({ appPage }, use) => {
    const homePage = new PlaywrightHomePage(appPage);
    await use(homePage);
  },

  docsPage: async ({ appPage }, use) => {
    const docsPage = new DocsPage(appPage);
    await use(docsPage);
  },

  todoPage: async ({ appPage }, use) => {
    const todoPage = new TodoPage(appPage);
    await use(todoPage);
  },
});

export { expect };