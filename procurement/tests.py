"""
Procurement Engine — Automated Test Suite
==========================================
IEEE 829-aligned test matrix covering:
  - WAC math correctness (5 scenarios)
  - PO lifecycle state transitions (4 scenarios)
  - Expense immutability & payment idempotency (4 scenarios)
  - Stock adjustment guardrails (3 scenarios)
  - Model-level data integrity (3 scenarios)
  - Concurrency & thread safety (3 scenarios)
"""
from django.test import TestCase, TransactionTestCase
from django.core.exceptions import ValidationError
from decimal import Decimal, ROUND_HALF_UP
import time
import concurrent.futures
from django.db import connection, transaction

from inventory.models import Product, Vendor, Category, StockAdjustment
from finance.models import ExpenseCategory, Expense
from account.models import User
from procurement.models import (
    Transporter, PurchaseOrder, PurchaseOrderItem,
    PurchaseCharge, PurchasePayment,
)
from procurement.services import ProcurementService
from inventory.services import StockService
from orders.models import Order, OrderItem


# ═══════════════════════════════════════════════════════════════
#  Section 1 — WAC Math Correctness
# ═══════════════════════════════════════════════════════════════

class WACMathTestCase(TestCase):
    """Validates Weighted Average Cost calculations under various edge conditions."""

    def setUp(self):
        self.user = User.objects.create(username="test_procurement", is_active=True)
        self.category = Category.objects.create(name="Stationery")
        self.vendor = Vendor.objects.create(name="Vendor X")

        # Base Product — starts empty
        self.pen = Product.objects.create(
            name="Pen (Base)", category=self.category,
            cost_price=Decimal("10.00"), selling_price=Decimal("15.00"),
            stock_quantity=0, physical_stock=0,
        )

        # Pack Product — 50 pens per box
        self.pen_box = Product.objects.create(
            name="Pen Box (50)", category=self.category,
            is_pack=True, base_product=self.pen, pack_size=50,
            cost_price=Decimal("500.00"), selling_price=Decimal("700.00"),
        )

    # ── WAC-01: Pack-to-Base translation ──────────────────────
    def test_wac_01_base_unit_atomization(self):
        """Buy 2 packs of 50 at ₹8/unit → 100 base units injected, cost_price = 8."""
        po = PurchaseOrder.objects.create(vendor=self.vendor, created_by=self.user)
        item = PurchaseOrderItem.objects.create(
            purchase_order=po, product=self.pen_box,
            vendor_pack_size=50, purchased_packs=2,
            unit_cost_price=Decimal("8.00"),
        )

        ProcurementService.receive_order(
            po.id, [{"item_id": item.id, "received_packs": 2}], self.user,
        )

        self.pen.refresh_from_db()
        self.pen_box.refresh_from_db()

        self.assertEqual(self.pen.stock_quantity, 100)
        self.assertEqual(self.pen.cost_price, Decimal("8.0000"))
        self.assertEqual(self.pen_box.cost_price, Decimal("400.0000"))

    # ── WAC-02: Non-terminating decimal from charge allocation ─
    def test_wac_02_decimal_imprecision(self):
        """Transport ₹100 spread over 3 units → landed = 10 + 33.3333 = 43.3333."""
        po = PurchaseOrder.objects.create(vendor=self.vendor, created_by=self.user)
        item = PurchaseOrderItem.objects.create(
            purchase_order=po, product=self.pen,
            vendor_pack_size=1, purchased_packs=3,
            unit_cost_price=Decimal("10.00"),
        )
        PurchaseCharge.objects.create(
            purchase_order=po, charge_type="transport",
            amount=Decimal("100.00"),
        )

        ProcurementService.receive_order(
            po.id, [{"item_id": item.id, "received_packs": 3}], self.user,
        )

        self.pen.refresh_from_db()
        self.assertEqual(self.pen.stock_quantity, 3)
        self.assertAlmostEqual(float(self.pen.cost_price), 43.3333, places=3)

    # ── WAC-03: Negative-stock anchor reset ────────────────────
    def test_wac_03_negative_stock_anchor(self):
        """Stock at -10; receive 20 at ₹50 → stock=10, cost anchors to ₹50."""
        self.pen.stock_quantity = -10
        self.pen.physical_stock = -10
        self.pen.save(update_fields=["stock_quantity", "physical_stock"])

        po = PurchaseOrder.objects.create(vendor=self.vendor, created_by=self.user)
        item = PurchaseOrderItem.objects.create(
            purchase_order=po, product=self.pen,
            vendor_pack_size=1, purchased_packs=20,
            unit_cost_price=Decimal("50.00"),
        )

        ProcurementService.receive_order(
            po.id, [{"item_id": item.id, "received_packs": 20}], self.user,
        )

        self.pen.refresh_from_db()
        self.assertEqual(self.pen.stock_quantity, 10)
        self.assertEqual(self.pen.cost_price, Decimal("50.0000"))

    # ── WAC-04: Multi-item PO with pro-rated charges ──────────
    def test_wac_04_multi_item_charge_proration(self):
        """
        PO with two different products, one transport charge.
        Charges are allocated proportional to line_total.

        Item A: 10 x ₹20 = ₹200 (66.67%)
        Item B:  5 x ₹20 = ₹100 (33.33%)
        Transport: ₹30
        
        A gets ₹20 of charge → landed/unit = 20 + 2 = 22
        B gets ₹10 of charge → landed/unit = 20 + 2 = 22
        (Both happen to be equal here because unit cost is identical.)
        """
        eraser = Product.objects.create(
            name="Eraser", category=self.category,
            cost_price=Decimal("5.00"), selling_price=Decimal("8.00"),
            stock_quantity=0, physical_stock=0,
        )

        po = PurchaseOrder.objects.create(vendor=self.vendor, created_by=self.user)
        item_a = PurchaseOrderItem.objects.create(
            purchase_order=po, product=self.pen,
            vendor_pack_size=1, purchased_packs=10,
            unit_cost_price=Decimal("20.00"),
        )
        item_b = PurchaseOrderItem.objects.create(
            purchase_order=po, product=eraser,
            vendor_pack_size=1, purchased_packs=5,
            unit_cost_price=Decimal("20.00"),
        )
        PurchaseCharge.objects.create(
            purchase_order=po, charge_type="transport",
            amount=Decimal("30.00"),
        )

        ProcurementService.receive_order(
            po.id,
            [
                {"item_id": item_a.id, "received_packs": 10},
                {"item_id": item_b.id, "received_packs": 5},
            ],
            self.user,
        )

        self.pen.refresh_from_db()
        eraser.refresh_from_db()

        self.assertEqual(self.pen.stock_quantity, 10)
        self.assertEqual(eraser.stock_quantity, 5)
        # Both should be 22.00 (20 + 2)
        self.assertAlmostEqual(float(self.pen.cost_price), 22.0, places=2)
        self.assertAlmostEqual(float(eraser.cost_price), 22.0, places=2)

    # ── WAC-05: Successive receipts blend into existing stock ──
    def test_wac_05_successive_receipt_blending(self):
        """
        Start: 10 pens at ₹10 (existing stock).
        PO: buy 10 more at ₹20 (no charges).
        Expected WAC after receipt: (10*10 + 10*20) / 20 = 300/20 = 15.
        """
        self.pen.stock_quantity = 10
        self.pen.physical_stock = 10
        self.pen.cost_price = Decimal("10.00")
        self.pen.save(update_fields=["stock_quantity", "physical_stock", "cost_price"])

        po = PurchaseOrder.objects.create(vendor=self.vendor, created_by=self.user)
        item = PurchaseOrderItem.objects.create(
            purchase_order=po, product=self.pen,
            vendor_pack_size=1, purchased_packs=10,
            unit_cost_price=Decimal("20.00"),
        )

        ProcurementService.receive_order(
            po.id, [{"item_id": item.id, "received_packs": 10}], self.user,
        )

        self.pen.refresh_from_db()
        self.assertEqual(self.pen.stock_quantity, 20)
        self.assertEqual(self.pen.cost_price, Decimal("15.0000"))


# ═══════════════════════════════════════════════════════════════
#  Section 2 — PO Lifecycle & State Machine
# ═══════════════════════════════════════════════════════════════

class POLifecycleTestCase(TestCase):
    """Validates PO status transitions for correctness."""

    def setUp(self):
        self.user = User.objects.create(username="lifecycle_user", is_active=True)
        self.category = Category.objects.create(name="Books")
        self.vendor = Vendor.objects.create(name="Book Vendor")
        self.product = Product.objects.create(
            name="Notebook", category=self.category,
            cost_price=Decimal("30.00"), selling_price=Decimal("50.00"),
            stock_quantity=0, physical_stock=0,
        )

    # ── LIFE-01: Full receipt transitions to 'received' ───────
    def test_life_01_full_receipt_status(self):
        po = PurchaseOrder.objects.create(vendor=self.vendor, created_by=self.user)
        item = PurchaseOrderItem.objects.create(
            purchase_order=po, product=self.product,
            vendor_pack_size=1, purchased_packs=10,
            unit_cost_price=Decimal("30.00"),
        )

        ProcurementService.receive_order(
            po.id, [{"item_id": item.id, "received_packs": 10}], self.user,
        )

        po.refresh_from_db()
        self.assertEqual(po.status, PurchaseOrder.Status.RECEIVED)

    # ── LIFE-02: Partial receipt transitions to 'partially_received'
    def test_life_02_partial_receipt_status(self):
        po = PurchaseOrder.objects.create(vendor=self.vendor, created_by=self.user)
        item = PurchaseOrderItem.objects.create(
            purchase_order=po, product=self.product,
            vendor_pack_size=1, purchased_packs=10,
            unit_cost_price=Decimal("30.00"),
        )

        ProcurementService.receive_order(
            po.id, [{"item_id": item.id, "received_packs": 5}], self.user,
        )

        po.refresh_from_db()
        self.assertEqual(po.status, PurchaseOrder.Status.PARTIAL)

    # ── LIFE-03: Receiving a fully-received PO raises error ───
    def test_life_03_double_receive_blocked(self):
        po = PurchaseOrder.objects.create(
            vendor=self.vendor, created_by=self.user,
            status=PurchaseOrder.Status.RECEIVED,
        )
        item = PurchaseOrderItem.objects.create(
            purchase_order=po, product=self.product,
            vendor_pack_size=1, purchased_packs=10,
            unit_cost_price=Decimal("30.00"),
        )

        with self.assertRaises(ValidationError) as ctx:
            ProcurementService.receive_order(
                po.id, [{"item_id": item.id, "received_packs": 5}], self.user,
            )
        self.assertIn("Cannot receive", str(ctx.exception))

    # ── LIFE-04: Receiving a cancelled PO raises error ────────
    def test_life_04_cancelled_po_blocked(self):
        po = PurchaseOrder.objects.create(
            vendor=self.vendor, created_by=self.user,
            status=PurchaseOrder.Status.CANCELLED,
        )
        item = PurchaseOrderItem.objects.create(
            purchase_order=po, product=self.product,
            vendor_pack_size=1, purchased_packs=5,
            unit_cost_price=Decimal("25.00"),
        )

        with self.assertRaises(ValidationError):
            ProcurementService.receive_order(
                po.id, [{"item_id": item.id, "received_packs": 5}], self.user,
            )


# ═══════════════════════════════════════════════════════════════
#  Section 3 — Expense Immutability & Payment Idempotency
# ═══════════════════════════════════════════════════════════════

class ImmutabilityTestCase(TestCase):
    """Validates that procurement-generated Expenses are tamper-proof."""

    def setUp(self):
        self.user = User.objects.create(username="finance_user")
        self.vendor = Vendor.objects.create(name="Vendor X")
        self.po = PurchaseOrder.objects.create(
            vendor=self.vendor, total_amount=Decimal("1000.00"),
        )

    def _make_employee_payment(self, amount=Decimal("500.00")):
        payment = PurchasePayment.objects.create(
            purchase_order=self.po, amount=amount,
            payment_method=PurchasePayment.PaymentMethod.EMPLOYEE_EXPENSE,
            paid_by_employee=self.user,
        )
        ProcurementService.process_payment(payment.id, self.user)
        payment.refresh_from_db()
        return payment

    # ── IMM-01: Amount tampering blocked ──────────────────────
    def test_imm_01_amount_tampering_blocked(self):
        payment = self._make_employee_payment()
        expense = payment.finance_expense
        self.assertIsNotNone(expense)

        expense.amount = Decimal("400.00")
        with self.assertRaises(ValidationError) as ctx:
            expense.save()
        self.assertIn("core fields are immutable", str(ctx.exception))

    # ── IMM-02: Payee tampering blocked ───────────────────────
    def test_imm_02_payee_tampering_blocked(self):
        other_user = User.objects.create(username="attacker", email="attacker@test.local")
        payment = self._make_employee_payment()
        expense = payment.finance_expense

        expense.payee_id = other_user.id
        with self.assertRaises(ValidationError):
            expense.save()

    # ── IMM-03: Non-core field updates still allowed ──────────
    def test_imm_03_status_update_allowed(self):
        payment = self._make_employee_payment()
        expense = payment.finance_expense

        expense.payment_status = Expense.PaymentStatus.PAID
        try:
            expense.save()
        except ValidationError:
            self.fail("Status update on immutable expense should be allowed.")

    # ── IMM-04: Duplicate payment processing (idempotency) ────
    def test_imm_04_duplicate_processing_blocked(self):
        payment = PurchasePayment.objects.create(
            purchase_order=self.po, amount=Decimal("500.00"),
            payment_method=PurchasePayment.PaymentMethod.EMPLOYEE_EXPENSE,
            paid_by_employee=self.user,
        )
        ProcurementService.process_payment(payment.id, self.user)

        with self.assertRaises(ValidationError) as ctx:
            ProcurementService.process_payment(payment.id, self.user)
        self.assertIn("already been routed", str(ctx.exception))


# ═══════════════════════════════════════════════════════════════
#  Section 4 — Stock Adjustment Guardrails
# ═══════════════════════════════════════════════════════════════

class StockGuardrailTestCase(TestCase):
    """Validates hardened stock adjustment rules."""

    def setUp(self):
        self.user = User.objects.create(username="stock_user", is_active=True)
        self.category = Category.objects.create(name="Supplies")
        self.product = Product.objects.create(
            name="Marker", category=self.category,
            cost_price=Decimal("15.00"), selling_price=Decimal("25.00"),
            stock_quantity=50, physical_stock=50,
        )

    # ── GUARD-01: Audit correction increase without cost → error
    def test_guard_01_audit_increase_requires_cost(self):
        with self.assertRaises(ValidationError) as ctx:
            StockService.adjust_stock(
                product_id=self.product.id,
                adjustment_type="increase", quantity=10,
                reason="audit_correction",
                notes="Found extra stock behind shelf",
                user=self.user,
                unit_cost=None,
            )
        self.assertIn("unit_cost", str(ctx.exception))

    # ── GUARD-02: Audit correction increase WITH cost → OK ────
    def test_guard_02_audit_increase_with_cost_succeeds(self):
        new_qty = StockService.adjust_stock(
            product_id=self.product.id,
            adjustment_type="increase", quantity=10,
            reason="audit_correction",
            notes="Found extra stock behind shelf",
            user=self.user,
            unit_cost=Decimal("12.00"),
        )
        self.assertEqual(new_qty, 60)

        self.product.refresh_from_db()
        # WAC: (50*15 + 10*12) / 60 = 870 / 60 = 14.5
        self.assertAlmostEqual(float(self.product.cost_price), 14.5, places=2)

    # ── GUARD-03: Decrease adjustments don't require cost ─────
    def test_guard_03_decrease_no_cost_ok(self):
        new_qty = StockService.adjust_stock(
            product_id=self.product.id,
            adjustment_type="decrease", quantity=5,
            reason="damage",
            notes="Water damage in warehouse",
            user=self.user,
        )
        self.assertEqual(new_qty, 45)


# ═══════════════════════════════════════════════════════════════
#  Section 5 — Model-Level Data Integrity
# ═══════════════════════════════════════════════════════════════

class ModelIntegrityTestCase(TestCase):
    """Validates computed fields and model save hooks."""

    def setUp(self):
        self.user = User.objects.create(username="model_user", is_active=True)
        self.category = Category.objects.create(name="Office")
        self.vendor = Vendor.objects.create(name="OfficeMax")
        self.product = Product.objects.create(
            name="Stapler", category=self.category,
            cost_price=Decimal("100.00"), selling_price=Decimal("150.00"),
            stock_quantity=0, physical_stock=0,
        )

    # ── MODEL-01: ordered_quantity auto-computed on save ──────
    def test_model_01_ordered_quantity_computed(self):
        po = PurchaseOrder.objects.create(vendor=self.vendor, created_by=self.user)
        item = PurchaseOrderItem.objects.create(
            purchase_order=po, product=self.product,
            vendor_pack_size=12, purchased_packs=5,
            unit_cost_price=Decimal("8.00"),
        )
        self.assertEqual(item.ordered_quantity, 60)  # 12 * 5

    # ── MODEL-02: line_total auto-computed on save ────────────
    def test_model_02_line_total_computed(self):
        po = PurchaseOrder.objects.create(vendor=self.vendor, created_by=self.user)
        item = PurchaseOrderItem.objects.create(
            purchase_order=po, product=self.product,
            vendor_pack_size=12, purchased_packs=5,
            unit_cost_price=Decimal("8.00"),
        )
        # line_total = ordered_quantity * unit_cost_price = 60 * 8 = 480
        self.assertEqual(item.line_total, Decimal("480.00"))

    # ── MODEL-03: Payment updates PO payment_status ───────────
    def test_model_03_payment_status_progression(self):
        po = PurchaseOrder.objects.create(
            vendor=self.vendor, created_by=self.user,
            total_amount=Decimal("1000.00"),
        )

        # Partial payment
        p1 = PurchasePayment.objects.create(
            purchase_order=po, amount=Decimal("300.00"),
            payment_method=PurchasePayment.PaymentMethod.CASH,
        )
        ProcurementService.process_payment(p1.id, self.user)
        po.refresh_from_db()
        self.assertEqual(po.payment_status, PurchaseOrder.PaymentStatus.PARTIAL)

        # Full payment
        p2 = PurchasePayment.objects.create(
            purchase_order=po, amount=Decimal("700.00"),
            payment_method=PurchasePayment.PaymentMethod.CASH,
        )
        ProcurementService.process_payment(p2.id, self.user)
        po.refresh_from_db()
        self.assertEqual(po.payment_status, PurchaseOrder.PaymentStatus.PAID)
        self.assertEqual(po.amount_paid, Decimal("1000.00"))


# ═══════════════════════════════════════════════════════════════
#  Section 6 — Concurrency & Thread Safety
# ═══════════════════════════════════════════════════════════════

class ConcurrencyTestCase(TransactionTestCase):
    """
    Uses TransactionTestCase (real DB commits) to test multi-threaded
    scenarios that exercise select_for_update() row locks.
    """

    def setUp(self):
        self.user = User.objects.create(username="concurrent_user")
        self.category = Category.objects.create(name="Stationery")
        self.vendor = Vendor.objects.create(name="Vendor X")

        self.product = Product.objects.create(
            name="Thread Test Product", category=self.category,
            cost_price=Decimal("20.00"), selling_price=Decimal("30.00"),
            stock_quantity=5, physical_stock=5,
        )

        self.po = PurchaseOrder.objects.create(
            vendor=self.vendor, created_by=self.user,
        )
        self.po_item = PurchaseOrderItem.objects.create(
            purchase_order=self.po, product=self.product,
            vendor_pack_size=1, purchased_packs=50,
            unit_cost_price=Decimal("40.00"),
        )

    # ── CON-01: Parallel PO receive + POS checkout ────────────
    def test_con_01_parallel_receive_and_checkout(self):
        order = Order.objects.create(
            order_status="draft", delivery_status="pending",
            created_by=self.user,
        )
        OrderItem.objects.create(
            order=order, product=self.product, quantity=2,
            unit_price=Decimal("30.00"), line_total=Decimal("60.00"),
            cost_price=self.product.cost_price,
        )

        def receive_po():
            connection.close()
            ProcurementService.receive_order(
                self.po.id,
                [{"item_id": self.po_item.id, "received_packs": 50}],
                self.user,
            )

        def pos_checkout():
            connection.close()
            order.freeze_confirmed_quantities()

        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            f1 = pool.submit(receive_po)
            time.sleep(0.05)
            f2 = pool.submit(pos_checkout)
            f1.result()
            f2.result()

        self.product.refresh_from_db()

        # Non-deterministic lock order produces two valid WAC outcomes:
        #   A) receive wins lock: (5*20 + 50*40) / 55 ≈ 38.1818
        #   B) checkout wins lock first, deducts 2: (3*20 + 50*40) / 53 ≈ 38.8679
        actual = float(self.product.cost_price)
        valid = [38.1818, 38.8679]
        self.assertTrue(
            any(abs(actual - v) < 0.01 for v in valid),
            f"WAC {actual} not in valid set {valid}",
        )

    # ── CON-02: Double-click payment generates exactly 1 expense
    def test_con_02_double_click_payment(self):
        payment = PurchasePayment.objects.create(
            purchase_order=self.po, amount=Decimal("500.00"),
            payment_method=PurchasePayment.PaymentMethod.EMPLOYEE_EXPENSE,
            paid_by_employee=self.user,
        )

        def process_pay():
            connection.close()
            try:
                ProcurementService.process_payment(payment.id, self.user)
                return True
            except (ValidationError, Exception):
                return False

        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
            futures = [pool.submit(process_pay) for _ in range(5)]
            results = [f.result() for f in futures]

        successes = sum(1 for r in results if r is True)
        self.assertEqual(successes, 1, f"Expected exactly 1 success, got {successes}")

        payment.refresh_from_db()
        expense_count = Expense.objects.filter(
            description__contains=f"PO #{self.po.display_id}",
        ).count()
        self.assertEqual(expense_count, 1)

    # ── CON-03: Two POs receiving the SAME product simultaneously
    def test_con_03_parallel_receive_same_product(self):
        """
        Two different POs both inject stock for the same product at the
        same time. The final stock and WAC must reflect both receipts.

        PO-A: 10 units at ₹30
        PO-B: 20 units at ₹60
        Starting: 5 units at ₹20

        Order-independent result:
          Stock = 5 + 10 + 20 = 35
          Value = 5*20 + 10*30 + 20*60 = 100+300+1200 = 1600
          WAC = 1600 / 35 = 45.7143
        """
        po_b = PurchaseOrder.objects.create(
            vendor=self.vendor, created_by=self.user,
        )
        po_b_item = PurchaseOrderItem.objects.create(
            purchase_order=po_b, product=self.product,
            vendor_pack_size=1, purchased_packs=20,
            unit_cost_price=Decimal("60.00"),
        )

        # Override PO-A item to 10 @ ₹30
        self.po_item.purchased_packs = 10
        self.po_item.unit_cost_price = Decimal("30.00")
        self.po_item.save()

        def receive_a():
            connection.close()
            ProcurementService.receive_order(
                self.po.id,
                [{"item_id": self.po_item.id, "received_packs": 10}],
                self.user,
            )

        def receive_b():
            connection.close()
            ProcurementService.receive_order(
                po_b.id,
                [{"item_id": po_b_item.id, "received_packs": 20}],
                self.user,
            )

        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            fa = pool.submit(receive_a)
            fb = pool.submit(receive_b)
            fa.result()
            fb.result()

        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 35)

        # WAC must be 1600/35 ≈ 45.7143 regardless of execution order
        # because select_for_update serialises the two receipts.
        self.assertAlmostEqual(
            float(self.product.cost_price), 45.7143, places=2,
        )


# ═══════════════════════════════════════════════════════════════
#  Section 7 — Phase 6.1 Retroactive WAC Correction
# ═══════════════════════════════════════════════════════════════

class RetroactiveWACTestCase(TestCase):
    """Validates the Retroactive WAC Correction engine (Phase 6.1)."""

    def setUp(self):
        self.user = User.objects.create(username="retro_user", is_active=True)
        self.category = Category.objects.create(name="Retro Office")
        self.vendor = Vendor.objects.create(name="Retro Vendor")

        self.pencil = Product.objects.create(
            name="Pencil (Retro Test)", category=self.category,
            cost_price=Decimal("0.00"), selling_price=Decimal("2.00"),
            stock_quantity=0, physical_stock=0,
        )

    def _create_and_receive_po(self, qty, unit_cost, charges=Decimal('0.00')):
        """Helper: create PO, optionally add pre-receive charges, then receive fully."""
        po = PurchaseOrder.objects.create(vendor=self.vendor, created_by=self.user)
        item = PurchaseOrderItem.objects.create(
            purchase_order=po, product=self.pencil,
            vendor_pack_size=1, purchased_packs=qty,
            unit_cost_price=unit_cost,
        )
        po.subtotal = item.line_total
        po.total_amount = item.line_total
        po.save(update_fields=['subtotal', 'total_amount'])

        if charges > 0:
            PurchaseCharge.objects.create(
                purchase_order=po, charge_type='transport',
                amount=charges,
            )
            po.total_charges = charges
            po.total_amount = po.subtotal + charges
            po.save(update_fields=['total_charges', 'total_amount'])

        ProcurementService.receive_order(
            po.id, [{"item_id": item.id, "received_packs": qty}], self.user,
        )
        po.refresh_from_db()
        return po

    # ── RETRO-01: Basic retroactive WAC inflation ─────────────
    def test_retro_01_basic_wac_inflation(self):
        """
        Buy 100 pencils at ₹1.00. Receive. cost_price = 1.00.
        Add ₹500 transport retroactively.
        Expected: inflation = 500/100 = 5.00/unit, new cost = 6.00.
        """
        po = self._create_and_receive_po(100, Decimal("1.00"))
        self.pencil.refresh_from_db()
        self.assertEqual(self.pencil.cost_price, Decimal("1.0000"))

        # Retroactive charge
        ProcurementService.apply_retroactive_charge(po.id, Decimal("500.00"), self.user)

        self.pencil.refresh_from_db()
        self.assertAlmostEqual(float(self.pencil.cost_price), 6.00, places=2)

    # ── RETRO-02: Orphaned margin write-off for sold items ────
    def test_retro_02_orphaned_margin_writeoff(self):
        """
        Buy 100 pencils at ₹50. Receive. Sell 60.
        Stock should be 40. Add ₹500 late transport.
        
        inflation/unit = 500/100 = 5.00
        Orphaned = 60 sold × ₹5.00 = ₹300.00 → Expense created.
        WAC correction = +₹5.00 → new cost = 55.00.
        """
        po = self._create_and_receive_po(100, Decimal("50.00"))

        # Simulate selling 60 units
        self.pencil.refresh_from_db()
        self.pencil.stock_quantity = 40
        self.pencil.physical_stock = 40
        self.pencil.save(update_fields=['stock_quantity', 'physical_stock'])

        ProcurementService.apply_retroactive_charge(po.id, Decimal("500.00"), self.user)

        self.pencil.refresh_from_db()
        self.assertAlmostEqual(float(self.pencil.cost_price), 55.00, places=2)

        # Verify the orphaned margin expense was logged
        from finance.models import Expense, ExpenseCategory
        writeoff_cat = ExpenseCategory.objects.filter(name="Late Transport Write-Off").first()
        self.assertIsNotNone(writeoff_cat)

        writeoff = Expense.objects.filter(category=writeoff_cat).first()
        self.assertIsNotNone(writeoff)
        self.assertAlmostEqual(float(writeoff.total_amount), 300.00, places=2)

    # ── RETRO-03: No orphaned margin when all stock remains ───
    def test_retro_03_no_orphan_when_stock_full(self):
        """All units still in stock → no write-off expense."""
        po = self._create_and_receive_po(50, Decimal("10.00"))

        ProcurementService.apply_retroactive_charge(po.id, Decimal("100.00"), self.user)

        from finance.models import Expense
        writeoff_count = Expense.objects.filter(
            description__contains="late charge write-off"
        ).count()
        self.assertEqual(writeoff_count, 0)

        self.pencil.refresh_from_db()
        # 100/50 = 2.00 inflation, new cost = 12.00
        self.assertAlmostEqual(float(self.pencil.cost_price), 12.00, places=2)

    # ── RETRO-04: Audit trail created ─────────────────────────
    def test_retro_04_audit_trail_exists(self):
        """StockAdjustment + StockHistory created with retroactive_charge reason."""
        po = self._create_and_receive_po(20, Decimal("5.00"))

        ProcurementService.apply_retroactive_charge(po.id, Decimal("40.00"), self.user)

        adj = StockAdjustment.objects.filter(
            product=self.pencil, reason='retroactive_charge'
        ).first()
        self.assertIsNotNone(adj)
        self.assertEqual(adj.quantity, 0)  # Zero-quantity adjustment for cost change

        from inventory.models import StockHistory
        hist = StockHistory.objects.filter(
            product=self.pencil, reason='retroactive_charge'
        ).first()
        self.assertIsNotNone(hist)
        self.assertEqual(hist.quantity_change, 0)

    # ── RETRO-05: Decimal precision guard ─────────────────────
    def test_retro_05_decimal_precision(self):
        """₹10 charge / 3 units = 3.3333... → must round to 4 decimal places."""
        po = self._create_and_receive_po(3, Decimal("10.00"))

        ProcurementService.apply_retroactive_charge(po.id, Decimal("10.00"), self.user)

        self.pencil.refresh_from_db()
        # 10/3 = 3.3333 → new cost = 10 + 3.3333 = 13.3333
        self.assertAlmostEqual(float(self.pencil.cost_price), 13.3333, places=3)

