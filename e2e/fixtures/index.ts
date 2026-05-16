import { test as base } from '@playwright/test';

/**
 * Fixture base do projeto. Estenda aqui (`test.extend`) quando precisar de
 * contexto compartilhado (ex.: sessão autenticada, API helpers).
 */
export const test = base;

export { expect } from '@playwright/test';
