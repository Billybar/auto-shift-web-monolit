# AutoShift demo: a 10-minute tour

AutoShift builds a week of shifts for a team automatically. The manager sets how many people each shift needs, the employees mark when they can and can't work, and an optimization engine fills the week in under a second while keeping labor rules and being fair.

**Open the demo: [demo.autoshift.co.il/demo](https://demo.autoshift.co.il/demo)**

You don't need to sign up. You get a private copy of a sample business that only you can see, deleted automatically after 48 hours.

The app is built for Israeli businesses, so the screens are in Hebrew and read right to left. This guide gives the Hebrew label of each button you'll click, with its meaning.

## What's in your copy

A branch (סניף ראשי) with 12 employees and a manager, רותם ברק, who works shifts too. The week runs Sunday to Saturday.

| Shift | Hebrew | Hours |
|---|---|---|
| Morning guard | בוקר מאבטח | 07:00–15:00 |
| Morning supervisor | בוקר אחמש | 07:00–15:00 |
| Evening guard | ערב מאבטח | 15:00–23:00 |
| Evening supervisor | ערב אחמש | 15:00–23:00 |
| Night guard | לילה מאבטח | 23:00–07:00 |
| Night supervisor | לילה אחמש | 23:00–07:00 |

- **Roles:** general staff, and shift supervisor (אחמ"ש). Each supervisor shift needs one supervisor, and only six people hold that role: five employees and the manager.
- **Demand:** on weekdays, the morning and evening guard shifts need 2 general staff and the night guard shift needs 1; on Friday and Saturday every guard shift needs 1.
- **Constraints board:** employees mark morning, evening and night once each. A mark covers both the guard and the supervisor shift of that time.
- **Availability:** most employees have already submitted next week's constraints: shifts they can't work, shifts they prefer, and some shifts the manager requires them to work. רוני שפירא and הדר שלום never submitted, so auto-assign works from their default weeks.

The yellow bar at the top appears only in the demo:

| Button | Meaning |
|---|---|
| צפה כעובד / צפה כמנהל | View as an employee / View as the manager |
| התחל מחדש | Start over with a fresh copy |

## 1. Generate next week's schedule

You start as the manager, on the weekly schedule (סידור שבועי) for next week. It's a draft (טיוטה), so employees can't see it yet. Shifts are rows, days are columns, and each cell has a slot for each person the shift needs. The first, greyed column is last Saturday: it's read-only and shows who worked just before the week starts, such as a Saturday night shift that limits who can work Sunday morning.

Click **שיבוץ אוטומטי** (Auto-assign). In under a second every slot is filled, and a message says **נמצא שיבוץ אופטימלי** (Optimal schedule found), with a penalty score where lower is better.

The engine never breaks these rules:
- Nobody works a shift they marked as unavailable, and everyone works the shifts the manager required.
- People fill only roles they hold, so every shift has a qualified supervisor.
- At most one shift a day, at least 8 hours of rest between shifts (also across the end of the previous week), and no more than 6 days in a row.
- Each employee's minimum and maximum shifts for the week.

Within those rules, it looks for the schedule with the fewest penalties:
- Give people the shifts they prefer.
- Keep each person close to their shift target, and within their limits on mornings, evenings and nights.
- Avoid short rests of 8 to 10 hours (an evening, then the next morning) and 3 nights in a row.
- Keep people in their main role.

## 2. See why each person got their shifts

On the right is the team list. Hover the number next to a name (that's their shift count for the week) to see their week: red for can't work, blue for prefers, green for must work, and a check mark on each assigned shift.

## 3. Change it by hand

Hover an assigned name and click × (הסר עובד) to remove them, then drag a name from the team list into the empty slot. To change how many people a shift needs this week only, click − on an empty slot, or hover a blank spot in a cell and click +.

To change someone's availability, click the number next to their name: their constraints for the week open in a popup. Edit them, click **שמור אילוצים** (Save constraints), then run **שיבוץ אוטומטי** (Auto-assign) again to use them.

Now click **בדיקת סידור** (Check schedule). It checks the board against the same rules the engine never breaks. Try dragging someone into a shift they marked as unavailable: the check lists the problem and marks the card in red.

## 4. Publish it

Click **פרסום** (Publish), then confirm. The schedule is saved and the badge changes to **פורסם** (Published). Employees can see their shifts now. **ביטול פרסום** (Unpublish) hides it again.

## 5. See it as an employee

Click **צפה כעובד** (View as an employee) in the yellow bar. You're now יוסי כהן, an employee:

- The schedule shows the week you just published. Before publishing, an employee sees only "not published yet".
- The menu (AutoShift, top right) has fewer pages: employees can't manage the team or the settings.
- Open **אילוצים** (Constraints). This is where employees submit their availability. Click a cell to cycle it: פנוי (available), then לא יכול (can't), then מעדיף (prefer). Add a note under הערות לשבוע זה (notes for this week), and click **שמור אילוצים** (Save constraints).
- Switch to **אילוצים קבועים** (Fixed constraints) at the top of the board. This is your default week: יוסי can't work Sunday mornings and prefers Tuesday evenings. Every week you haven't saved starts from it, and auto-assign respects it even if you never open the app. Click **שמור אילוצים קבועים** (Save fixed constraints) to change it. The two seeded weeks already have saved constraints, so set **תאריך תחילת שבוע** (week start date) two weeks later to see a week filled from the defaults. A week you saved or the manager published keeps what it had.

Click **צפה כמנהל** (View as the manager) to switch back. Run auto-assign again and the engine works from the availability you just changed.

As the manager you also have your own **אילוצים** page, since you work shifts too. A manager can mark a shift **חייב** (must work) as well, which employees can't.

## 6. Tune what matters

Click **כיוונון השיבוץ** (Tune scheduling). Each slider sets how much the engine cares about a rule, from **לא להתחשב** (ignore) to **הימנע ככל הניתן** (avoid as much as possible). For example, set **העדפת עובד** (employee preferences) to the maximum and run auto-assign again to see more people get the shifts they prefer.

## 7. Try to break it

Open the menu, go to **הגדרות אתר** (Site settings), then the **תקן שבועי** (Weekly demand) tab. Ask for far more people than the team has, for example 10 general staff on Friday morning, and click **שמירה** (Save).

Back on the schedule, run auto-assign. The engine still returns the best schedule it can, and a warning lists the slots that stayed empty, by role and day.

## More to explore

- **ניהול עובדים** (Employees): add an employee (הוספת עובד), give them roles, and set their weekly limits.
- **הגדרות אתר** (Site settings): add a role in **תפקידים** (Roles); group shifts that employees mark together in **שורות בלוח האילוצים** (Constraint board rows).
- The arrows next to the week change it. The week after next has constraints too.
- **התחל מחדש** (Start over) gives you a fresh copy whenever you want.

## How it's built

- **Engine:** Google OR-Tools CP-SAT. It solves in two steps: first fill as many slots as possible, then lower the weighted penalties without leaving more slots empty.
- **Backend:** Python, FastAPI, SQLAlchemy and PostgreSQL. Every organization is a separate tenant, and every request is scoped to the user's locations.
- **Web:** React 19, TypeScript, Vite and Tailwind. There is also a mobile app built with Expo (React Native).
- **This demo:** a separate deployment with its own database. Each visitor gets a new tenant, seeded in one transaction and deleted automatically after 48 hours.

The code and setup instructions are in the [README](../README.md).
