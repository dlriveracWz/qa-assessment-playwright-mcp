import { test, expect } from '../../src/fixtures/test.fixture';

test.describe('TodoMVC Core Workflow @smoke @foundational', () => {
  const TODO_ITEMS = [
    'Buy groceries',
    'Review PR',
    'Write Playwright test',
  ];

  test.beforeEach(async ({ todoPage }) => {
    await todoPage.goto();
  });

  test('should handle CRUD actions: add, complete, filter and clear items', async ({
    todoPage,
  }) => {
    // 1. Agregar 3 tareas distintas
    await todoPage.addTodos(TODO_ITEMS);
    await todoPage.verifyVisibleTodoCount(3);
    await todoPage.verifyItemsLeft('3 items left');

    // 2. Marcar el segundo elemento ("Review PR", índice 1) como completado
    await todoPage.completeTodo(1);
    await todoPage.verifyItemsLeft('2 items left');

    // 3. Filtrar por "Active" y verificar que solo aparezcan 2 elementos
    await todoPage.filterBy('Active');
    await todoPage.verifyVisibleTodoCount(2);

    // 4. Filtrar por "Completed" y verificar que aparezca 1 elemento
    await todoPage.filterBy('Completed');
    await todoPage.verifyVisibleTodoCount(1);

    // 5. Limpiar elementos completados y verificar el conteo restante
    await todoPage.clearCompleted();
    await todoPage.verifyVisibleTodoCount(0);

    // Regresar a la vista general para verificar las tareas activas restantes
    await todoPage.filterBy('All');
    await todoPage.verifyVisibleTodoCount(2);
    await todoPage.verifyItemsLeft('2 items left');
  });
});