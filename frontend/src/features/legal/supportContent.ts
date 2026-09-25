/**
 * Support page content, kept separate from the page layout.
 * SUPPORT_EMAIL must match the contact email set in App Store Connect and Google Play Console.
 */

export const SUPPORT_EMAIL = 'support@autoshift.co.il';

export const SUPPORT_TITLE = 'תמיכה';

export const SUPPORT_INTRO =
  'נתקלתם בבעיה באפליקציה או במערכת AutoShift? אנחנו כאן לעזור. לפני שפונים אלינו, כדאי לעיין בשאלות הנפוצות למטה.';

export interface FaqItem {
  question: string;
  answer: string;
}

export const SUPPORT_FAQ: FaqItem[] = [
  {
    question: 'שכחתי את הסיסמה, מה עושים?',
    answer: 'במסך ההתחברות לחצו על "שכחתי סיסמא", הזינו את כתובת הדוא"ל שלכם וקבלו קוד אימות לאיפוס הסיסמה.',
  },
  {
    question: 'איך מגישים אילוצים?',
    answer: 'באפליקציה עברו ללשונית האילוצים, בחרו את השבוע הרצוי, סמנו את המשמרות שבהן אינכם יכולים לעבוד ולחצו על "שמור אילוצים".',
  },
  {
    question: 'יש לי שאלה על סידור העבודה או על משמרת ששובצתי אליה',
    answer: 'סידור העבודה נקבע על ידי מנהל הסידור בארגון שלכם. לשאלות על שיבוצים, החלפות משמרות ובקשות מיוחדות יש לפנות אליו ישירות.',
  },
  {
    question: 'איך מבקשים למחוק את החשבון או את המידע שלי?',
    answer: 'החשבון נפתח על ידי המעסיק שלכם, ולכן בקשת מחיקה יש להפנות אליו.',
  },
];
