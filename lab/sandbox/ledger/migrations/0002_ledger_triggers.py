"""Database-level ledger guarantees, so they hold even for code that bypasses the services.

- Entries and journal transactions are immutable: UPDATE and DELETE raise. (TRUNCATE, used to
  reset a whole sandbox, doesn't fire row triggers.)
- A journal transaction's entries must sum to zero. The check is a constraint trigger, deferred to
  commit by default so entries can be inserted one by one; `SET CONSTRAINTS ALL IMMEDIATE` makes it
  fire at the end of each statement instead (the tests do this).
"""

from django.db import migrations

FORWARD = """
CREATE FUNCTION ledger_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'ledger rows are immutable: % on %', TG_OP, TG_TABLE_NAME
        USING ERRCODE = 'restrict_violation';
END
$$;

CREATE TRIGGER ledger_entry_immutable
    BEFORE UPDATE OR DELETE ON ledger_entry
    FOR EACH ROW EXECUTE FUNCTION ledger_immutable();

CREATE TRIGGER ledger_journaltransaction_immutable
    BEFORE UPDATE OR DELETE ON ledger_journaltransaction
    FOR EACH ROW EXECUTE FUNCTION ledger_immutable();

CREATE FUNCTION ledger_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    total bigint;
BEGIN
    SELECT COALESCE(SUM(amount), 0) INTO total
        FROM ledger_entry WHERE transaction_id = NEW.transaction_id;
    IF total <> 0 THEN
        RAISE EXCEPTION 'journal transaction % does not balance (entries sum to %)',
            NEW.transaction_id, total
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NULL;
END
$$;

CREATE CONSTRAINT TRIGGER ledger_entry_balanced
    AFTER INSERT ON ledger_entry
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION ledger_balanced();
"""

BACKWARD = """
DROP TRIGGER IF EXISTS ledger_entry_balanced ON ledger_entry;
DROP FUNCTION IF EXISTS ledger_balanced();
DROP TRIGGER IF EXISTS ledger_journaltransaction_immutable ON ledger_journaltransaction;
DROP TRIGGER IF EXISTS ledger_entry_immutable ON ledger_entry;
DROP FUNCTION IF EXISTS ledger_immutable();
"""


class Migration(migrations.Migration):
    dependencies = [("ledger", "0001_initial")]
    operations = [migrations.RunSQL(FORWARD, BACKWARD)]
