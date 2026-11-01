from app.core.enums import ConstraintType
from app.parsers.yalam_parser import parse_yalam_html

CANT = ConstraintType.CANNOT_WORK
WANT = ConstraintType.PREFER_TO

SLOT_NAMES = ["בוקר", "צהריים", "ערב"]
STATE_SUFFIX = {"cant": " — לא יכול", "want": " — מעוניין", "": ""}

# The header row, with the per-day filter chips Yalam renders above the cells
HEADER = (
    '<thead><tr><th class="wac-emp-col">עובד</th>'
    + "".join(
        '<th> יום<div class="wac-headchips">'
        '<span class="wac-chip" title="סנן לא יכול בוקר">ב</span>'
        '<span class="wac-chip" title="סנן לא יכול צהריים">צ</span>'
        '<span class="wac-chip" title="סנן לא יכול ערב">ע</span><!----></div></th>'
        for _ in range(7)
    )
    + "</tr></thead>"
)


def _cell(slot_name: str, state: str) -> str:
    css = f"wac-cell {state}".strip()
    return f'<span class="{css}" title="{slot_name}{STATE_SUFFIX[state]}">{slot_name[0]}</span>'


def _day(states=("", "", ""), absent: bool = False, extra: str = "") -> str:
    """One day cell; `states` holds the morning / noon / evening state ('cant', 'want' or '')."""
    td_attrs = 'class="wac-absent" title="חופשה"' if absent else 'title=""'
    tag = '<span class="wac-abs-tag">ח</span>' if absent else ""
    cells = "".join(_cell(name, state) for name, state in zip(SLOT_NAMES, states))
    return f'<td {td_attrs}>{tag}<!----><div class="wac-cells">{cells}{extra}<!----></div></td>'


def _row(code: str, days=None) -> str:
    days = days if days is not None else [_day() for _ in range(7)]
    return (
        '<tr><td class="wac-emp-col"><i class="bi wac-row-pencil bi-pencil"></i>'
        f'<span class="wac-name" title="">עובד</span><span class="wac-code">{code}</span>'
        '<span class="wac-flags"><i title="אילוץ קבוע" class="bi bi-shield-lock"></i></span></td>'
        + "".join(days) + "<!----></tr>"
    )


def _wrap(*rows: str) -> str:
    return f'<table class="wac-table">{HEADER}<tbody>{"".join(rows)}<!----></tbody></table>'


def test_cant_and_want_cells_map_to_day_slot_and_type():
    days = [_day() for _ in range(7)]
    days[0] = _day(("cant", "cant", ""))
    days[3] = _day(("cant", "", "want"))
    days[6] = _day(("", "want", "cant"))

    assert parse_yalam_html(_wrap(_row("108520", days))) == {
        "108520": [(0, 0, CANT), (0, 1, CANT), (3, 0, CANT), (3, 2, WANT), (6, 1, WANT), (6, 2, CANT)],
    }


def test_employee_without_marks_gets_an_empty_list():
    assert parse_yalam_html(_wrap(_row("90957"))) == {"90957": []}


def test_absent_day_is_cannot_work_on_every_slot():
    days = [_day() for _ in range(7)]
    days[1] = _day(("cant", "cant", "cant"), absent=True)

    assert parse_yalam_html(_wrap(_row("111172", days))) == {
        "111172": [(1, 0, CANT), (1, 1, CANT), (1, 2, CANT)],
    }


def test_unknown_cell_title_is_ignored():
    double = '<span class="wac-cell cant" title="כפולה — לא יכול">כ</span>'
    days = [_day() for _ in range(7)]
    days[2] = _day(("", "", ""), extra=double)

    assert parse_yalam_html(_wrap(_row("105744", days))) == {"105744": []}


def test_rows_without_a_numeric_code_are_skipped():
    html_content = _wrap(_row("abc"), _row("106619"))

    assert parse_yalam_html(html_content) == {"106619": []}


def test_html_without_the_constraints_table_returns_nothing():
    assert parse_yalam_html("<table><tbody><tr><td>1</td></tr></tbody></table>") == {}
