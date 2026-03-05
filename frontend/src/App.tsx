import React from 'react';

function App() {
  return (
    <div className="flex h-screen w-full bg-gray-100 overflow-hidden font-sans">

      {/* תפריט צד (Sidebar) */}
      <aside className="w-64 bg-slate-800 text-white flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-slate-700">
          <h1 className="text-2xl font-bold tracking-wider text-blue-400">AutoShift</h1>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          <a href="#" className="block px-4 py-3 rounded-md bg-blue-600 text-white shadow">
            סידור משמרות
          </a>
          <a href="#" className="block px-4 py-3 rounded-md text-slate-300 hover:bg-slate-700 hover:text-white transition">
            ניהול עובדים
          </a>
          <a href="#" className="block px-4 py-3 rounded-md text-slate-300 hover:bg-slate-700 hover:text-white transition">
            הגשת אילוצים
          </a>
        </nav>
      </aside>

      {/* אזור התוכן המרכזי (Main Content) */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* סרגל עליון (Topbar) */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-8 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-800">סידור משמרות שבועי</h2>

          <div className="flex items-center space-x-4 space-x-reverse">
            {/* בורר מיקומים (Location Selector) */}
            <select className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2 mr-4">
              <option value="1">הרצליה - סניף ראשי</option>
              <option value="2">תל אביב</option>
            </select>

            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold border border-blue-200">
              אד
            </div>
          </div>
        </header>

        {/* תוכן העמוד המשתנה */}
        <main className="flex-1 p-8 overflow-auto">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 h-full flex items-center justify-center border-dashed border-2">
            <div className="text-center">
              <p className="text-gray-500 text-lg">כאן נבנה את גריד המשמרות (Grid)</p>
              <p className="text-sm text-gray-400 mt-2">שיתממשק מול מנוע האופטימיזציה שבנית</p>
            </div>
          </div>
        </main>

      </div>
    </div>
  );
}

export default App;