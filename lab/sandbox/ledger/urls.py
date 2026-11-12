from django.urls import path

from . import views

urlpatterns = [
    path("accounts", views.accounts),
    path("payees", views.payees),
    path("invoices", views.invoices),
    path("invoices/<str:invoice_id>", views.invoice_detail),
    path("payment_intents", views.payment_intents),
    path("payment_intents/<str:intent_id>", views.payment_intent_detail),
    path("payment_intents/<str:intent_id>/confirm", views.payment_intent_confirm),
    path("payment_intents/<str:intent_id>/cancel", views.payment_intent_cancel),
    path("charges", views.charges),
    path("charges/<str:charge_id>", views.charge_detail),
    path("refunds", views.refunds),
    path("payouts", views.payouts),
    path("transfers", views.transfers),
]
