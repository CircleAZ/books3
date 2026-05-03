"""
Central constants for order status filtering.

ALL modules that need to determine "what counts as a valid sale" MUST import
from here. Do NOT hardcode status lists in views, serializers, or templates.

Changing these constants will immediately propagate to:
- Dashboard (stats, trend, top products, recent orders)
- Reports (sales, inventory, customer, activity)
- Finance Dashboard (revenue, COGS)
- Customer Map (season coverage)
"""

# Order statuses that represent a real, countable sale.
# Draft = not yet confirmed. Cancelled = voided. Only these count.
VALID_SALE_STATUSES = ['confirmed', 'completed']

# The timezone used for business-day boundaries (e.g. "Today's Sales").
# Render runs in UTC, but the business operates in IST.
BUSINESS_TIMEZONE = 'Asia/Kolkata'
