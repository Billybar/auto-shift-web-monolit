import re
from bs4 import BeautifulSoup
from typing import Dict, List, Tuple


def parse_yalam_html(html_content: str) -> Dict[int, List[Tuple[int, int]]]:
    """
    Parses Yalam HTML table and extracts employee constraints.
    Returns a dictionary mapping Employee IDs to a list of (day_index, shift_index).
    """
    soup = BeautifulSoup(html_content, 'html.parser')
    employee_constraints = {}

    tbody = soup.find('tbody')
    if not tbody:
        return employee_constraints

    rows = tbody.find_all('tr', recursive=False)

    for row in rows:
        cols = row.find_all('td', recursive=False)
        if len(cols) < 5:
            continue

        raw_id = cols[2].text.strip()
        if not raw_id.isdigit():
            continue

        emp_id = raw_id
        constraints = []

        # Find all red circle icons for constraints (column index 4)
        circles = cols[4].find_all('i', class_='tblCircle')
        for circle in circles:
            match = re.search(r"includes\('(\d{2})'\)", circle.get('ng-if', ''))
            if match:
                code = match.group(1)
                # Convert Yalam format to OR-Tools indices (0-indexed)
                day = int(code[0]) - 1
                shift = int(code[1]) - 1
                constraints.append((day, shift))

        # We add the employee even if the constraints list is empty,
        # as this might mean they cleared their constraints.
        employee_constraints[emp_id] = constraints

    return employee_constraints