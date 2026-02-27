# StudySpot - AI Engineering Rules

This document defines strict rules that all AI tools (Codex, ChatGPT, etc.) must follow when generating code for this repository.

These rules are mandatory to ensure architectural consistency and mobile portability.

## 1. Tech Stack (Locked)

Frontend:
- Next.js (App Router)
- React (functional components only)
- TypeScript

Backend:
- FastAPI
- SQLAlchemy 2.0
- PostgreSQL (Supabase)
- Pydantic v2
- JWT Authentication

This is a monolithic MVP.

Do not introduce:
- Microservices
- WebSockets
- Background workers
- Redis
- Caching layers
- GraphQL
- Docker orchestration
- Additional frameworks unless explicitly approved

## 2. Backend Folder Structure (Strict)

Backend must follow this structure:

```text
app/
|- routes/
|- services/
|- models/
|- schemas/
\- core/
```

Rules:
- `routes/` -> Request parsing and response formatting only
- `services/` -> All business logic
- `models/` -> SQLAlchemy models only
- `schemas/` -> Pydantic schemas only
- `core/` -> Config, auth utilities, shared dependencies

Do not:
- Put business logic inside routes
- Query the database inside routes
- Import routes into services
- Create circular imports

Routes may only call service functions.

## 3. Domain Ownership (No Cross-Editing)

Ownership:
- Pablo -> locations + availability
- Humberto -> auth + sessions
- Miguel -> check-ins + social
- Ari -> frontend UI

Rules:
- Do not modify another domain's files.
- If cross-domain access is needed, create a service function.
- Do not directly import across domains without approval.

## 4. Database Rules

- All primary keys must use UUID.
- Never use integer auto-increment IDs.
- All relationships must use foreign keys.
- No redundant columns.
- No frontend-only fields inside models.

Design must support:
- Multi-city expansion
- Future ML integration
- Scalability

Avoid premature optimization.

## 5. API Response Format (Mandatory)

All endpoints must return:

Success:
```json
{
  "success": true,
  "data": {},
  "error": null
}
```

Failure:
```json
{
  "success": false,
  "data": null,
  "error": "Error message"
}
```

Rules:
- Never return raw SQLAlchemy objects.
- Always serialize using Pydantic schemas.
- Always handle errors explicitly.
- Never expose internal stack traces.

## 6. Availability Engine Rules

All availability logic must live in:

`services/availability_service.py`

Rules:
- No availability logic inside routes.
- No hardcoded availability values.
- Must support:
  - Baseline time-of-day trends
  - Weighted recent check-ins
  - Time decay
  - Confidence scoring

Design for future ML replacement.

## 7. Authentication Rules

- JWT-based authentication only.
- Stateless backend.
- No session-based auth.
- Protected routes must use dependency injection.
- No role-based systems.

Auth exists only to:
- Enable check-ins
- Enable sessions
- Enable social features

## 8. Frontend Rules (Mobile-First)

Frontend must:
- Be mobile-first responsive
- Use functional components only
- Avoid class components
- Avoid hover-only interactions
- Avoid browser-only APIs that break React Native portability

Frontend must remain a thin UI layer over the API.

No business logic inside components.

## 9. Simplicity Rule

This is an MVP.

Do not introduce:
- Advanced caching
- Background schedulers
- Complex abstractions
- Premature optimization
- Over-engineered patterns

If a solution feels complex, simplify it.

## 10. Testing Standard

Before frontend integration:
- Every endpoint must be testable in Postman.
- All responses must follow the standard JSON format.
- Edge cases must return controlled errors.

An endpoint is incomplete if it cannot be tested independently.

## 11. AI Code Generation Rules

When generating code, AI must:
- Follow the existing folder structure.
- Not introduce new frameworks.
- Not modify unrelated files.
- Respect domain ownership.
- Keep implementations minimal and clear.
- Avoid speculative improvements.

If unsure, generate the minimal valid implementation.

## 12. Mobile Portability Requirement

Backend must remain compatible with:
- Web client
- Future iOS app
- Future Android app

If the frontend is replaced, backend must require zero changes.

## Final Validation Checklist

Before generating code, verify:

1. Does this respect backend layering?
2. Does this respect domain ownership?
3. Is this mobile-portable?
4. Is this over-engineered?
5. Does this follow the API response format?

If any rule is violated, revise before outputting code.
