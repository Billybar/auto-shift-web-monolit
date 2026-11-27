import {
    TEAM_SIZE, confirmDialog, expect, openNavMenu, switchToEmployee, switchToManager, test, toast,
} from './fixtures';

// The sidebar's draggable name chips, one per active employee
const sidebarNames = '[draggable="true"][title*="לחץ וגרור לטבלה"]';

test.describe('the demo', () => {
    test('/demo opens a fresh sandbox on the schedule', async ({ managerPage: page }) => {
        await expect(page.getByText('סביבת הדגמה: הנתונים שלך פרטיים ונמחקים אוטומטית אחרי 48 שעות.')).toBeVisible();
        await expect(page.getByText('טיוטה', { exact: true })).toBeVisible();
        await expect(page.locator(sidebarNames)).toHaveCount(TEAM_SIZE);
    });

    test('a signed-out visit to a guarded page goes through /login to a sandbox', async ({ page }) => {
        // The guard sends a signed-out visitor to /login, and the demo's /login sends them to /demo
        const visited: string[] = [];
        page.on('framenavigated', (frame) => {
            if (frame === page.mainFrame()) visited.push(new URL(frame.url()).pathname);
        });

        await page.goto('/employees');

        await expect(page.getByRole('button', { name: 'שיבוץ אוטומטי' })).toBeVisible({ timeout: 30_000 });
        await expect(page.getByText(/^סביבת הדגמה:/)).toBeVisible();
        expect(visited).toEqual(expect.arrayContaining(['/login', '/demo']));
    });

    test("switches to an employee's view and back", async ({ managerPage: page }) => {
        await switchToEmployee(page);

        let menu = await openNavMenu(page);
        await expect(menu.getByRole('menuitem', { name: 'אילוצים' })).toBeVisible();
        await expect(menu.getByRole('menuitem', { name: 'ניהול עובדים' })).toHaveCount(0);
        await page.keyboard.press('Escape');

        await switchToManager(page);

        menu = await openNavMenu(page);
        await expect(menu.getByRole('menuitem', { name: 'ניהול עובדים' })).toBeVisible();
    });

    test('starts over with a fresh sandbox', async ({ managerPage: page }) => {
        await page.getByRole('button', { name: 'התחל מחדש' }).click();
        await expect(page.getByRole('alertdialog', { name: 'להתחיל מחדש?' })).toBeVisible();
        await confirmDialog(page, 'התחלה מחדש');

        await expect(toast(page, 'נוצרה סביבת הדגמה חדשה')).toBeVisible();
        await expect(page.getByRole('button', { name: 'שיבוץ אוטומטי' })).toBeVisible();
    });
});
