# Prime Local Growth Revenue Operating System

## Revenue path

1. Qualified local-service business requests the free visibility audit.
2. Adam reviews the listing and sends a plain-language finding within two business days.
3. The best-fit next step is the $497 30-Day Google Maps Opportunity Sprint.
4. The results review determines whether $497/month Visibility Management has evidence-backed value.
5. Stripe payment moves the lead to `Won` and starts onboarding automatically.

## Sales stages

Use only these values in `Lead Stage`:

- `New`
- `Qualified`
- `Audit in progress`
- `Audit delivered`
- `Conversation`
- `Proposal or invoice sent`
- `Won`
- `Nurture`
- `Lost`

Every open lead must have an `Owner` and `Next Action At`. After every call or email, update `Last Contact At`, stage, and the next action date. The daily Apps Script digest emails overdue actions to Adam. Stripe sets paid customers to `Won` and clears the next action automatically.

## Service levels

- New inbound lead: personal response the same business day.
- Free audit: findings delivered within two business days.
- Audit follow-up: two business days after delivery.
- Proposal or invoice: follow up after two and five business days, then move to `Nurture` or `Lost`.
- Paid client: onboarding begins immediately from the verified Stripe event.

## Weekly scorecard

Review every Friday:

- Qualified leads by source
- Audits requested, started, and delivered
- Audit-to-conversation rate
- Conversation-to-invoice rate
- Invoice-to-paid rate
- New cash collected and new MRR
- Open pipeline value and overdue next actions
- Time from request to first personal response

Do not add another CRM until the Sheet can no longer support the volume. The current system is intentionally inexpensive, inspectable, and tied to verified payment events.

## Agent operating contract

For Claude, Codex, or another operator: work from the Sheet and live provider evidence; select the highest-value overdue action; prepare the needed research or draft; never claim outreach was sent without provider confirmation; and record the resulting stage, contact time, next action, and lesson. This applies the useful Fable 5 pattern of persistent state, long-horizon execution, and evidence-backed self-verification without placing an expensive model in the customer request path.
