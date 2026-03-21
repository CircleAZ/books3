# Order Status System — Complete Reference

This document describes how order statuses work in the system, including all enum values, the state transition matrix, automatic triggers, and the derived overall status.

---

## 1. Status Fields Overview

Each order has **6 independent sub-status fields** plus a **cached overall status**:

| Field | Purpose | Auto-Computed? |
|---|---|---|
| `order_status` | Lifecycle stage (draft → completed) | Partially — auto-advances on payment/delivery |
| `payment_status` | Payment collection state | **Yes — fully auto-computed** from payments & refunds |
| `delivery_status` | Fulfillment progress | Manual |
| `return_status` | Return request tracking | Manual |
| `refund_status` | Refund processing state | Auto-updated when `Refund` records are saved |
| `cancellation_status` | Two-step cancellation flow | Manual (request → approve/reject) |
| `overall_status` | Cached human-readable summary | **Auto-computed on every save** |

---

## 2. All Enum Values

### `order_status`
| Value | Label | Description |
|---|---|---|
| `draft` | Draft | Order created, not yet confirmed |
| `confirmed` | Confirmed | Auto-set on first payment, or manually confirmed |
| `completed` | Completed | Auto-set when delivery marked, or manually completed |
| `cancelled` | Cancelled | Set via approved cancellation |

### `payment_status` *(auto-computed — cannot be set manually)*
| Value | Label | Trigger |
|---|---|---|
| `pending` | Pending | No payments recorded |
| `partial` | Partially Paid | Some payment, less than total |
| `paid` | Paid | Payments = order total |
| `overpaid` | Overpaid | Payments > order total |
| `refunded` | Refunded | Total refunds ≥ total paid |

### `delivery_status`
| Value | Label | Description |
|---|---|---|
| `pending` | Pending | Not yet started |
| `processing` | Processing | Being prepared |
| `ready` | Ready | Ready for pickup/delivery |
| `delivered` | Delivered | **Terminal — cannot be undone** |

### `return_status`
| Value | Label | Description |
|---|---|---|
| `na` | N/A | No return initiated (default) |
| `pending` | Pending | Return requested |
| `received` | Item Received | Items physically received back |
| `completed` | Completed | Return process fully resolved |
| `cancelled` | Cancelled | Return request cancelled |

### `refund_status`
| Value | Label | Description |
|---|---|---|
| `na` | N/A | No refund needed (default) |
| `pending` | Pending | Refund requested |
| `partial` | Partial | Partial refund issued |
| `completed` | Completed | Full refund issued |
| `cancelled` | Cancelled | Refund request cancelled |

### `cancellation_status`
| Value | Label | Description |
|---|---|---|
| `na` | N/A | No cancellation (default) |
| `pending` | Pending | Cancellation requested, awaiting approval |
| `completed` | Completed | Cancellation approved and finalized |
| `cancelled` | Cancelled | Cancellation request rejected |

---

## 3. State Transition Matrix

Only the transitions listed below are legal. Any other transition is blocked by the backend with a `400` error.

### `order_status`
```
draft ──→ confirmed ──→ completed
  │           │
  └──→ cancelled ←──┘
```
- `completed` and `cancelled` are **terminal** — no transitions out.

### `delivery_status`
```
pending ──→ processing ⇄ ready ──→ delivered
```
- `processing → pending` rollback allowed
- `ready → processing` rollback allowed
- `delivered` is **terminal** — requires confirmation dialog

### `cancellation_status` (two-step flow)
```
na ──→ pending ──→ completed (approved)
                └──→ cancelled (rejected) ──→ na
```

### `return_status`
```
na ──→ pending ──→ received ──→ completed
              └──→ cancelled ──→ na
```

### `refund_status`
```
na ──→ pending ──→ partial ──→ completed
              └──→ completed
              └──→ cancelled ──→ na
```

---

## 4. Auto-Transitions

These transitions happen automatically without user action:

| Trigger | Auto-Transition | Location |
|---|---|---|
| First payment recorded on a draft order | `order_status`: `draft` → `confirmed` | `update_payment_status()` |
| Delivery marked as `delivered` | `order_status`: `draft/confirmed` → `completed` | `Order.save()` |
| Refund record saved | `refund_status` updated based on total refunds vs order total | `Refund._update_order_refund_status()` |
| Refund record saved | `payment_status` recalculated (may become `refunded`) | `Refund._update_order_refund_status()` |
| Any order save | `overall_status` recomputed from `derived_status` | `Order.save()` |

---

## 5. Overall Status (Derived)

The `overall_status` field is a human-readable summary computed from all sub-statuses. It follows a **priority ladder** — first matching rule wins:

| Priority | Condition | Label | CSS Class |
|---|---|---|---|
| 1 | `cancellation_status = pending` | **Cancellation Pending** | `status-warning` |
| 2a | `cancellation_status = completed` + money collected + refund unresolved | **Cancelled — Refund Pending** | `status-action-needed` |
| 2b | `cancellation_status = completed` + no money / refund resolved | **Order Cancelled** | `status-danger` |
| 3 | `return_status = received` + refund unresolved | **Return Received — Process Refund** | `status-action-needed` |
| 4 | `payment_status = overpaid` + refund unresolved | **Overpaid — Refund Due** | `status-action-needed` |
| 5 | `delivery = delivered` + payment pending/partial | **Delivered - Awaiting Payment** | `status-warning` |
| 6 | `delivery = delivered` + paid + all resolved | **Order Complete** | `status-success` |
| 7a | `delivery = delivered` + refund in progress | **Refund in Progress** | `status-warning` |
| 7b | `delivery = delivered` + return pending | **Return in Progress** | `status-warning` |
| 8 | `delivery = processing` | **Processing** | `status-warning` |
| 9 | `delivery = ready` | **Ready for Pickup** | `status-warning` |
| 10 | `order = draft` | **Draft** | `status-pending` |
| 11 | `order = confirmed` | **Confirmed** | `status-success` |
| 12 | Fallback | **Processing** | `status-warning` |

---

## 6. Cancellation Flow (Two-Step)

1. **Employee clicks "Cancel Order"** → Custom confirmation modal shown
2. **On confirm** → `cancel_order()` sets `cancellation_status = 'pending'`
3. **Yellow banner appears** on order detail with Approve / Reject buttons
4. **Manager clicks Approve** → `approve_cancellation()` sets `cancellation_status = 'completed'`, `order_status = 'cancelled'`
5. **Or Manager clicks Reject** → `reject_cancellation()` resets `cancellation_status = 'na'`

> Delivered orders **cannot** be cancelled. Use the Return workflow instead.

---

## 7. Overpayment Resolution

When an order is overpaid (`payment_status = 'overpaid'`):
1. The `overall_status` shows **"Overpaid — Refund Due"**
2. Staff should issue a `Refund` for the excess amount
3. Once refunded, `payment_status` auto-computes to `refunded` or `paid`
4. The `overall_status` resolves accordingly

---

## 8. Key Rules

- **`payment_status` cannot be changed manually** — it's always auto-computed from `Payment` and `Refund` records
- **`delivered` is permanent** — requires a confirmation dialog; once set, the order is locked
- **All status changes are audited** in `OrderStatusHistory` with the user who made the change
- **`overall_status` is filterable** — use `?overall_status=...` on the API to query orders by their derived state
