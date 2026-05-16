import type { Locator, Page } from '@playwright/test';

/** Page Object da rota `/login` (smoke e fluxos futuros de autenticação). */
export class LoginPage {
  readonly heading: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: 'Entrar no painel' });
  }

  async goto(): Promise<void> {
    await this.page.goto('/login');
  }
}
