"""The Django admin as a read-only inspection console. Money moves only through the services."""

from django.contrib import admin

from .models import (
    Account,
    Charge,
    Entry,
    IdempotencyKey,
    Invoice,
    JournalTransaction,
    Party,
    PaymentIntent,
    Payout,
    Refund,
    Transfer,
)

admin.site.site_header = "SafePay Labs payments sandbox"
admin.site.site_title = "Payments sandbox"
admin.site.index_title = "Inspect the ledger (read-only)"


class ReadOnlyAdmin(admin.ModelAdmin):
    def has_add_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


class EntryInline(admin.TabularInline):
    model = Entry
    fields = ("account", "amount")
    readonly_fields = fields
    extra = 0
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Party)
class PartyAdmin(ReadOnlyAdmin):
    list_display = ("public_id", "name", "kind", "merchant")
    list_filter = ("kind",)
    search_fields = ("name",)
    exclude = ("api_key",)


@admin.register(Account)
class AccountAdmin(ReadOnlyAdmin):
    list_display = ("public_id", "owner", "kind", "label", "balance")
    list_filter = ("kind", "owner__kind")
    search_fields = ("owner__name",)


@admin.register(JournalTransaction)
class JournalTransactionAdmin(ReadOnlyAdmin):
    list_display = ("public_id", "kind", "reference", "memo", "created_at")
    list_filter = ("kind",)
    search_fields = ("reference",)
    inlines = [EntryInline]


@admin.register(Entry)
class EntryAdmin(ReadOnlyAdmin):
    list_display = ("pk", "transaction", "account", "amount")
    list_filter = ("transaction__kind",)


@admin.register(Invoice)
class InvoiceAdmin(ReadOnlyAdmin):
    list_display = ("public_id", "number", "merchant", "payee", "amount", "status", "due_date")
    list_filter = ("status",)
    search_fields = ("number",)


@admin.register(PaymentIntent)
class PaymentIntentAdmin(ReadOnlyAdmin):
    list_display = ("public_id", "merchant", "payee", "amount", "status", "failure_code", "invoice")
    list_filter = ("status",)


@admin.register(Charge)
class ChargeAdmin(ReadOnlyAdmin):
    list_display = ("public_id", "merchant", "customer", "amount", "amount_refunded", "order_ref")


@admin.register(Refund)
class RefundAdmin(ReadOnlyAdmin):
    list_display = ("public_id", "charge", "amount", "created_at")


@admin.register(Payout)
class PayoutAdmin(ReadOnlyAdmin):
    list_display = ("public_id", "merchant", "account", "amount", "created_at")


@admin.register(Transfer)
class TransferAdmin(ReadOnlyAdmin):
    list_display = ("public_id", "merchant", "source", "destination", "amount", "created_at")


@admin.register(IdempotencyKey)
class IdempotencyKeyAdmin(ReadOnlyAdmin):
    list_display = ("key", "merchant", "method", "path", "response_status", "created_at")
