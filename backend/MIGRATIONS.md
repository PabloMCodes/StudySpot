# Database Migrations Workflow

StudySpot schema changes are managed **only** through Alembic migrations.

## One-time setup

From `backend/`:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Ensure `DATABASE_URL` is set in your environment (or load `backend/.env` before running Alembic commands).

## Current migration layout

- `alembic.ini`
- `migrations/env.py`
- `migrations/versions/*.py`

`migrations/env.py` uses:

- `database.Base.metadata` as `target_metadata`
- `import models` so all SQLAlchemy models register with metadata
- `DATABASE_URL` from environment variables

## Required schema-change flow

1. Update the SQLAlchemy model(s).
2. Generate a migration:

```bash
set -a && source .env && set +a
.venv/bin/alembic revision --autogenerate -m "describe change"
```

3. Apply the migration:

```bash
set -a && source .env && set +a
.venv/bin/alembic upgrade head
```

## Non-negotiable rules

- Never run `Base.metadata.create_all()`.
- Never manually edit tables in the Supabase UI.
- Never run `supabase db reset` for schema management.
- Never skip migrations for schema changes.
- SQLAlchemy models remain the source of truth, and Alembic migrations are the only execution path for schema changes.

## Useful Alembic commands

```bash
.venv/bin/alembic history
.venv/bin/alembic current
.venv/bin/alembic downgrade -1
```
