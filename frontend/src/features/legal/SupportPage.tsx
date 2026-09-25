import React from 'react';
import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { SUPPORT_EMAIL, SUPPORT_FAQ, SUPPORT_INTRO, SUPPORT_TITLE } from './supportContent';

/**
 * Public support page (/support), used as the App Store / Google Play support URL.
 * Rendered outside ProtectedRoute and without app chrome, like PrivacyPolicyPage.
 */
const SupportPage: React.FC = () => {
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
        <h1 className="text-3xl font-bold text-gray-900 mb-4">{SUPPORT_TITLE}</h1>
        <p className="text-gray-700 leading-relaxed mb-8">{SUPPORT_INTRO}</p>

        {/* Contact */}
        <section className="bg-white rounded-xl border border-gray-200 p-6 mb-10">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">צרו קשר</h2>
          <p className="text-gray-700 leading-relaxed mb-4">
            לתמיכה טכנית ובעיות באפליקציה, שלחו לנו דוא"ל ונחזור אליכם בהקדם.
          </p>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Mail className="w-4 h-4" />
            {SUPPORT_EMAIL}
          </a>
        </section>

        {/* FAQ */}
        <h2 className="text-xl font-semibold text-gray-900 mb-4">שאלות נפוצות</h2>
        <div className="space-y-6">
          {SUPPORT_FAQ.map((item) => (
            <section key={item.question}>
              <h3 className="font-semibold text-gray-900 mb-1">{item.question}</h3>
              <p className="text-gray-700 leading-relaxed">{item.answer}</p>
            </section>
          ))}
        </div>

        <p className="text-sm text-gray-500 mt-10">
          <Link to="/privacy" className="hover:text-gray-700 hover:underline">
            מדיניות פרטיות
          </Link>
        </p>
      </main>
    </div>
  );
};

export default SupportPage;
