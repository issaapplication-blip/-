# RAFIQ — contracted-centre announcements and one-use discount codes

## Public platform boundary

The public RAFIQ website is an informational directory and advertising surface only:
- Medical laboratories.
- Medical imaging and radiology centres.
- Physiotherapy centres.
- Medical equipment sales and rental centres.
- A separate CV and Cover Letter service with its agreed prices.

The public website does not accept care requests, provider registrations, centre registrations, or general applications. Telegram bots, Telegram channels, WhatsApp channels, and WhatsApp conversations are operated separately from the website. The website does not embed their links, send messages, or publish to those channels.

## Centre onboarding and advertisements

1. RAFIQ management contacts a centre privately.
2. Centre details and the service scope are reviewed.
3. A written commercial agreement is completed before the centre is described as a contracted partner.
4. The centre's advertisement, service category, region, offer value, start/end dates, and redemption conditions are reviewed.
5. Only approved advertisements are published on the public announcements page.
6. No centre name, discount, price, or availability is invented or published before approval.

The announcements page intentionally shows an empty state until the first contracted offer is approved. Individual customer discount codes must never be displayed publicly.

## Customer case and code lifecycle

Case communication is handled privately by RAFIQ management through Telegram and WhatsApp. WhatsApp remains manual-only; there is no Meta/Kapso webhook or automated WhatsApp sending.

A one-time code must be:
- Random and unguessable; store only a cryptographic hash in the database.
- Bound to one contracted centre and one approved offer.
- Bound to one customer case (or a privacy-preserving customer reference).
- Issued with the discount value/type, expiry time, and redemption conditions.
- Delivered privately to the customer; never posted in a public channel.

Lifecycle:

`issued → redeemed` or `issued → expired/cancelled`

The centre confirms the customer's presented code to RAFIQ management through its agreed private Telegram/WhatsApp contact. Management records redemption through the authorized Telegram admin workflow. The database operation must be atomic: only a code whose status is still `issued` and whose expiry is in the future can change to `redeemed`. A second attempt must return an already-used/invalid result and must not create a second discount.

The redemption record should capture the centre, offer, code hash, case reference, issue time, expiry, redemption time, and the authorized manager who confirmed it. Do not collect diagnoses or unnecessary medical details.

## Required implementation before live use

- Add a private Supabase table for offers and one-use discount codes.
- Add RLS that denies public reads and writes.
- Add narrowly scoped admin-only RPCs for issuing, cancelling, and atomically redeeming a code.
- Add Telegram admin commands for case creation, code issue, and redemption confirmation, restricted to the configured manager IDs.
- Keep WhatsApp communication manual. Management can send the customer code and centre details in WhatsApp, then record final redemption through the secure Telegram admin workflow.
- Add audit events for issue, cancel, and redeem actions.
- Test concurrent redemption attempts; exactly one may succeed.

No database migration has been applied and no live coupon codes have been issued. The existing Supabase project must be accessible before the schema and Telegram workflow can be deployed.
