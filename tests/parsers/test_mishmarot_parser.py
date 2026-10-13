from app.parsers.mishmarot_parser import parse_mishmarot_notes


def _oved_entry(idx: int, oved_id: str, is_cycle: str, comments: str) -> str:
    """Builds a single ovedData entry in the same shape Mishmarot exports it."""
    return (
        f"ovedData[{idx}]={{ovedId:'{oved_id}', ovedName:'עובד {idx}', "
        f"constrainsIsCycle:{is_cycle},comments: '{comments}', birthDate:'1/1/2079', "
        f"isActiveEndDep:'', mainDepId:'37', remark:'', shiftAmount: [-1,0,0], "
        f"sivugim: [93,41,], tivHagbalotOptions: []}};"
    )


def _wrap(*entries: str) -> str:
    return "<script>var ovedData = new Array(13);" + "".join(entries) + "</script>"


def test_br_and_html_entities_are_converted():
    html_content = _wrap(
        _oved_entry(1, "325108751", "false", "שורה ראשונה <br>שורה שנייה &#128591;&#127996;<br>"),
    )

    notes = parse_mishmarot_notes(html_content)

    assert notes["325108751"] == "שורה ראשונה\nשורה שנייה 🙏🏼"


def test_cycle_marker_only_yields_no_note():
    html_content = _wrap(_oved_entry(1, "105737", "true", "*מחזורי"))

    assert parse_mishmarot_notes(html_content) == {"105737": None}


def test_cycle_marker_is_dropped_but_text_is_kept():
    html_content = _wrap(_oved_entry(1, "105737", "true", "*מחזורי לא יכול ביום שלישי"))

    assert parse_mishmarot_notes(html_content)["105737"] == "לא יכול ביום שלישי"


def test_star_prefix_is_kept_for_non_cycle_employee():
    html_content = _wrap(_oved_entry(1, "112662", "false", "*חשוב* רק בוקר"))

    assert parse_mishmarot_notes(html_content)["112662"] == "*חשוב* רק בוקר"


def test_empty_comment_and_null_cycle_flag():
    html_content = _wrap(_oved_entry(9, "111432", "null", ""))

    assert parse_mishmarot_notes(html_content) == {"111432": None}


def test_every_employee_is_returned_and_ids_stay_strings():
    html_content = _wrap(
        _oved_entry(1, "106252", "false", ""),
        _oved_entry(2, "323868125", "false", "רוצה לפחות 3 משמרות"),
        _oved_entry(3, "0101", "true", "*מחזורי"),
    )

    notes = parse_mishmarot_notes(html_content)

    assert notes == {
        "106252": None,
        "323868125": "רוצה לפחות 3 משמרות",
        "0101": None,
    }
