import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test';

/** A seeded sandbox's team: 12 employees and the manager, who is an employee of the location too */
export const TEAM_SIZE = 13;

/** Opens /demo and waits for the manager's schedule, so the page sits in a fresh, private sandbox. */
export async function openSandbox(page: Page) {
    await page.goto('/demo');
    await expect(page.getByRole('button', { name: 'שיבוץ אוטומטי' })).toBeVisible({ timeout: 30_000 });
}

/** The demo banner's switch to the first employee of the sandbox. */
export async function switchToEmployee(page: Page) {
    await page.getByRole('button', { name: 'צפה כעובד' }).click();
    await expect(page.getByRole('button', { name: 'צפה כמנהל' })).toBeVisible();
}

/** The demo banner's switch back to the sandbox's manager. */
export async function switchToManager(page: Page) {
    await page.getByRole('button', { name: 'צפה כמנהל' }).click();
    await expect(page.getByRole('button', { name: 'שיבוץ אוטומטי' })).toBeVisible();
}

/** Opens the header's page menu (it opens on hover) and returns its items. */
export async function openNavMenu(page: Page) {
    await page.getByRole('button', { name: 'תפריט ניווט' }).hover();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    return menu;
}

/** Goes to a page through the header menu. */
export async function navigateTo(page: Page, label: string) {
    const menu = await openNavMenu(page);
    await menu.getByRole('menuitem', { name: label }).click();
}

/** Answers the open confirm dialog with its confirm button. */
export async function confirmDialog(page: Page, confirmText: string) {
    const dialog = page.getByRole('alertdialog');
    await dialog.getByRole('button', { name: confirmText, exact: true }).click();
    await expect(dialog).toBeHidden();
}

/** A sonner toast with this title. */
export const toast = (page: Page, title: string) =>
    page.locator('[data-sonner-toast]').filter({ hasText: title });

export const test = base.extend<{ managerPage: Page; apiSession: APIRequestContext }>({
    // A page signed in as the manager of its own sandbox, on the schedule
    managerPage: async ({ page }, use) => {
        await openSandbox(page);
        await use(page);
    },

    // API calls as the manager of a new sandbox, for setup the UI can't do (no page involved)
    apiSession: async ({ playwright, baseURL }, use) => {
        const anonymous = await playwright.request.newContext({ baseURL });
        const response = await anonymous.post('/api/demo/session');
        expect(response.status()).toBe(201);
        const { access_token } = await response.json();
        await anonymous.dispose();

        const session = await playwright.request.newContext({
            baseURL,
            extraHTTPHeaders: { Authorization: `Bearer ${access_token}` },
        });
        await use(session);
        await session.dispose();
    },
});

export { expect };
