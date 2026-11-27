import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithProviders } from '@/test/renderWithProviders';
import PrivacyPolicyPage from './PrivacyPolicyPage';
import { LAST_UPDATED, PRIVACY_POLICY_INTRO, PRIVACY_POLICY_SECTIONS, PRIVACY_POLICY_TITLE } from './privacyPolicyContent';
import SupportPage from './SupportPage';
import { SUPPORT_EMAIL, SUPPORT_FAQ, SUPPORT_INTRO, SUPPORT_TITLE } from './supportContent';

// Both pages are public: they render for a signed-out visitor, straight from their content modules

describe('PrivacyPolicyPage', () => {
    it('shows the title, the update date and the intro', () => {
        renderWithProviders(<PrivacyPolicyPage />, { user: null, route: '/privacy' });

        expect(screen.getByRole('heading', { level: 1, name: PRIVACY_POLICY_TITLE })).toBeInTheDocument();
        expect(screen.getByText(`עודכן לאחרונה: ${LAST_UPDATED}`)).toBeInTheDocument();
        expect(screen.getByText(PRIVACY_POLICY_INTRO)).toBeInTheDocument();
    });

    it('shows every section with its paragraphs and bullets', () => {
        renderWithProviders(<PrivacyPolicyPage />, { user: null, route: '/privacy' });

        expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(PRIVACY_POLICY_SECTIONS.length);
        for (const section of PRIVACY_POLICY_SECTIONS) {
            expect(screen.getByRole('heading', { level: 2, name: section.title })).toBeInTheDocument();
            for (const paragraph of section.paragraphs ?? []) {
                expect(screen.getByText(paragraph)).toBeInTheDocument();
            }
            for (const bullet of section.bullets ?? []) {
                expect(screen.getByText(`${bullet.label}:`).closest('li')).toHaveTextContent(bullet.text);
            }
        }
    });

    it('links the logo home', () => {
        renderWithProviders(<PrivacyPolicyPage />, { user: null, route: '/privacy' });

        expect(screen.getByRole('link', { name: 'AutoShift' })).toHaveAttribute('href', '/');
    });
});

describe('SupportPage', () => {
    it('shows the title, the intro and the support email', () => {
        renderWithProviders(<SupportPage />, { user: null, route: '/support' });

        expect(screen.getByRole('heading', { level: 1, name: SUPPORT_TITLE })).toBeInTheDocument();
        expect(screen.getByText(SUPPORT_INTRO)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: SUPPORT_EMAIL })).toHaveAttribute('href', `mailto:${SUPPORT_EMAIL}`);
    });

    it('answers every question', () => {
        renderWithProviders(<SupportPage />, { user: null, route: '/support' });

        expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(SUPPORT_FAQ.length);
        for (const { question, answer } of SUPPORT_FAQ) {
            expect(screen.getByRole('heading', { level: 3, name: question })).toBeInTheDocument();
            expect(screen.getByText(answer)).toBeInTheDocument();
        }
    });

    it('links the privacy policy', () => {
        renderWithProviders(<SupportPage />, { user: null, route: '/support' });

        expect(screen.getByRole('link', { name: 'מדיניות פרטיות' })).toHaveAttribute('href', '/privacy');
    });
});
