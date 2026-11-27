import { expect, navigateTo, test, toast } from './fixtures';

test.describe('employee management (manager)', () => {
    test('a new employee with a login and a role is added, and is still listed after a reload', async ({ managerPage: page }) => {
        // Emails are unique across the whole DB, not per sandbox
        const email = `e2e-${crypto.randomUUID().slice(0, 8)}@example.com`;

        await navigateTo(page, 'ניהול עובדים');
        await page.getByRole('button', { name: 'הוספת עובד' }).click();

        const dialog = page.getByRole('dialog', { name: 'יצירת עובד חדש' });
        await dialog.getByLabel('שם פרטי').fill('נועה');
        await dialog.getByLabel('שם משפחה').fill('בדיקה');
        await dialog.getByLabel('מייל').fill(email);
        await dialog.getByLabel('סיסמא', { exact: true }).fill('Secret-1234');
        await dialog.getByRole('button', { name: 'אחמ"ש', exact: true }).click();
        await expect(dialog.getByRole('button', { name: 'אחמ"ש', exact: true })).toHaveAttribute('aria-pressed', 'true');

        await dialog.getByRole('button', { name: 'שמור' }).click();
        await expect(toast(page, 'העובד נוסף')).toBeVisible();
        await expect(dialog).toBeHidden();

        const row = page.getByRole('row').filter({ hasText: 'נועה בדיקה' });
        await expect(row).toHaveCount(1);

        await page.reload();
        await expect(page.getByRole('button', { name: 'הוספת עובד' })).toBeVisible({ timeout: 30_000 });
        await expect(row).toHaveCount(1);
        await expect(row).toContainText('אחמ"ש');
    });
});
