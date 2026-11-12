#!/bin/sh
# serve: migrate a fresh database, then run the API. test: run pytest. Anything else: exec it.
set -eu
case "${1:-serve}" in
  serve)
    python manage.py migrate --noinput -v 0
    python manage.py ensure_admin
    if [ "${SANDBOX_SEED_DEMO:-0}" = "1" ]; then python manage.py seed_demo; fi
    exec gunicorn sandbox.wsgi --bind 0.0.0.0:8000 --workers 2 --threads 4 --access-logfile -
    ;;
  test)
    shift
    exec pytest -p no:cacheprovider "$@"
    ;;
  *)
    exec "$@"
    ;;
esac
