"""
Zero-Trust Security Layer for azbooks-analytics.
Guarantees projection boundaries, blacklists sensitive tables,
and rejects unsanitized inputs.
"""

import re
from typing import Set

# Whitelist: Only tables relevant for analytical convolutions
ALLOWED_ANALYTICAL_TABLES: Set[str] = {
    "orders_order",
    "orders_orderitem",
    "inventory_product",
    "inventory_category",
    "inventory_vendor",
    "inventory_stockhistory",
    "inventory_stockadjustment",
    "customers_customer",
    "customers_address",
    "customers_geographicregion",
    "customers_customergroup",
    "analytics_analysisfolder",
    "analytics_savedanalysis",
    "analytics_discoverysegment",
    "analytics_pipelinetransferlog",
    "orders_return",
    "orders_returnitem",
    "orders_returnreason",
}

# Blacklist: Absolute permanent quarantine.
BLOCKED_SENSITIVE_TABLES: Set[str] = {
    "account_user",
    "account_authtoken",
    "account_emailverification",
    "account_activitylog",
    "finance_employeesalary",
    "finance_salarypayment",
    "customers_legacydebt",
    "customers_wallet",
    "customers_wallettransaction",
    "django_session",
    "authtoken_token",
}

IDENTIFIER_REGEX = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")


class SecurityViolation(Exception):
    pass


def validate_table_name(table_name: str) -> str:
    """
    Validates that a table name is syntactically sound and present in the allowed whitelist.
    Raises SecurityViolation if table is blocked or unapproved.
    """
    clean_name = table_name.strip().lower()

    if not IDENTIFIER_REGEX.match(clean_name):
        raise SecurityViolation(f"Malformed table identifier rejected: '{table_name}'")

    if clean_name in BLOCKED_SENSITIVE_TABLES:
        raise SecurityViolation(
            f"SECURITY BREACH DETECTED: Access to quarantined table '{clean_name}' permanently blocked."
        )

    if clean_name not in ALLOWED_ANALYTICAL_TABLES:
        raise SecurityViolation(
            f"Access denied: Table '{clean_name}' is not registered in the analytical whitelist."
        )

    return clean_name


def sanitize_column_name(column_name: str) -> str:
    """
    Sanitizes column identifiers to prevent SQL injection in projection clauses.
    """
    clean_col = column_name.strip()
    if not IDENTIFIER_REGEX.match(clean_col):
        raise SecurityViolation(f"Invalid column identifier: '{column_name}'")
    return clean_col
