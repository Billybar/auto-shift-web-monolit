import logging
from bs4 import BeautifulSoup
from typing import Dict, List, Tuple

from app.core.enums import ConstraintType

# ===== Initialize the logger for this specific module ======
logger = logging.getLogger(__name__)
# ============================================================

# A cell's title starts with its slot name ("בוקר — לא יכול"); the slot is 0 = morning, 1 = evening,
# 2 = night (see constraints_import_service.SLOT_CATEGORIES). Other cells (e.g. a double shift) are skipped.
TITLE_TO_SLOT = {"בוקר": 0, "צהריים": 1, "ערב": 2}

# A cell's state is in its class; a cell without one means the employee can work
CLASS_TO_TYPE = {"cant": ConstraintType.CANNOT_WORK, "want": ConstraintType.PREFER_TO}


def parse_yalam_html(html_content: str) -> Dict[str, List[Tuple[int, int, ConstraintType]]]:
    """
    Parses the Yalam weekly constraints table (table.wac-table) and extracts employee constraints.
    Returns a dictionary mapping external Employee IDs (as strings) to a list of
    (day_index, shift_slot, constraint_type), where day 0 is Sunday.
    """
    soup = BeautifulSoup(html_content, 'html.parser')
    employee_constraints: Dict[str, List[Tuple[int, int, ConstraintType]]] = {}

    tbody = soup.select_one('table.wac-table tbody')
    if not tbody:
        logger.warning("Could not find the Yalam constraints table. Check the source format.")
        return employee_constraints

    for row in tbody.find_all('tr', recursive=False):
        code = row.select_one('td.wac-emp-col span.wac-code')
        if not code:
            continue

        emp_id = code.get_text(strip=True)
        if not emp_id.isdigit():
            continue

        constraints = []

        # One cell per day, Sunday to Saturday, after the employee cell
        day_cells = [td for td in row.find_all('td', recursive=False) if td.find('div', class_='wac-cells')]
        for day, day_cell in enumerate(day_cells):
            for cell in day_cell.find('div', class_='wac-cells').find_all('span', class_='wac-cell'):
                slot = TITLE_TO_SLOT.get(cell.get('title', '').split('—')[0].strip())
                if slot is None:
                    continue

                classes = cell.get('class', [])
                for css_class, constraint_type in CLASS_TO_TYPE.items():
                    if css_class in classes:
                        constraints.append((day, slot, constraint_type))
                        break

        # We add the employee even if the constraints list is empty,
        # as this might mean they cleared their constraints.
        employee_constraints[emp_id] = constraints

    constraints_count = sum(len(c) for c in employee_constraints.values())
    logger.info(f"Extracted {constraints_count} constraints for {len(employee_constraints)} employees.")

    return employee_constraints
