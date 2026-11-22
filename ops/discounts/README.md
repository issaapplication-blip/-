# RAFIQ discount-code procedure

This directory contains a public template and procedure only. Never commit live codes, customer names, phone numbers, provider quotes, recipient identifiers, or redemption records.

## Current policy — management decides each discount

There is no fixed discount percentage, fixed amount, public price list, or calculation formula at this stage.

The discount decision is made only after management identifies the exact service and confirms the actual agreed price with the provider:
- Laboratory tests: routine panels, hormone tests, vitamins, oncology-related tests, and any other specific test or panel.
- Imaging and diagnostics: X-ray, ultrasound/echo, MRI, CT/scanner, ECG, EEG, and any other specific modality or examination.

The assistant may collect the exact requested test/modality and the provider/area if known. It must not quote or calculate a discount. Management checks the actual service and provider price, then decides whether a discount applies and sets its amount or percentage, eligibility, and terms.

## One-time code workflow

1. Receive the customer's inquiry and exact service details.
2. Management confirms the exact service and current price with the approved provider.
3. Management records the approved discount basis (percentage or fixed amount), value, currency where relevant, eligibility, validity dates, and terms in a private register.
4. Generate a unique unpredictable code only after approval. Set `max_uses=1`.
5. Send the code through an official RAFIQ channel after management approval.
6. After the provider confirms redemption, mark the code used with a timestamp and provider reference. A used code is permanently closed.
7. Cancel or expire unused codes when appropriate.

## Status values

- pending_review
- approved
- issued
- used
- cancelled
- expired

The adjacent CSV is an empty schema template only. Store actual codes and commercial terms in private, access-controlled admin storage, never in this public repository.
