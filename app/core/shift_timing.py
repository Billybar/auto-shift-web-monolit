"""
Shift hours as the engine reads them: a shift's category and the rest between two shifts come
only from its start and end times, never from its name or its place in the list.

The work day runs 04:00 → 04:00, so a shift that starts before 04:00 (e.g. 00:00–08:00 in
Sunday's column) is the night after its day and starts 24 hours later than its clock time.
Times are minutes after 00:00 of the shift's day.
"""
import re
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Optional, Tuple

from app.core.enums import ShiftCategory

MINUTES_PER_DAY = 24 * 60

# Category by start time: morning from 04:00, evening from 12:00, night from 21:00 until 04:00
DAY_START = 4 * 60
EVENING_START = 12 * 60
NIGHT_START = 21 * 60

# Rest between two shifts: less than MIN_REST is forbidden, less than SHORT_REST is penalized
MIN_REST = 7 * 60 + 45
SHORT_REST = 10 * 60

# The most days an employee works in a row, counting the end of the previous week
MAX_WORK_STREAK = 6

# "7:00", "07:00" or "07:00:00" (seconds are ignored); "24:00" means midnight
_CLOCK = re.compile(r'(\d{1,2}):(\d{2})(?::\d{2})?')


class InvalidShiftHours(ValueError):
    """A shift whose start or end time doesn't parse, or that starts and ends at the same time."""

    def __init__(self, shift_id: Optional[int], shift_name: Optional[str]):
        super().__init__(f"Shift {shift_id} ({shift_name!r}) has invalid hours")
        self.shift_id = shift_id
        self.shift_name = shift_name


@dataclass(frozen=True)
class ShiftTiming:
    shift_id: int
    # Minutes after 00:00 of the shift's day: 240 (04:00) to 1679 (27:59, a 03:59 start)
    start: int
    # Minutes, 1 to 1439
    duration: int
    category: ShiftCategory

    @property
    def end(self) -> int:
        return self.start + self.duration


@dataclass(frozen=True)
class RestRules:
    """
    (first_shift_id, second_shift_id, day_offset): working `first` on day d and `second` on day
    d + day_offset leaves too little rest between them. Pairs on the same day are not listed,
    since an employee works at most one shift a day.
    """
    # Less than MIN_REST, overlaps included
    hard: List[Tuple[int, int, int]] = field(default_factory=list)
    # At least MIN_REST, less than SHORT_REST
    soft: List[Tuple[int, int, int]] = field(default_factory=list)


def parse_clock(value: Any) -> int:
    """Minutes after midnight of an HH:MM time. Raises ValueError for anything else."""
    match = _CLOCK.fullmatch(value.strip()) if isinstance(value, str) else None
    if not match:
        raise ValueError(f"{value!r} is not an HH:MM time")
    hours, minutes = int(match.group(1)), int(match.group(2))
    if (hours, minutes) == (24, 0):
        return 0
    if hours > 23 or minutes > 59:
        raise ValueError(f"{value!r} is not an HH:MM time")
    return hours * 60 + minutes


def normalize_clock(value: Any) -> Any:
    """The HH:MM form of a time ('7:00' -> '07:00'). Anything but a string is returned as is."""
    if not isinstance(value, str):
        return value
    try:
        minutes = parse_clock(value)
    except ValueError:
        raise ValueError("time must be HH:MM, e.g. 07:00") from None
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def category_of(clock_start: int) -> ShiftCategory:
    """The category of a shift that starts `clock_start` minutes after midnight."""
    if DAY_START <= clock_start < EVENING_START:
        return ShiftCategory.MORNING
    if EVENING_START <= clock_start < NIGHT_START:
        return ShiftCategory.EVENING
    return ShiftCategory.NIGHT


def timing_of(shift: Any) -> ShiftTiming:
    """
    The timing of a ShiftDefinition (anything with id, name, start_time and end_time).
    Raises InvalidShiftHours when a time doesn't parse or the shift starts and ends at the same time.
    """
    try:
        clock_start = parse_clock(shift.start_time)
        clock_end = parse_clock(shift.end_time)
    except ValueError:
        raise InvalidShiftHours(shift.id, shift.name) from None
    duration = (clock_end - clock_start) % MINUTES_PER_DAY
    if duration == 0:
        raise InvalidShiftHours(shift.id, shift.name)
    start = clock_start if clock_start >= DAY_START else clock_start + MINUTES_PER_DAY
    return ShiftTiming(shift_id=shift.id, start=start, duration=duration, category=category_of(clock_start))


def placement_span(timing: ShiftTiming, start_time: Optional[str], end_time: Optional[str]) -> Tuple[int, int]:
    """
    (start, end) in minutes after 00:00 of the placement's day: the shift's hours, with the row's
    start/end override applied where one is set. An override that doesn't parse is ignored.
    """
    start, end = timing.start, timing.end
    if start_time:
        try:
            clock_start = parse_clock(start_time)
            start = clock_start if clock_start >= DAY_START else clock_start + MINUTES_PER_DAY
        except ValueError:
            pass
    if end_time:
        try:
            clock_end = parse_clock(end_time)
            # The end is the first time at that clock after the start; an end equal to the start keeps the shift's
            duration = (clock_end - start) % MINUTES_PER_DAY
            if duration:
                end = start + duration
        except ValueError:
            pass
    elif start != timing.start:
        end = start + timing.duration
    return start, end


def try_timing(shift: Any) -> Optional[ShiftTiming]:
    """Like timing_of, but None for a shift with invalid hours."""
    try:
        return timing_of(shift)
    except InvalidShiftHours:
        return None


def build_timings(shifts: Iterable[Any]) -> Dict[int, ShiftTiming]:
    """shift_id -> timing. Raises InvalidShiftHours for the first shift with invalid hours."""
    return {shift.id: timing_of(shift) for shift in shifts}


def rest_rules(timings: Iterable[ShiftTiming]) -> RestRules:
    """Every pair of shifts on different days with less than SHORT_REST between them."""
    timings = list(timings)
    hard: List[Tuple[int, int, int]] = []
    soft: List[Tuple[int, int, int]] = []
    if not timings:
        return RestRules()
    earliest_start = min(t.start for t in timings)
    latest_end = max(t.end for t in timings)
    day_offset = 1
    # Once even the earliest start is SHORT_REST after the latest end, further days can't conflict
    while day_offset * MINUTES_PER_DAY + earliest_start - latest_end < SHORT_REST:
        for first in timings:
            for second in timings:
                rest = day_offset * MINUTES_PER_DAY + second.start - first.end
                if rest < MIN_REST:
                    hard.append((first.shift_id, second.shift_id, day_offset))
                elif rest < SHORT_REST:
                    soft.append((first.shift_id, second.shift_id, day_offset))
        day_offset += 1
    return RestRules(hard=hard, soft=soft)


def display_key(shift: Any) -> Tuple[int, int]:
    """Sort key in the order of the work day (morning, evening, night); invalid hours go last."""
    timing = try_timing(shift)
    return (timing.start if timing else 2 * MINUTES_PER_DAY, shift.id)
