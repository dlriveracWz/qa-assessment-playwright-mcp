import { test, expect } from '@fixtures';
import { getBoundaryTestCases } from '../../src/mcp/todo-data-generator';

test.describe('TodoMVC Advanced Lifecycle @regression @advanced', () => {
  test.beforeEach(async ({ todoPage }) => {
    await todoPage.goto();
  });

  test('State Transitions: Editing, canceling and deletion', async ({ todoPage }) => {
    // 1. Setup initial state with distinct items
    const initialTasks = [
      'Original Task 1',
      'Task to be Deleted',
      'Original Task 3',
    ];
    await todoPage.addTodos(initialTasks);
    await todoPage.verifyVisibleTodoCount(3);
    await todoPage.verifyItemsLeft('3 items left');

    // 2. Edit first task and save with Enter
    const updatedTaskName = 'First Task Updated via Enter';
    await todoPage.editTodo(0, updatedTaskName);
    await todoPage.verifyTodoText(0, updatedTaskName);
    await todoPage.verifyTodoExists(updatedTaskName);
    await todoPage.verifyTodoNotExists('Original Task 1');

    // 3. Edit task and cancel with Escape without applying changes
    const discardedEdit = 'This modification should be discarded';
    await todoPage.cancelEdit(0, discardedEdit);
    await todoPage.verifyTodoText(0, updatedTaskName);
    await todoPage.verifyTodoNotExists(discardedEdit);

    // 4. Delete the second task ('Task to be Deleted') via hover + delete button
    await todoPage.deleteTodo(1);
    await todoPage.verifyTodoNotExists('Task to be Deleted');
    await todoPage.verifyVisibleTodoCount(2);

    // 5. Verify counter reflects deleted task
    const countText = await todoPage.getTodoCountText();
    expect(countText).toContain('2 items left');
  });

  test('Bulk Actions: Toggle all items state', async ({ todoPage }) => {
    // 1. Create multiple items in active state
    const bulkTasks = [
      'Bulk Task Alpha',
      'Bulk Task Beta',
      'Bulk Task Gamma',
    ];
    await todoPage.addTodos(bulkTasks);
    await todoPage.verifyVisibleTodoCount(3);
    await todoPage.verifyItemsLeft('3 items left');

    // 2. Toggle all to completed
    await todoPage.toggleAll();
    await todoPage.verifyItemsLeft('0 items left');
    await todoPage.verifyTodoCompleted(0, true);
    await todoPage.verifyTodoCompleted(1, true);
    await todoPage.verifyTodoCompleted(2, true);

    // 3. Toggle all again to reactivate all items
    await todoPage.toggleAll();
    await todoPage.verifyItemsLeft('3 items left');
    await todoPage.verifyTodoCompleted(0, false);
    await todoPage.verifyTodoCompleted(1, false);
    await todoPage.verifyTodoCompleted(2, false);
    await todoPage.verifyVisibleTodoCount(3);
  });

  test.describe('Data-Driven Boundary Tests', () => {
    const boundaryCases = getBoundaryTestCases();

    for (const testCase of boundaryCases) {
      test(`Boundary [${testCase.category}]: ${testCase.name}`, async ({ todoPage }) => {
        await todoPage.addTodo(testCase.input);

        if (testCase.expectedOutcome === 'rejected') {
          // Rejection invariant: no item created, list remains empty
          await todoPage.verifyVisibleTodoCount(0);
        } else {
          // Creation invariant: trimmed or full Unicode/extreme text accepted
          await todoPage.verifyVisibleTodoCount(1);
          await todoPage.verifyTodoExists(testCase.expectedTitle);
        }
      });
    }
  });

  test('Network Resilience & Latency Simulation', async ({ page, todoPage }) => {
    // Intercept static assets and inject deterministic artificial delay (600ms)
    await page.route('**/*.{css,js}', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      await route.continue();
    });

    // Intercept simulated telemetry/sync endpoint
    await page.route('**/api/sync/**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 800));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ synced: true, timestamp: Date.now() }),
      });
    });

    // Re-navigate under throttled network conditions to validate auto-waiting
    await todoPage.goto();

    // User interactions execute deterministically despite network latency
    await todoPage.addTodo('Network Resilient Task');
    await todoPage.verifyVisibleTodoCount(1);
    await todoPage.verifyTodoExists('Network Resilient Task');

    // Complete task and assert state transition
    await todoPage.completeTodo(0);
    await todoPage.verifyTodoCompleted(0, true);
    await todoPage.verifyItemsLeft('0 items left');

    // Toggle back to active
    await todoPage.toggleAll();
    await todoPage.verifyTodoCompleted(0, false);
    await todoPage.verifyItemsLeft('1 item left');
  });
});
