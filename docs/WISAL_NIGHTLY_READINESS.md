# RAFIQ | رفيق — Pre-Launch Readiness

## Security
- [ ] Supabase RLS reviewed table-by-table with positive and negative tests.
- [ ] Private Storage buckets and object ownership policies tested.
- [ ] No service-role/OpenAI/Meta/payment secrets in frontend or Git.
- [ ] Production secrets stored only in server-side secret storage.
- [ ] Authentication/session expiry and role authorization tested.
- [ ] Rate limits and abuse controls enabled.
- [ ] Security headers and HTTPS verified.
- [ ] Webhook signature verification tested.
- [ ] Audit logs tested for privileged operations.
- [ ] Dependency/security audit completed.
- [ ] Backup and recovery plan verified.

## AI agent
- [ ] Playbook version pinned.
- [ ] Prompt-injection tests run against CVs, messages, PDFs, and hostile text.
- [ ] Matching hard filters tested before AI ranking.
- [ ] Every recommendation has evidence and uncertainty.
- [ ] Human approval queue blocks consequential actions.
- [ ] No autonomous clinical decisions.
- [ ] No production self-training from raw conversations.

## WhatsApp
- [ ] Meta Business/WABA/phone identifiers verified.
- [ ] Webhook endpoint and verification token configured server-side.
- [ ] Access token stored server-side only.
- [ ] Templates reviewed/approved as required.
- [ ] Test recipient/account verified.
- [ ] Draft → human approval → send flow tested.
- [ ] Real sending remains OFF until explicit launch approval.

## Contracts
- [ ] Lebanese legal review completed.
- [ ] Caregiver agreement approved.
- [ ] Family/client agreement approved.
- [ ] Professional-provider addendum approved.
- [ ] Privacy/data consent approved.
- [ ] WhatsApp consent approved.
- [ ] Assignment/service-order template approved.

## Launch decision
Only after all mandatory checks pass may RAFIQ move from preparation/testing to controlled production operation.
