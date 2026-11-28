# RAFIQ — Protected institution location and discount access policy

## Public directory display
- Public visitors may see the **names of hospitals only** as institution identity labels.
- For all other institution categories, do not publish street address, building/location pin, map coordinates, branch-level directions, or other precise location data.
- Public category and search pages must not include hidden precise addresses in HTML, JSON-LD, page source, client-side state, static JSON, map payloads, or downloadable assets.
- Hospital names being public does not imply that their street addresses or coordinates are public.

## Administrative release workflow
1. An authenticated administrator reviews an institution and records an explicit approval for a specific recipient/use case.
2. The administrator records the agreed discount value and unit (percentage or fixed amount), effective dates, eligible service/category, and any limits. Never invent a default discount.
3. The server creates a cryptographically random, high-entropy, opaque token. Store only a cryptographic hash of the token, linked to the institution, approval, recipient/eligibility, discount terms, expiry, creator, and audit metadata.
4. The recipient opens the link. A server-side transaction validates token hash, expiry, approval state, recipient constraints, and unused status; then atomically marks it consumed before returning the protected detail. Replays and concurrent reuse must fail.
5. Do not put institution address, coordinates, discount terms, or recipient identity in the URL. The token is a bearer credential and must not be logged in plaintext; use no-referrer responses and short expiry.
6. Revoke outstanding tokens when approval is withdrawn or terms change. Record issue, redemption, expiry, revocation, and failed replay events in an audit log.

## Security requirements
- Enforce authorization in server-side endpoints and database RLS; hiding elements in the browser is not access control.
- Do not expose service-role or secret keys in static assets or browser code.
- Public queries must select only explicitly public fields. Do not fetch private addresses and merely mask them in the UI.
- Use an atomic one-time redemption operation with transaction/row locking or an equivalent compare-and-set condition.
- Administrative approval must be checked server-side against a trusted authorization source, not user-editable metadata or a client-supplied flag.
- Use HTTPS, rate limits, short-lived links, and audit logging. Avoid third-party analytics/referrer leakage on redemption pages.

## Discount representation
- Store amount and unit separately (e.g. 10 + percent, or 5 + USD), with currency where relevant.
- Store the agreed terms per approval/recipient case; do not expose or imply a universal discount.
- Public listing pages must not display private negotiated discount values.

## Deployment gate
This policy cannot be safely enabled until the existing Supabase project is accessible, its schema/RLS/auth and current backend endpoints are inspected, and a server-side implementation plus negative/replay tests are completed. Do not create a replacement Supabase project or alter existing data as a workaround.
