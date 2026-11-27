import type { Page } from '@playwright/test';
import { expect, navigateTo, switchToEmployee, test, toast } from './fixtures';

// The grid's day cells; the first cell of each row is its label, not a button
const gridCells = (page: Page) => page.locator('tbody td button');

/** Opens the employee's constraints page and waits until the board can be edited. */
async function openConstraints(page: Page) {
    await navigateTo(page, 'אילוצים');
    await expect(page.getByRole('button', { name: 'שמור אילוצים' })).toBeEnabled();
}

test.describe("the employee's constraints", () => {
    test.beforeEach(async ({ managerPage: page }) => {
        await switchToEmployee(page);
        await openConstraints(page);
    });

    test('a "cannot work" mark and a note are saved for the week', async ({ managerPage: page }) => {
        // The seeded week already has marks: pick the first free cell
        const labels = await gridCells(page).allTextContents();
        const index = labels.indexOf('פנוי');
        expect(index).toBeGreaterThanOrEqual(0);

        await gridCells(page).nth(index).click();
        await expect(gridCells(page).nth(index)).toHaveText('X לא יכול');
        await page.getByLabel('הערות לשבוע זה:').fill('יש לי מבחן ביום רביעי');

        await page.getByRole('button', { name: 'שמור אילוצים' }).click();
        await expect(toast(page, 'האילוצים נשמרו')).toBeVisible();

        await page.reload();
        await expect(page.getByRole('button', { name: 'שמור אילוצים' })).toBeEnabled({ timeout: 30_000 });
        await expect(gridCells(page).nth(index)).toHaveText('X לא יכול');
        await expect(page.getByLabel('הערות לשבוע זה:')).toHaveValue('יש לי מבחן ביום רביעי');
    });

    test('the fixed constraints tab shows the seeded default week', async ({ managerPage: page }) => {
        await page.getByRole('tab', { name: 'אילוצים קבועים' }).click();
        await expect(page.getByRole('button', { name: 'שמור אילוצים קבועים' })).toBeEnabled();
        await expect(page.getByText('האילוצים הקבועים ממלאים כל שבוע שעוד לא נשמר.', { exact: false })).toBeVisible();

        // The first employee's default week: cannot work one Sunday shift, prefers one Tuesday shift
        const rows = page.locator('tbody tr');
        await expect(gridCells(page).filter({ hasText: 'X לא יכול' })).toHaveCount(1);
        await expect(gridCells(page).filter({ hasText: '♥ מעדיף' })).toHaveCount(1);
        // Column 2 is Sunday (column 1 is the row label), column 4 is Tuesday
        await expect(rows.locator('td:nth-child(2) button', { hasText: 'X לא יכול' })).toHaveCount(1);
        await expect(rows.locator('td:nth-child(4) button', { hasText: '♥ מעדיף' })).toHaveCount(1);
    });
});
