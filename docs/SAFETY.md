# Safety, authorization and compliance plan
Draft operational design, not a finding that the project complies with every applicable law. Research affiliation and jurisdiction remain unspecified. Obtain a scoped institutional/legal determination before external collection.

## Collection tiers
| Tier | Permitted study activity | Required gate |
|---|---|---|
| Owned offline lab | Synthetic data, local models, instrumented owned fixtures | Ownership, isolated environment and synthetic-data check |
| Provider sandbox | Normal documented test flows in researcher-owned accounts | Provider terms and sandbox scope review; explicit test credentials |
| Consented partner staging | Named flows, bounded negative cases, owned test accounts | Written target/action/time authorization, provider limits, incident contact |
| Public surface census | Approved low-rate retrieval of public pages/metadata | Terms, access, robots/site policy and privacy review; no active payment testing |
| Production active testing | Outside this initial protocol | A separate authorization, legal/ethics review and financial-impact protocol |

Authorization from a merchant is not permission to attack a processor, CDN or unrelated third party. Test cards belong only in intended sandbox flows. Never attempt to use them in production. Do not place live orders, trigger fulfillment, consume inventory, initiate real refunds/disputes, send forged events to external targets, or probe other users' objects under this protocol. An own credit card does not authorize adversarial testing of a merchant.

## Enforced controls for the future runner
The current prototype has no network test runner. Implement these before any collection:
- A signed/reviewed scope record naming exact origins, ports, account IDs, actions, environments, expiration, request budgets, owners and incident contacts.
- Deny by default. Validate all navigation, redirects, popup, worker and API destinations, not just the first URL. Egress policy at the network/container layer complements browser routing; DNS/IP checks must address rebinding and metadata endpoints.
- Separate sandbox secrets and credentials. Verify test-mode state from provider objects/configuration, rather than relying only on key prefixes or a URL label. Never accept arbitrary user-supplied target URLs in the dashboard.
- Start with one browser worker per target, bounded retries and an agreed budget; stop on 429s, unplanned personal/card data, live-mode indicators, unauthorized origin, financial effect or owner request. Keep an immediate kill switch and audit trail.
- Prevent order shipment, customer notifications and real inventory changes in fixtures. Test only synthetic identities. Disable outbound email/SMS and production integrations.
- Browser traces and HAR files can contain credentials, tokens and personal data. Prefer allowlisted derived fields; redact before durable storage. Avoid request bodies and full query strings by default. Never log secret keys, cookies, PAN or CVV. Store only necessary metadata and cryptographic artifact hashes.

## Data governance
Proposed retention: raw lab traces no longer than 7 days; redacted consented evidence no longer than 30 days pending agreement; aggregate/pseudonymous research records under the approved reproducibility policy. These are proposed ceilings, not legal retention requirements. Encrypt permitted retained evidence, restrict access, audit exports and keep any merchant-identity mapping separately. Review deletion/withdrawal obligations and access requests for the applicable jurisdiction.

Pseudonymous data can still be personal or reidentifiable. Do not claim anonymization because a domain or user ID is hashed. If GDPR applies, document purposes, controller/processor roles, lawful basis, data minimization, storage limitation, any required DPIA and transfer safeguards; research purpose is not a universal exemption. Other local privacy and computer misuse laws need jurisdiction-specific review.

## PCI and payment regulation
PIAS does not replace PCI DSS validation, an SAQ, a QSA assessment or provider compliance requirements. PCI is an industry security standard with contractual ecosystem obligations; do not equate it with a universal law. Architecture affects scope but does not prove compliance. PCI SSC FAQ 1588 distinguishes embedded forms from redirects for a particular SAQ A script eligibility criterion; other conditions still apply. Confirm the relevant questionnaire and evidence with the acquirer/compliance-accepting entity.

EU/UK payment authentication and payment-services rules may affect real deployments, but the synthetic study must not claim to test or certify SCA/PSD2 compliance merely by exercising sandbox 3DS screens. Native 3DS and delayed-payment scenarios should be tested through supported sandbox flows. Avoid holding/transmitting real funds; revisit regulatory scope if the project becomes a payment service.

## Authorization and ethics
The U.S. DOJ good-faith research charging policy is not blanket immunity from civil claims, other laws or provider terms. Written scope remains necessary. Institutional ethics/IRB applicability depends on institution, funding, interactions and identifiability; request a determination instead of assuming all internet research is exempt. If independent, obtain an appropriate external ethics and legal review for external work.

## Disclosure and publication
Use a private report with minimal reproduction, scope, impact, evidence and remediation. Verify findings with the owner before publication and avoid naming unconfirmed vulnerable merchants. Negotiate disclosure timing; a 90-day target is a proposal, not permission to publish sensitive details automatically. Release synthetic fixtures, aggregate results and sanitized evidence schemas. Keep merchant identifiers, credentials and raw production traces out of public repositories and issue trackers.

Primary references and exact links are in LITERATURE.md. This plan reduces avoidable risk but cannot certify legal compliance until jurisdiction, affiliation, processors and collection scope are known.
