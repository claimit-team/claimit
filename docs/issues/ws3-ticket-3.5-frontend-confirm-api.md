# Frontend: Wire purchase confirmation page to real API (WS3 / depends on 3.5 backend)

**Workstream:** WS5 Frontend
**Depends on:** WS3 Ticket 3.5 (ingest confirmation email + api-gateway confirm/dismiss routes)
**Effort:** ~0.5d

## Summary

The confirmation UI at `/confirm/[purchaseId]` (ticket 5.14) uses mock handlers. Backend now exposes real endpoints to confirm or dismiss low-confidence purchases. Wire the client actions and differentiate dismiss reasons per master doc §5.1.

## API contract

Base URL: `process.env.NEXT_PUBLIC_API_BASE_URL` (same pattern as [`apps/web/src/lib/api/auth.ts`](../../apps/web/src/lib/api/auth.ts)).

Auth: Firebase ID token in `Authorization: Bearer <token>` (use `auth.currentUser.getIdToken()`).

### `POST /api/v1/purchases/{purchaseId}/confirm`

Confirms extraction and starts monitoring.

**Request:** empty body

**Success `200`:**

```json
{
  "purchase_id": "uuid",
  "status": "monitoring"
}
```

**Errors:**

| Status | Code | When |
|--------|------|------|
| 401 | `unauthorized` | Missing/invalid token |
| 404 | `not_found` | Unknown purchase or not owned by user |
| 409 | `invalid_status` | Purchase not in `pending_confirmation` |

### `POST /api/v1/purchases/{purchaseId}/dismiss`

Dismisses a pending confirmation.

**Request body:**

```json
{
  "reason": "not_an_order",
  "sender": "orders@merchant.example"
}
```

| Field | Required | Values |
|-------|----------|--------|
| `reason` | yes | `"not_an_order"` \| `"duplicate"` |
| `sender` | recommended for `not_an_order` | Original receipt email sender (for ingestion skiplist; ticket 3.7) |

**Success `200`:**

```json
{
  "purchase_id": "uuid",
  "status": "dismissed",
  "reason": "not_an_order",
  "skiplist_written": true
}
```

- `not_an_order`: backend sets `status=dismissed` and appends `User.ingestion_skiplist` (when `receipt_hash` present).
- `duplicate`: backend sets `status=dismissed` only (`skiplist_written: false`).

## UI changes

### Primary file

[`apps/web/src/components/confirm/action-bar.tsx`](../../apps/web/src/components/confirm/action-bar.tsx)

Replace mock `toast` + navigation with API calls:

1. **Confirm and start monitoring** → `POST .../confirm` → on success navigate to `/purchases/{purchaseId}`.
2. **Ignore / dismiss** → show dialog with **two** explicit choices (not one generic ignore):
   - **Not an order** → `POST .../dismiss` with `{ "reason": "not_an_order", "sender": "<from extraction if available>" }`
   - **Duplicate** → `POST .../dismiss` with `{ "reason": "duplicate" }`
3. Handle loading/disabled state on buttons while requests are in flight.
4. Surface API errors via toast (reuse existing `sonner` pattern).

### Suggested client module

Add `apps/web/src/lib/api/purchases.ts` mirroring `auth.ts` / `gmail.ts`:

```typescript
export async function confirmPurchase(purchaseId: string): Promise<void> { ... }
export async function dismissPurchase(
  purchaseId: string,
  body: { reason: "not_an_order" | "duplicate"; sender?: string },
): Promise<void> { ... }
```

### Data for `sender`

`ConfirmExtractionPayload` / mock data may include source email metadata. Pass through when available; backend defaults to `"unknown"` if omitted.

### Page load (follow-up, optional)

[`apps/web/src/app/(authenticated)/confirm/[purchaseId]/page.tsx`](../../apps/web/src/app/(authenticated)/confirm/[purchaseId]/page.tsx) still uses `mock-purchases`. A separate ticket can load real purchase + extraction from API once list/detail endpoints exist (WS6).

## Acceptance criteria

- [ ] Confirm button calls `POST /api/v1/purchases/:id/confirm` and navigates to purchase detail on success
- [ ] Dismiss dialog offers **Not an order** vs **Duplicate** with correct `reason` payloads
- [ ] Errors show user-visible feedback; no silent mock toasts
- [ ] Works with `NEXT_PUBLIC_API_BASE_URL` pointed at api-gateway (local or deployed)

## References

- Master doc §5.1 (low-confidence flow)
- Master doc §7.3.2 (`pending_confirmation` status)
- Backend: `apps/api-gateway/src/routes/purchases.py`
- Email deep link format: `{FRONTEND_BASE_URL}/confirm/{purchase_id}`
