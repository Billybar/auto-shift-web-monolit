import type { APIRequestContext, Page } from '@playwright/test';
import { expect, test } from './fixtures';

const PASSWORD = 'Secret-1234';

/** Creates an employee with a login in the session's sandbox, through the API. */
async function createEmployeeLogin(api: APIRequestContext) {
    const [location] = await (await api.get('/api/locations/')).json();
    const positions = await (await api.get(`/api/positions/?location_id=${location.id}`)).json();
    // Emails are unique across the whole DB, not per sandbox
    const email = `e2e-${crypto.randomUUID().slice(0, 8)}@example.com`;

    const response = await api.post('/api/employees/', {
        data: {
            location_id: location.id,
            first_name: 'דנה',
            last_name: 'כניסה',
            email,
            password: PASSWORD,
            position_ids: [positions[0].id],
        },
    });
    expect(response.status()).toBe(201);
    return { email, fullName: 'דנה כניסה' };
}

/**
 * The e2e backend runs in demo mode, where /login sends everyone to /demo. Answering the status
 * as a regular instance shows the login form against the same backend.
 */
async function showLoginForm(page: Page) {
    await page.route('**/api/demo/status', (route) =>
        route.fulfill({ json: { enabled: false, sandbox_ttl_hours: 0 } }));
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'כניסה' })).toBeVisible();
}

test.describe('login', () => {
    test('the right password signs the employee in', async ({ page, apiSession }) => {
        const { email, fullName } = await createEmployeeLogin(apiSession);
        await showLoginForm(page);

        await page.getByLabel('מייל').fill(email);
        await page.getByLabel('סיסמא', { exact: true }).fill(PASSWORD);
        await page.getByRole('button', { name: 'כניסה' }).click();

        await expect(page).toHaveURL('/');
        await expect(page.getByText(fullName, { exact: true })).toBeVisible();
        await expect(page.getByText('עובד', { exact: true })).toBeVisible();
        // A regular instance: the logout button is there, the demo banner isn't
        await expect(page.getByRole('button', { name: 'יציאה מהמערכת' })).toBeVisible();
        await expect(page.getByText(/^סביבת הדגמה:/)).toHaveCount(0);
    });

    test('a wrong password shows the error and stays on /login', async ({ page, apiSession }) => {
        const { email } = await createEmployeeLogin(apiSession);
        await showLoginForm(page);

        await page.getByLabel('מייל').fill(email);
        await page.getByLabel('סיסמא', { exact: true }).fill('wrong-password');
        await page.getByRole('button', { name: 'כניסה' }).click();

        await expect(page.getByText('אימייל או סיסמה אינם נכונים.')).toBeVisible();
        await expect(page).toHaveURL('/login');
    });
});
