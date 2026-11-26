import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { importConstraintsFromHtml } from '@/api/constraints';
import { notify } from '@/lib/notify';
import { apiError } from '@/test/apiErrors';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { ImportConstraintsResult } from '@/types';
import ImportConstraintsModal from './ImportConstraintsModal';

vi.mock('@/api/constraints', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/constraints')>()),
    importConstraintsFromHtml: vi.fn(),
}));

const WEEK = '2026-11-01';
const CLEAN: ImportConstraintsResult = {
    status: 'success', processed_employees_count: 3, imported_notes_count: 2, missing_employees_ids: [],
};

const htmlFile = () => new File(['<html></html>'], 'x.html', { type: 'text/html' });

const renderModal = () => {
    const onClose = vi.fn();
    const rendered = renderWithProviders(<ImportConstraintsModal locationId={5} onClose={onClose} />);
    return { ...rendered, onClose };
};

/** Picks Mishmarot, the week and an HTML file, then imports. */
const importFile = async (user: ReturnType<typeof renderModal>['user']) => {
    const file = htmlFile();
    await user.selectOptions(screen.getByLabelText('מקור הנתונים'), 'mishmarot');
    fireEvent.change(screen.getByLabelText('תאריך תחילת שבוע (ראשון)'), { target: { value: WEEK } });
    await user.upload(screen.getByLabelText('קובץ HTML'), file);
    await user.click(screen.getByRole('button', { name: 'ייבא עכשיו' }));
    return file;
};

describe('ImportConstraintsModal', () => {
    beforeEach(() => {
        vi.mocked(importConstraintsFromHtml).mockResolvedValue(CLEAN);
    });

    it('needs a file before it can import', () => {
        renderModal();

        expect(screen.getByRole('dialog', { name: 'ייבוא אילוצים ממערכת חיצונית' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'ייבא עכשיו' })).toBeDisabled();
    });

    it('refuses a file that is not an HTML export', () => {
        renderModal();

        // The input's accept would hide this file from userEvent's upload
        fireEvent.change(screen.getByLabelText('קובץ HTML'), { target: { files: [new File(['x'], 'x.txt')] } });

        expect(screen.getByText('יש לבחור קובץ HTML (סיומת ‎.html או ‎.htm).')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'ייבא עכשיו' })).toBeDisabled();
    });

    it('shows the picked file', async () => {
        const { user } = renderModal();

        await user.upload(screen.getByLabelText('קובץ HTML'), htmlFile());

        expect(screen.getByText('קובץ נבחר: x.html')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'ייבא עכשיו' })).toBeEnabled();
    });

    it('imports the week, reports it and closes', async () => {
        const { user, onClose } = renderModal();

        const file = await importFile(user);

        await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
        expect(importConstraintsFromHtml).toHaveBeenCalledWith(file, 'mishmarot', WEEK, 5);
        expect(notify.success).toHaveBeenCalledWith('האילוצים יובאו', 'עודכנו אילוצים עבור 3 עובדים ו-2 הערות.');
    });

    it('lists the employees of the file it could not link', async () => {
        vi.mocked(importConstraintsFromHtml).mockResolvedValue({ ...CLEAN, missing_employees_ids: ['111', '222'] });
        const { user, onClose } = renderModal();

        await importFile(user);

        expect(await screen.findByText('האילוצים יובאו חלקית')).toBeInTheDocument();
        const warning = screen.getByText('2 עובדים מהקובץ לא יובאו').closest('[role="alert"]') as HTMLElement;
        expect(within(warning).getByText('111')).toBeInTheDocument();
        expect(warning).toHaveTextContent('מזהה ה-Mishmarot');
        expect(notify.success).not.toHaveBeenCalled();
        expect(onClose).not.toHaveBeenCalled();

        // The X and the footer button
        const [, footerClose] = screen.getAllByRole('button', { name: 'סגירה' });
        await user.click(footerClose);
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('says when nobody in the file was found', async () => {
        vi.mocked(importConstraintsFromHtml).mockResolvedValue({ ...CLEAN, processed_employees_count: 0 });
        const { user } = renderModal();

        await importFile(user);

        expect(await screen.findByText('לא נמצאו עובדים בקובץ')).toBeInTheDocument();
        expect(screen.getByText(/שיוצא מ-Mishmarot/)).toBeInTheDocument();
        expect(screen.queryByText('האילוצים יובאו חלקית')).not.toBeInTheDocument();
    });

    it('explains a refused import and stays open', async () => {
        vi.mocked(importConstraintsFromHtml).mockRejectedValue(apiError(400, 'import_no_shift_definitions'));
        const { user, onClose } = renderModal();

        await importFile(user);

        expect(await screen.findByText('הייבוא נכשל')).toBeInTheDocument();
        expect(screen.getByText('לא הוגדרו משמרות לאתר זה. הגדר משמרות לפני ייבוא אילוצים.')).toBeInTheDocument();
        expect(onClose).not.toHaveBeenCalled();
    });

    it('cancels', async () => {
        const { user, onClose } = renderModal();

        await user.click(screen.getByRole('button', { name: 'ביטול' }));

        expect(onClose).toHaveBeenCalledOnce();
    });
});
