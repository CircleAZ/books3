<ACCOUNTANT_VERDICT status="UNBALANCED">
  <RECONCILIATION_NOTES>
      * Missing Audit Loop: The RBAC matrix dictates *who* can manage roles (`settings.manage_roles`). However, no system is designed without an immutable audit trail for privilege escalation. 
      * Chronological Discrepancy: If User A (Manager) grants User B (Cashier) the `finance.pay_expenses` permission, User B pays themselves, and User A immediately revokes the permission, the standard Django history will not cleanly capture this event mapping.
      * The matrix does not account for a segregation of duties inside the settings app (e.g., Maker-Checker flow for changing financial permissions).
  </RECONCILIATION_NOTES>
  <FINAL_OUTPUT>
      [MANDATORY_ARCHITECTURE_UPDATE]
      You must introduce an `AuditLog` wrapper specifically for the `RolePermission` and `UserRole` endpoints. 
      ```python
      # The ledger must track the exact timestamp, admin_id, and delta of all permission changes.
      class RoleAuditLog(models.Model):
          action = models.CharField(choices=[('GRANT', 'GRANT'), ('REVOKE', 'REVOKE')])
          target_user = models.ForeignKey(User, on_delete=models.CASCADE)
          permission_code = models.CharField(max_length=100)
          executed_by = models.ForeignKey(User, related_name='rbac_audits')
          timestamp = models.DateTimeField(auto_now_add=True)
      ```
      This guarantees financial and security audits can reconcile *why* an unauthorized user was briefly authorized.
  </FINAL_OUTPUT>
</ACCOUNTANT_VERDICT>
