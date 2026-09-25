import React from 'react';
import { Link } from 'react-router-dom';
import {
  LAST_UPDATED,
  PRIVACY_POLICY_INTRO,
  PRIVACY_POLICY_SECTIONS,
  PRIVACY_POLICY_TITLE,
} from './privacyPolicyContent';

/**
 * Public privacy policy page (/privacy).
 * Rendered outside ProtectedRoute and without app chrome, so it is reachable
 * anonymously from the app stores and from the mobile in-app browser.
 */
const PrivacyPolicyPage: React.FC = () => {
  return (
    <div dir="rtl" className="min-h-screen bg-gray-50 font-sans">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-6 py-4">
          <Link to="/" className="text-2xl font-extrabold text-gray-900 tracking-tight">
            AutoShift
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">{PRIVACY_POLICY_TITLE}</h1>
        <p className="text-sm text-gray-500 mb-8">עודכן לאחרונה: {LAST_UPDATED}</p>

        <p className="text-gray-700 leading-relaxed mb-8">{PRIVACY_POLICY_INTRO}</p>

        <div className="space-y-8">
          {PRIVACY_POLICY_SECTIONS.map((section) => (
            <section key={section.title}>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">{section.title}</h2>

              {section.paragraphs?.map((paragraph) => (
                <p key={paragraph} className="text-gray-700 leading-relaxed mb-3">
                  {paragraph}
                </p>
              ))}

              {section.bullets && (
                <ul className="list-disc pr-6 space-y-2 text-gray-700 leading-relaxed">
                  {section.bullets.map((bullet) => (
                    <li key={bullet.label}>
                      <span className="font-semibold text-gray-900">{bullet.label}:</span> {bullet.text}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </main>
    </div>
  );
};

export default PrivacyPolicyPage;
