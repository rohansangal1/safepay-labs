"""Password hashing for researcher accounts (Argon2id via argon2-cffi)."""

import secrets

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

_hasher = PasswordHasher()

# Verified when the email is unknown or disabled, so a miss costs the same as a wrong password
# and response time does not reveal which emails have accounts.
_DUMMY_HASH = _hasher.hash(secrets.token_urlsafe(32))


def generate_password() -> str:
    """A random password for a new researcher: 24 URL-safe characters (~144 bits)."""
    return secrets.token_urlsafe(18)


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerificationError, InvalidHashError):
        return False


def burn_verification(password: str) -> None:
    """Spend the same work as a real verification without accepting anything."""
    verify_password(_DUMMY_HASH, password)


def needs_rehash(password_hash: str) -> bool:
    """True when the stored hash uses older parameters than the current defaults."""
    return _hasher.check_needs_rehash(password_hash)
