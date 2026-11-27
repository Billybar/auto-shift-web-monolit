import type { Page } from '@playwright/test';
import { confirmDialog, expect, navigateTo, switchToEmployee, switchToManager, test, toast } from './fixtures';

// An empty slot of the week's demand carries a "הסר עמדה" (−) button; a filled board has none
const emptySlotButtons = (page: Page) => page.getByRole('button', { name: 'הסר עמדה' });

/** A board chip of this employee: its tooltip is the full name (no issues, not above demand). */
const boardChip = (page: Page, fullName: string) => page.locator(`td [title="${fullName}"]`);

/** Runs the engine and waits for its answer; the caller asserts the outcome. */
async function autoAssign(page: Page) {
    // Under a parallel run the solve can take several seconds, past the default assertion timeout
    const solved = page.waitForResponse((r) => r.url().includes('/api/assignments/auto-generate/'), { timeout: 30_000 });
    await page.getByRole('button', { name: 'שיבוץ אוטומטי' }).click();
    await solved;
}

/** Saves the board through the toolbar and its confirm dialog. */
async function saveBoard(page: Page) {
    await page.getByRole('button', { name: 'שמירה', exact: true }).click();
    await confirmDialog(page, 'שמירה');
    await expect(toast(page, 'הסידור נשמר')).toBeVisible();
}

async function reloadBoard(page: Page) {
    await page.reload();
    await expect(page.getByRole('button', { name: 'שיבוץ אוטומטי' })).toBeVisible({ timeout: 30_000 });
}

test.describe('the schedule (manager)', () => {
    test('auto-assign fills every slot, and the check finds no violations', async ({ managerPage: page }) => {
        await expect(emptySlotButtons(page).first()).toBeVisible();

        await autoAssign(page);

        await expect(toast(page, 'נמצא שיבוץ אופטימלי')).toBeVisible();
        await expect(emptySlotButtons(page)).toHaveCount(0);

        await page.getByRole('button', { name: 'בדיקת סידור' }).click();
        await expect(toast(page, 'לא נמצאו הפרות')).toBeVisible();
    });

    test('publishes the week to the employees, and takes it back', async ({ managerPage: page }) => {
        await autoAssign(page);
        await expect(emptySlotButtons(page)).toHaveCount(0);

        await page.getByRole('button', { name: 'פרסום', exact: true }).click();
        await expect(page.getByRole('alertdialog', { name: 'לפרסם את הסידור?' })).toBeVisible();
        await confirmDialog(page, 'פרסום');
        await expect(page.getByText('פורסם', { exact: true })).toBeVisible();

        // The employee sees the published shifts, read-only
        await switchToEmployee(page);
        await expect(page.locator('td [title]').first()).toBeVisible();
        await expect(page.getByText('הסידור לשבוע זה טרם פורסם')).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'הסר עובד' })).toHaveCount(0);

        await switchToManager(page);
        await page.getByRole('button', { name: 'ביטול פרסום' }).click();
        await confirmDialog(page, 'החזרה לטיוטה');
        await expect(page.getByText('טיוטה', { exact: true })).toBeVisible();

        await switchToEmployee(page);
        await expect(page.getByText('הסידור לשבוע זה טרם פורסם')).toBeVisible();
    });

    test('a name dragged from the team list into an empty slot is saved, and so is its removal', async ({ managerPage: page }) => {
        // The sidebar chip's tooltip is "<full name>\n<drag hint>"
        const sidebarChip = page.locator('[draggable="true"][title*="לחץ וגרור לטבלה"]').first();
        const fullName = (await sidebarChip.getAttribute('title'))!.split('\n')[0];
        const emptySlotCount = await emptySlotButtons(page).count();
        await expect(boardChip(page, fullName)).toHaveCount(0);

        const emptySlot = page.locator('td').filter({ has: emptySlotButtons(page) }).first();
        await sidebarChip.dragTo(emptySlot);

        await expect(boardChip(page, fullName)).toHaveCount(1);
        await expect(emptySlotButtons(page)).toHaveCount(emptySlotCount - 1);

        await saveBoard(page);
        await reloadBoard(page);
        await expect(boardChip(page, fullName)).toHaveCount(1);

        // The remove button shows on hover
        const chip = boardChip(page, fullName);
        await chip.hover();
        await chip.getByRole('button', { name: 'הסר עובד' }).click();
        await expect(boardChip(page, fullName)).toHaveCount(0);

        await saveBoard(page);
        await reloadBoard(page);
        await expect(boardChip(page, fullName)).toHaveCount(0);
        await expect(emptySlotButtons(page)).toHaveCount(emptySlotCount);
    });

    test("hovering an employee's shift count shows their week", async ({ managerPage: page }) => {
        const countButton = page.getByRole('button', { name: /^לחיצה לעריכת אילוצים: / }).first();
        const fullName = (await countButton.getAttribute('aria-label'))!.replace('לחיצה לעריכת אילוצים: ', '');

        await countButton.hover();

        const card = page.locator('[data-radix-popper-content-wrapper]').filter({ hasText: fullName });
        await expect(card).toBeVisible();
        await expect(card.getByRole('columnheader', { name: 'משמרת' })).toBeVisible();
    });

    test('more demand than the team can cover leaves empty slots, and auto-assign says so', async ({ managerPage: page }) => {
        await navigateTo(page, 'הגדרות אתר');
        await page.getByRole('tab', { name: 'תקן שבועי' }).click();

        // The first shift, first role, Sunday, from its seeded value up to 10: one step per click
        const addOne = page.getByRole('button', { name: /^הוספה: / }).first();
        const cell = page.locator('td').filter({ has: page.getByRole('button', { name: /^הוספה: / }) }).first();
        const seeded = Number(await cell.textContent());
        for (let value = seeded; value < 10; value++) {
            await addOne.click();
        }
        await expect(cell).toHaveText('10');
        await page.getByRole('button', { name: 'שמירה', exact: true }).click();
        await expect(toast(page, 'התקן השבועי נשמר')).toBeVisible();

        await navigateTo(page, 'סידור שבועי');
        await autoAssign(page);

        await expect(page.getByText('השיבוץ הושלם, אבל חלק מהעמדות נשארו ריקות')).toBeVisible();
        await expect(emptySlotButtons(page).first()).toBeVisible();
    });
});
