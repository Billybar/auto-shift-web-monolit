import re
import logging
from typing import Dict, List, Tuple

# ===== Initialize the logger for this specific module ======
logger = logging.getLogger(__name__)
# ============================================================

# Dictionary mapping Mishmarot.co.il shift types (Tiv) to our optimization engine indexes
# Usually: Morning=0, Afternoon/Evening=1, Night=2
TIV_TO_SHIFT_INDEX = {
    1: 0,  # Morning (tivId: 1)
    3: 1,  # Afternoon (tivId: 3)
    5: 1,  # Evening (tivId: 5)
    4: 2  # Night (tivId: 4)
}


def parse_mishmarot_html(html_content: str) -> Dict[str, List[Tuple[int, int]]]:
    """
    Parses Mishmarot HTML content and extracts employee constraints.
    Returns a dictionary mapping external Employee IDs (as strings)
    to a list of (day_index, shift_index).
    """
    logger.info("Starting to parse Mishmarot HTML content")

    # --- 1. Parse Employees Mapping ---
    # Example: ovedData[1]={ovedId:'105737', ovedName:'Evyatar'...
    oved_dict: Dict[int, str] = {}

    # Extract internal index and the actual employee ID
    for match in re.finditer(r"ovedData\[(\d+)\]=\{ovedId:'(\d+)'", html_content):
        internal_idx = int(match.group(1))
        emp_id = match.group(2)  # Keeping as string to match interface expectations
        oved_dict[internal_idx] = emp_id

    if not oved_dict:
        logger.warning("Could not parse employees from HTML. Check the source format.")
        return {}

    # Initialize constraints dictionary with empty lists for all found employees.
    # We do this so employees who cleared their constraints will have an empty list,
    # which signals the DB to clear their records.
    emp_constraints: Dict[str, List[Tuple[int, int]]] = {emp_id: [] for emp_id in oved_dict.values()}

    # --- 2. Parse 'Red' Constraints (Cannot work) ---
    # Example: ovedpotentialnotokR[1][12] =",1,4,5,";
    constraints_count = 0
    for match in re.finditer(r"ovedpotentialnotokR\[(\d+)\]\[(\d+)\]\s*=\s*\"([^\"]+)\";", html_content):
        # Mishmarot day 1 is Sunday -> OR-Tools day 0
        day = int(match.group(1)) - 1
        internal_idx = int(match.group(2))
        tivs_str = match.group(3)

        if internal_idx not in oved_dict:
            continue

        emp_id = oved_dict[internal_idx]

        # Extract all numbers from strings like ",1,4,5," or "4,5,"
        tivs = [int(x) for x in re.findall(r'\d+', tivs_str)]

        for tiv in tivs:
            if tiv in TIV_TO_SHIFT_INDEX:
                shift_idx = TIV_TO_SHIFT_INDEX[tiv]

                # Check for duplicates before appending (since multiple tivs might map to the same shift_idx)
                if (day, shift_idx) not in emp_constraints[emp_id]:
                    emp_constraints[emp_id].append((day, shift_idx))
                    constraints_count += 1

    logger.info(f"Successfully extracted {constraints_count} constraints for {len(emp_constraints)} active employees.")

    return emp_constraints