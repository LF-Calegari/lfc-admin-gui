import { expect, test } from './fixtures';
import { LoginPage } from './pages/login.page';

test.describe('smoke', () => {
  test('carrega a página de login', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await expect(loginPage.heading).toBeVisible();
  });
});
