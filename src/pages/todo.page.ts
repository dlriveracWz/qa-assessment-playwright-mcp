import { type Page, type Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

export class TodoPage extends BasePage {
  private readonly newTodoInput: Locator;
  private readonly todoList: Locator;
  private readonly todoItems: Locator;
  private readonly activeFilter: Locator;
  private readonly completedFilter: Locator;
  private readonly allFilter: Locator;
  private readonly clearCompletedButton: Locator;
  private readonly todoCount: Locator;

  constructor(page: Page) {
    super(page);
    this.newTodoInput = page.getByPlaceholder('What needs to be done?');
    this.todoList = page.locator('.todo-list');
    this.todoItems = this.todoList.getByRole('listitem');
    this.allFilter = page.getByRole('link', { name: 'All' });
    this.activeFilter = page.getByRole('link', { name: 'Active' });
    this.completedFilter = page.getByRole('link', { name: 'Completed' });
    this.clearCompletedButton = page.getByRole('button', { name: 'Clear completed' });
    this.todoCount = page.locator('.todo-count');
  }

  async goto(): Promise<void> {
    await this.page.goto('https://demo.playwright.dev/todomvc');
    await expect(this.newTodoInput).toBeVisible();
  }

  async addTodo(text: string): Promise<void> {
    await this.newTodoInput.fill(text);
    await this.newTodoInput.press('Enter');
  }

  async addTodos(items: string[]): Promise<void> {
    for (const item of items) {
      await this.addTodo(item);
    }
  }

  async completeTodo(index: number): Promise<void> {
    const item = this.todoItems.nth(index);
    await item.getByRole('checkbox').check();
    await expect(item).toHaveClass(/completed/);
  }

  async filterBy(filter: 'All' | 'Active' | 'Completed'): Promise<void> {
    const filterMap = {
      All: this.allFilter,
      Active: this.activeFilter,
      Completed: this.completedFilter,
    };
    await filterMap[filter].click();
    await expect(filterMap[filter]).toHaveClass(/selected/);
  }

  async verifyVisibleTodoCount(expectedCount: number): Promise<void> {
    await expect(this.todoItems).toHaveCount(expectedCount);
  }

  async verifyItemsLeft(expectedText: string): Promise<void> {
    await expect(this.todoCount).toContainText(expectedText);
  }

  async clearCompleted(): Promise<void> {
    await expect(this.clearCompletedButton).toBeVisible();
    await this.clearCompletedButton.click();
    await expect(this.clearCompletedButton).toBeHidden();
  }

  public async navigate(path: string = ''): Promise<void> {
    await this.page.goto(path, { waitUntil: 'domcontentloaded' });
    await this.waitForPageLoad();
  }
}