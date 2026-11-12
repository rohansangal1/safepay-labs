"""HTTP plumbing for the sandbox API: auth, JSON bodies, errors and idempotency.

Every error has the same shape, `{"error": {"type", "code", "message"}}`, so the tool server can
map errors precisely; the B1 design levels vary exactly these semantics.
"""

import functools
import hashlib
import json

from django.conf import settings
from django.db import IntegrityError, transaction
from django.http import HttpRequest, HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt

from .models import IdempotencyKey, Party
from .services import LedgerError, NotFound

REPLAY_HEADER = "Idempotent-Replayed"


def error(status: int, code: str, message: str, **extra) -> JsonResponse:
    kind = "api_error" if status >= 500 else "invalid_request_error"
    if status == 402:
        kind = "payment_error"
    if status == 401:
        kind = "authentication_error"
    if code.startswith("idempotency"):
        kind = "idempotency_error"
    return JsonResponse(
        {"error": {"type": kind, "code": code, "message": message, **extra}}, status=status
    )


class BadRequest(LedgerError):
    code = "invalid_request"


def body_of(request: HttpRequest) -> dict:
    if not request.body:
        return {}
    try:
        data = json.loads(request.body)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise BadRequest("request body must be JSON") from exc
    if not isinstance(data, dict):
        raise BadRequest("request body must be a JSON object")
    return data


def merchant_for(request: HttpRequest) -> Party | None:
    header = request.headers.get("Authorization", "")
    scheme, _, key = header.partition(" ")
    if scheme != "Bearer" or not key:
        return None
    return Party.objects.filter(kind=Party.Kind.MERCHANT, api_key=key).first()


def parse_id(value: object, prefix: str) -> int:
    if not isinstance(value, str) or not value.startswith(prefix + "_"):
        raise NotFound(f"expected an id like {prefix}_123")
    tail = value[len(prefix) + 1 :]
    if not tail.isdigit():
        raise NotFound(f"expected an id like {prefix}_123")
    return int(tail)


def get_owned(queryset, value: object, prefix: str):
    """Fetch an object by public id, from a queryset already limited to the caller's objects."""
    try:
        return queryset.get(pk=parse_id(value, prefix))
    except queryset.model.DoesNotExist as exc:
        raise NotFound(f"no such object: {value}") from exc


def fingerprint(request: HttpRequest, body: dict) -> str:
    canonical = json.dumps(body, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(f"{request.method} {request.path}\n{canonical}".encode()).hexdigest()


def _run(view, request, merchant, body, kwargs) -> HttpResponse:
    try:
        with transaction.atomic():
            return view(request, merchant, body, **kwargs)
    except LedgerError as exc:
        return error(exc.status, exc.code, str(exc))


def endpoint(*methods: str):
    """Wrap a view `(request, merchant, body, **kwargs) -> JsonResponse`.

    POST requests are idempotent per settings.IDEMPOTENCY_MODE: a repeated Idempotency-Key with
    the same request returns the stored response (with `Idempotent-Replayed: true`) and has no
    further effect; the same key with a different request is refused. The key row commits in the
    same transaction as the effect, so a concurrent duplicate waits on the unique index and then
    replays the first request's response.
    """

    def decorate(view):
        @csrf_exempt
        @functools.wraps(view)
        def wrapper(request: HttpRequest, **kwargs) -> JsonResponse:
            if request.method not in methods:
                return error(405, "method_not_allowed", f"{request.method} is not allowed here")
            merchant = merchant_for(request)
            if merchant is None:
                return error(401, "unauthorized", "send Authorization: Bearer <merchant api key>")
            try:
                body = body_of(request)
            except LedgerError as exc:
                return error(exc.status, exc.code, str(exc))
            if request.method != "POST":
                return _run(view, request, merchant, body, kwargs)
            return _idempotent(view, request, merchant, body, kwargs)

        return wrapper

    return decorate


def _idempotent(view, request, merchant, body, kwargs) -> HttpResponse:
    mode = settings.IDEMPOTENCY_MODE
    key = request.headers.get("Idempotency-Key")
    if mode == "off" or (mode == "optional" and not key):
        return _run(view, request, merchant, body, kwargs)
    if not key:
        return error(400, "idempotency_key_required", "send an Idempotency-Key header")
    if len(key) > 255:
        return error(400, "idempotency_key_invalid", "Idempotency-Key is at most 255 characters")

    digest = fingerprint(request, body)
    with transaction.atomic():
        try:
            with transaction.atomic():
                record = IdempotencyKey.objects.create(
                    merchant=merchant,
                    key=key,
                    fingerprint=digest,
                    method=request.method,
                    path=request.path,
                )
        except IntegrityError:
            existing = IdempotencyKey.objects.get(merchant=merchant, key=key)
            if existing.fingerprint != digest:
                return error(
                    422,
                    "idempotency_key_reused",
                    "this Idempotency-Key was used with a different request",
                )
            replay = HttpResponse(
                existing.response_body,
                status=existing.response_status,
                content_type="application/json",
            )
            replay[REPLAY_HEADER] = "true"
            return replay
        response = _run(view, request, merchant, body, kwargs)
        record.response_status = response.status_code
        record.response_body = response.content.decode()
        record.save(update_fields=["response_status", "response_body"])
        return response
