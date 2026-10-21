# SecureVote — Hypothetical Financial Model

> **Educational project for the course Introduction to Finance. Not a real product, service or investment offer. Do not use with real funds.**
> Every figure below is a **hypothetical student assumption** or a value **calculated** from those assumptions. No market statistics, customers, partners or academic sources are claimed. The only external reference is the Kazakhstan corporate income tax rate (see assumption list), which must be verified against the official text before any real use.

## 1. How the model is built (traceability)

| Layer | File | What it contains |
|---|---|---|
| Assumptions | [`docs/finance/assumptions.json`](finance/assumptions.json) | Every input number with a one-line `basis` explaining where it comes from. |
| Calculations | [`docs/finance/model.mjs`](finance/model.mjs) | Pure JavaScript formulas (revenue, costs, tax, cash flow, NPV, payback, break-even, scenarios). |
| Tests | [`docs/finance/model.test.mjs`](finance/model.test.mjs) | Checks of the NPV/payback formulas, no double counting, tax logic, scenario ordering. |
| Outputs | [`docs/finance/output/`](finance/output/) | CSV per scenario (open in Excel/Sheets) and `model-output.md`. |

Regenerate everything (including the tables in section 5 of this file) with:

```bash
npm run finance:model      # recalculates and rewrites the generated tables
npm run test:finance       # verifies the formulas
```

To answer "where does this number come from?", find the row in the tables, look up the formula in `model.mjs`, and the input in `assumptions.json`.

## 2. Business model (hypothetical)

SecureVote would be sold B2B to organizations that hold formal votes — hypothetical segments: joint-stock companies, corporate boards, homeowners' associations and non-profit organizations. **None of these are actual customers or partners.**

| Revenue stream | Assumed price (excl. VAT) | Revenue recognition in the model |
|---|---|---|
| Annual subscription (unlimited sessions) | 3,600,000 KZT / year (300,000 KZT / month) | Average of opening and closing subscribers × price |
| Pay-per-session | 400,000 KZT / voting session | Sessions sold × fee |

## 3. Consistent definitions (no double counting)

- **Revenue** = subscription revenue + pay-per-session revenue (VAT excluded and treated as pass-through).
- **Initial investment (Year 0)** = product development 18.0 m + external security audit 12.0 m + legal/regulatory review 6.0 m + company setup 2.0 m = **38.0 m KZT**. These items appear **only** in Year 0. They are not repeated in operating expenses.
- **Operating expenses (Years 1–3)** = team, infrastructure, ongoing legal/compliance, recurring re-audits (Years 2–3), sales & marketing (CAC × gross new subscribers + 5 % commission on per-session revenue), general & administrative.
- **Income statement treatment of Year 0**: product development (18 m) is capitalised and amortised straight-line over 3 years (6 m/year, non-cash). The other Year-0 items (20 m) are pre-operating expenses recognised in Year 0.
- **EBITDA** = revenue − operating expenses. **EBIT** = EBITDA − amortisation.
- **Corporate income tax** = 20 % × positive EBIT after carrying forward earlier losses (simplified).
- **Free cash flow** = EBITDA − cash tax (Years 1–3); **Year 0 free cash flow = −initial investment**. Amortisation is excluded because it is not a cash payment. Working-capital changes are assumed to be zero.
- **NPV** = Σ FCFₜ / (1 + r)ᵗ for t = 0..3, with **r = 25 %** (course range 20–30 %; chosen to reflect early-stage risk — an assumption, not market data).
- **Payback** = time until cumulative FCF ≥ 0 (linear interpolation within the year); **discounted payback** uses discounted FCF.
- **Break-even** = average number of subscribers at which EBITDA = 0 in a given year, holding that year's other costs and pay-per-session sales constant.

## 4. Key assumptions (summary)

| Area | Assumption | Value |
|---|---|---|
| Customers | Closing subscribers (Y1/Y2/Y3) | 8 / 25 / 55 |
| | Annual churn | 10 % of opening subscribers |
| | Pay-per-session elections (Y1/Y2/Y3) | 25 / 60 / 110 |
| Acquisition | CAC per new subscriber | 800,000 KZT |
| Team | Average FTE (Y1/Y2/Y3) × 600,000 KZT/month fully loaded | 4 / 6 / 8 |
| Infrastructure | 2.4 m fixed + 120,000 per avg. subscriber + 20,000 per session | per year |
| Legal & compliance | Ongoing | 3.0 m / year |
| Security | Re-audit in Years 2 and 3 | 5.0 m / year |
| G&A | Office, accounting, licences, insurance | 4.8 m / year |
| Tax | Corporate income tax | 20 % — general CIT rate under the Tax Code of the RK No. 214-VIII of 18 July 2025, in force from 1 January 2026 ([adilet.zan.kz/rus/docs/K2500000214](https://adilet.zan.kz/rus/docs/K2500000214)); confirmed by secondary summaries (e.g. [Moore Kazakhstan](https://kazakhstan.moore-global.com/corporate-income-tax-changes-effective-from-2026/)). **Verify the official text.** |
| Valuation | Discount rate / terminal growth (supplementary only) | 25 % / 5 % |
| Funding | Safety buffer on peak cash need, rounded up to 5 m | 20 % |

## 5. Results (generated)

<!-- MODEL:START -->
_Generated by `npm run finance:model` from `docs/finance/assumptions.json` on 2026-10-21. Do not edit by hand._

### Key results (base case)

- **3-year NPV at 25% (no terminal value): -13.84 million KZT**
- Supplementary NPV including a Gordon-growth terminal value (g = 5%): 186.50 million KZT — highly sensitive to the Year-3 cash flow; shown for discussion only.
- Payback (undiscounted): 2.73 years; discounted payback: not within 3 years
- Operating break-even (first year with EBITDA ≥ 0): Year 2
- Peak cumulative cash need: 60.48 million KZT → funding request incl. 20% buffer: **75.00 million KZT**
- Runway after the Year-0 investment at the Year-1 burn rate: 19.8 months

### Customers and break-even

| Customers | Year 1 | Year 2 | Year 3 |
|---|---:|---:|---:|
| Opening subscribers | 0 | 8 | 25 |
| Churned (10% of opening, rounded) | 0 | 1 | 3 |
| Gross new subscribers | 8 | 18 | 33 |
| Closing subscribers | 8 | 25 | 55 |
| Average subscribers (revenue basis) | 4.0 | 16.5 | 40.0 |
| Pay-per-session elections | 25 | 60 | 110 |
| Break-even average subscribers (EBITDA = 0) | 10.5 | 14.7 | 17.1 |

### Projected income statement

| (million KZT) | Year 0 | Year 1 | Year 2 | Year 3 |
|---|---:|---:|---:|---:|
| Subscription revenue | — | 14.40 | 59.40 | 144.00 |
| Pay-per-session revenue | — | 10.00 | 24.00 | 44.00 |
| **Total revenue** | — | **24.40** | **83.40** | **188.00** |
| Team (salaries incl. taxes) | — | -28.80 | -43.20 | -57.60 |
| Infrastructure | — | -3.38 | -5.58 | -9.40 |
| Legal & compliance | — | -3.00 | -3.00 | -3.00 |
| Recurring security audit | — | 0.00 | -5.00 | -5.00 |
| Sales & marketing (CAC + commission) | — | -6.90 | -15.60 | -28.60 |
| General & administrative | — | -4.80 | -4.80 | -4.80 |
| Pre-operating expenses (audit, legal, setup) | -20.00 | — | — | — |
| **EBITDA** | -20.00 | **-22.48** | **6.22** | **79.60** |
| Amortisation of capitalised development | — | -6.00 | -6.00 | -6.00 |
| EBIT | -20.00 | -28.48 | 0.22 | 73.60 |
| Corporate income tax (after loss carry-forward) | — | 0.00 | 0.00 | -5.07 |
| **Net income** | -20.00 | **-28.48** | **0.22** | **68.53** |

### Projected cash-flow statement and discounting (r = 25%)

| (million KZT) | Year 0 | Year 1 | Year 2 | Year 3 |
|---|---:|---:|---:|---:|
| EBITDA (cash operating result) | — | -22.48 | 6.22 | 79.60 |
| Cash tax paid | — | 0.00 | 0.00 | -5.07 |
| Initial investment (development, audit, legal, setup) | -38.00 | — | — | — |
| **Free cash flow** | **-38.00** | **-22.48** | **6.22** | **74.53** |
| Cumulative cash flow | -38.00 | -60.48 | -54.26 | 20.27 |
| Discount factor | 1.0000 | 0.8000 | 0.6400 | 0.5120 |
| Discounted cash flow | -38.00 | -17.98 | 3.98 | 38.16 |

### Scenarios

| Scenario | Revenue Y3 | EBITDA Y3 | NPV @25% (3 yrs) | Payback | Peak cash need | Funding incl. buffer |
|---|---:|---:|---:|---|---:|---:|
| Base case | 188.00 | 79.60 | -13.84 | 2.73 years | 60.48 | 75.00 |
| Pessimistic 1 — slow adoption (customers −40%) | 112.80 | 18.48 | -64.10 | not within 3 years | 86.34 | 105.00 |
| Pessimistic 2 — price pressure −25%, salaries +15%, audits +50% | 141.00 | 22.01 | -73.87 | not within 3 years | 100.09 | 125.00 |
| Pessimistic 3 — 6-month regulatory delay (Year-1 revenue −50%, +5m KZT legal) | 188.00 | 79.60 | -25.67 | 2.91 years | 77.43 | 95.00 |

### Sensitivity analysis

| Sensitivity of 3-year NPV (million KZT) | 20% | 25% | 30% |
|---|---:|---:|---:|
| Base case | -9.28 | -13.84 | -17.69 |
| Subscribers −20% | -36.66 | -38.66 | -40.28 |
| Subscribers +20% | 15.85 | 8.99 | 3.14 |
| Prices −20% | -43.25 | -44.62 | -45.70 |
| Prices +20% | 20.87 | 13.55 | 7.32 |

### Funding request and use of funds

| Use of funds | million KZT | Share |
|---|---:|---:|
| Product development (capitalised) | 18.00 | 24.0% |
| External smart-contract & application security audit | 12.00 | 16.0% |
| Legal & regulatory review (Kazakhstan) | 6.00 | 8.0% |
| Company setup & equipment | 2.00 | 2.7% |
| Operating losses until cash-flow positive | 22.48 | 30.0% |
| Safety buffer / rounding | 14.52 | 19.4% |
| **Total funding request** | **75.00** | 100% |

<!-- MODEL:END -->

## 6. Interpretation (for the project defense)

1. **The 3-year NPV of the base case is negative at a 25 % discount rate.** The business only becomes strongly cash-positive in Year 3, and three years is a short horizon for a venture that needs a security audit and legal review before its first sale. We report this honestly rather than tuning assumptions to obtain a positive number.
2. **Undiscounted payback falls within Year 3**, but **discounted payback** does not occur within the 3-year horizon.
3. The **supplementary NPV with a terminal value** is strongly positive, but it depends almost entirely on a single assumption (Year-3 cash flow growing at 5 % forever at a 25 % required return). It is useful for discussion, not as a decision basis.
4. **Sensitivity**: NPV reacts most strongly to **price** and **number of subscribers**. A 20 % increase in either turns the 3-year NPV positive; a 20 % decrease makes it clearly negative. The discount rate (20–30 %) matters less over 3 years.
5. **Pessimistic scenarios** increase the funding need from 75 m to between 95 m and 125 m KZT. The funding request should therefore be staged (e.g. a second tranche conditional on reaching ~25 subscribers).
6. **Nothing in this model guarantees any return.** It is a structured way to reason about assumptions.

## 7. Funding request and runway (hypothetical)

The hypothetical funding request equals the base-case peak cumulative cash need plus a 20 % buffer (see generated table). With the Year-0 investment spent, the remaining funds cover roughly the number of months of Year-1 net burn shown above (runway). Milestones a hypothetical investor would expect before a second tranche: completed external audit, legal opinion on electronic voting for JSCs in Kazakhstan, ≥ 10 paying organizations, and a working disaster-recovery procedure.

## 8. Limitations of the model

- Annual granularity (no monthly cash flow); working capital ignored; VAT ignored.
- Tax treatment simplified (loss carry-forward, amortisation); not tax advice.
- No financing costs, dividends, currency risk or inflation.
- Customer numbers, prices, CAC and churn are untested hypotheses — validating them (customer interviews, pilots) would be the first real-world step.
