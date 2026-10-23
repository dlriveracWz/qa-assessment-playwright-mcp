import { type Page, type Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * TodoPage Object Model
 * Encapsulates all interactions and assertions for TodoMVC application.
 * Follows AGENTS.md strict POM rules: no locators in specs, accessibility-first selectors, web-first assertions.
 */
export class TodoPage extends BasePage {
  private readonly newTodoInput: Locator;
  private readonly todoList: Locator;
  private readonly todoItems: Locator;
  private readonly toggleAllCheckbox: Locator;
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
    this.toggleAllCheckbox = page.getByLabel('Mark all as complete');
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

  async completeTodoByText(text: string): Promise<void> {
    const item = this.todoItems.filter({ hasText: text });
    await item.getByRole('checkbox').check();
    await expect(item).toHaveClass(/completed/);
  }

  /**
   * Toggles all tasks (complete or active) using the accessible 'Mark all as complete' label.
   */
  async toggleAll(): Promise<void> {
    await this.toggleAllCheckbox.click();
  }

  /**
   * Double clicks on the todo item at index, clears current text, writes newText and presses Enter.
   */
  async editTodo(index: number, newText: string): Promise<void> {
    const item = this.todoItems.nth(index);
    const label = item.getByTestId('todo-title').or(item.locator('label'));
    await label.dblclick();

    const editInput = item.getByRole('textbox', { name: 'Edit' }).or(item.locator('.edit'));
    await expect(editInput).toBeVisible();
    await editInput.fill(newText);
    await editInput.press('Enter');
    await expect(item).not.toHaveClass(/editing/);
    await expect(item).toContainText(newText);
  }

  /**
   * Double clicks on the todo item at index, types cancelText and presses Escape without applying changes.
   */
  async cancelEdit(index: number, cancelText: string): Promise<void> {
    const item = this.todoItems.nth(index);
    const label = item.getByTestId('todo-title').or(item.locator('label'));
    await label.dblclick();

    const editInput = item.getByRole('textbox', { name: 'Edit' }).or(item.locator('.edit'));
    await expect(editInput).toBeVisible();
    await editInput.fill(cancelText);
    await editInput.press('Escape');
    await expect(item).not.toHaveClass(/editing/);
    await expect(item).not.toHaveText(cancelText);
  }

  /**
   * Hovers over the todo item at index and clicks the accessible Delete button ('Delete').
   */
  async deleteTodo(index: number): Promise<void> {
    const item = this.todoItems.nth(index);
    await item.hover();
    const deleteButton = item.getByRole('button', { name: 'Delete' });
    await deleteButton.click();
  }

  /**
   * Returns the counter text ('X items left') with auto-waiting.
   */
  async getTodoCountText(): Promise<string> {
    await expect(this.todoCount).toBeVisible();
    const text = await this.todoCount.textContent();
    return text ? text.trim() : '';
  }

  /**
   * Web-first assertion validating that a specific todo item text does not exist in the list.
   */
  async verifyTodoNotExists(text: string): Promise<void> {
    const itemWithText = this.todoItems.filter({ hasText: text });
    await expect(itemWithText).toHaveCount(0);
  }

  /**
   * Web-first assertion validating that a specific todo item text exists in the list.
   */
  async verifyTodoExists(text: string): Promise<void> {
    const itemWithText = this.todoItems.filter({ hasText: text });
    await expect(itemWithText.first()).toBeVisible();
    await expect(itemWithText).toHaveCount(1);
  }

  /**
   * Verifies the exact text of a todo item at index.
   */
  async verifyTodoText(index: number, expectedText: string): Promise<void> {
    const item = this.todoItems.nth(index);
    await expect(item).toContainText(expectedText);
  }

  /**
   * Verifies whether the todo item at index has or has not completed status.
   */
  async verifyTodoCompleted(index: number, isCompleted: boolean = true): Promise<void> {
    const item = this.todoItems.nth(index);
    if (isCompleted) {
      await expect(item).toHaveClass(/completed/);
    } else {
      await expect(item).not.toHaveClass(/completed/);
    }
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