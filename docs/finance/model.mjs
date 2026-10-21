#!/usr/bin/env node
/**
 * SecureVote — transparent 3-year financial model (HYPOTHETICAL, educational).
 *
 * Every output number is computed from docs/finance/assumptions.json by the formulas in
 * this file. Run:  npm run finance:model
 * It writes docs/finance/output/*.csv and refreshes the generated section of
 * docs/FINANCIAL_MODEL.md (between the MODEL:START / MODEL:END markers).
 *
 * Definitions (used consistently):
 *  - Revenue: subscription revenue + pay-per-session revenue (excl. VAT).
 *  - Operating expenses (OPEX): recurring yearly costs only. Year-0 initial investment
 *    items are NOT repeated here (no double counting).
 *  - EBITDA = Revenue − OPEX.  EBIT = EBITDA − amortisation of capitalised development.
 *  - Free cash flow (FCF) = EBITDA − cash tax (Years 1–3); Year 0 FCF = −initial investment.
 *    Amortisation is non-cash and therefore excluded from FCF.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const v = (x) => (x && typeof x === "object" && "value" in x ? x.value : x);

export function npv(rate, cashFlows) {
  return cashFlows.reduce((s, cf, t) => s + cf / (1 + rate) ** t, 0);
}

/** Years until cumulative cash flow turns non-negative (linear within a year); null if not within horizon. */
export function paybackYears(cashFlows) {
  let cum = cashFlows[0];
  if (cum >= 0) return 0;
  for (let t = 1; t < cashFlows.length; t++) {
    const prev = cum;
    cum += cashFlows[t];
    if (cum >= 0) return t - 1 + -prev / cashFlows[t];
  }
  return null;
}

export function discounted(rate, cashFlows) {
  return cashFlows.map((cf, t) => cf / (1 + rate) ** t);
}

export function buildModel(a, scenario = a.scenarios.base, overrides = {}) {
  const N = a.years;
  const s = { ...scenario, ...overrides };
  const price = v(a.pricing.subscriptionPerYear) * s.priceMultiplier;
  const fee = v(a.pricing.perElectionFee) * s.priceMultiplier;
  const churn = v(a.customers.annualChurnRate);
  const inv = a.initialInvestment;
  const initial = {
    productDevelopment: v(inv.productDevelopment),
    externalSmartContractAudit: v(inv.externalSmartContractAudit) * s.auditMultiplier,
    legalAndRegulatoryReview: v(inv.legalAndRegulatoryReview),
    companySetupAndEquipment: v(inv.companySetupAndEquipment),
  };
  const initialTotal = Object.values(initial).reduce((x, y) => x + y, 0);
  const amortisation = initial.productDevelopment / v(a.accounting.amortisationYears);
  const taxRate = v(a.accounting.corporateIncomeTaxRate);

  // Year 0: pre-operating expenses (everything except capitalised development).
  const y0Expenses = initialTotal - initial.productDevelopment;
  let lossPool = y0Expenses; // tax losses available to carry forward
  const years = [];
  let opening = 0;
  for (let i = 0; i < N; i++) {
    const closing = Math.round(v(a.customers.subscribersEndOfYear)[i] * s.customerMultiplier);
    const churned = Math.round(opening * churn);
    const grossAdds = Math.max(0, closing - opening + churned);
    const avgSubs = (opening + closing) / 2;
    const sessions = Math.round(v(a.customers.perElectionSessions)[i] * s.customerMultiplier);
    const revMult = i === 0 ? s.year1RevenueMultiplier : 1;
    const subRevenue = avgSubs * price * revMult;
    const sessionRevenue = sessions * fee * revMult;
    const revenue = subRevenue + sessionRevenue;

    const oc = a.operatingCosts;
    const team = v(oc.teamFte)[i] * v(oc.costPerFtePerMonth) * 12 * s.salaryMultiplier;
    const infraFixed = v(oc.infrastructureBasePerYear);
    const infraVariable = avgSubs * v(oc.infrastructurePerSubscriber) + sessions * v(oc.infrastructurePerSession);
    const legal = v(oc.legalCompliancePerYear) + (i === 0 ? s.extraLegalYear1 : 0);
    const audit = v(oc.recurringSecurityAudit)[i] * s.auditMultiplier;
    const cacSpend = grossAdds * v(a.acquisition.cacPerNewSubscriber);
    const commission = sessionRevenue * v(a.acquisition.perElectionSalesCommission);
    const salesMarketing = cacSpend + commission;
    const ga = v(oc.generalAndAdministrativePerYear);
    const opex = team + infraFixed + infraVariable + legal + audit + salesMarketing + ga;
    const ebitda = revenue - opex;
    const ebit = ebitda - amortisation;

    // Corporate income tax with loss carry-forward.
    let taxable = ebit;
    if (taxable > 0 && lossPool > 0) {
      const used = Math.min(lossPool, taxable);
      taxable -= used;
      lossPool -= used;
    } else if (taxable < 0) {
      lossPool += -taxable;
      taxable = 0;
    }
    const tax = Math.max(0, taxable) * taxRate;
    const netIncome = ebit - tax;
    const fcf = ebitda - tax;

    // Break-even: average subscribers needed for EBITDA = 0, holding this year's other values.
    const contributionPerSub = price * revMult - v(oc.infrastructurePerSubscriber);
    const sessionContribution = sessionRevenue - sessions * v(oc.infrastructurePerSession) - commission;
    const fixedLike = team + infraFixed + legal + audit + ga + cacSpend;
    const breakEvenAvgSubscribers = Math.max(0, (fixedLike - sessionContribution) / contributionPerSub);

    years.push({
      year: i + 1,
      opening,
      closing,
      churned,
      grossAdds,
      avgSubs,
      sessions,
      subRevenue,
      sessionRevenue,
      revenue,
      team,
      infrastructure: infraFixed + infraVariable,
      legal,
      audit,
      salesMarketing,
      ga,
      opex,
      ebitda,
      amortisation,
      ebit,
      tax,
      netIncome,
      fcf,
      breakEvenAvgSubscribers,
    });
    opening = closing;
  }

  const rate = v(a.valuation.discountRate);
  const g = v(a.valuation.terminalGrowthRate);
  const cashFlows = [-initialTotal, ...years.map((y) => y.fcf)];
  const disc = discounted(rate, cashFlows);
  const cumulative = cashFlows.reduce((acc, cf) => [...acc, (acc.at(-1) ?? 0) + cf], []);
  const lastFcf = years.at(-1).fcf;
  const terminalValue = lastFcf > 0 ? (lastFcf * (1 + g)) / (rate - g) : 0;
  const npvValue = npv(rate, cashFlows);
  const peakDeficit = -Math.min(0, ...cumulative);
  const buffer = v(a.funding.safetyBufferRate);
  const fundingRequest = Math.ceil((peakDeficit * (1 + buffer)) / a.funding.roundTo) * a.funding.roundTo;
  const y1Burn = years[0].fcf < 0 ? -years[0].fcf / 12 : 0;
  const runwayMonths = y1Burn > 0 ? (fundingRequest - initialTotal) / y1Burn : null;
  const firstEbitdaPositiveYear = years.find((y) => y.ebitda >= 0)?.year ?? null;

  return {
    scenario: s.label,
    initial,
    initialTotal,
    y0Expenses,
    years,
    cashFlows,
    discountedCashFlows: disc,
    cumulative,
    npv: npvValue,
    terminalValue,
    npvWithTerminalValue: npvValue + terminalValue / (1 + rate) ** a.years,
    paybackYears: paybackYears(cashFlows),
    discountedPaybackYears: paybackYears(disc),
    firstEbitdaPositiveYear,
    peakDeficit,
    fundingRequest,
    runwayMonths,
  };
}

// ---------------------------------------------------------------- formatting / output

const m = (x) => {
  const n = Math.abs(x) < 5000 ? 0 : x / 1e6; // avoid printing "-0.00"
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const yrs = (x) => (x === null ? "not within 3 years" : `${x.toFixed(2)} years`);
const row = (label, values) => `| ${label} | ${values.join(" | ")} |`;

function incomeAndCashTables(r, rate) {
  const head = "| (million KZT) | Year 0 | Year 1 | Year 2 | Year 3 |\n|---|---:|---:|---:|---:|";
  const Y = r.years;
  const inc = [
    head,
    row("Subscription revenue", ["—", ...Y.map((y) => m(y.subRevenue))]),
    row("Pay-per-session revenue", ["—", ...Y.map((y) => m(y.sessionRevenue))]),
    row("**Total revenue**", ["—", ...Y.map((y) => `**${m(y.revenue)}**`)]),
    row("Team (salaries incl. taxes)", ["—", ...Y.map((y) => m(-y.team))]),
    row("Infrastructure", ["—", ...Y.map((y) => m(-y.infrastructure))]),
    row("Legal & compliance", ["—", ...Y.map((y) => m(-y.legal))]),
    row("Recurring security audit", ["—", ...Y.map((y) => m(-y.audit))]),
    row("Sales & marketing (CAC + commission)", ["—", ...Y.map((y) => m(-y.salesMarketing))]),
    row("General & administrative", ["—", ...Y.map((y) => m(-y.ga))]),
    row("Pre-operating expenses (audit, legal, setup)", [m(-r.y0Expenses), "—", "—", "—"]),
    row("**EBITDA**", [m(-r.y0Expenses), ...Y.map((y) => `**${m(y.ebitda)}**`)]),
    row("Amortisation of capitalised development", ["—", ...Y.map((y) => m(-y.amortisation))]),
    row("EBIT", [m(-r.y0Expenses), ...Y.map((y) => m(y.ebit))]),
    row("Corporate income tax (after loss carry-forward)", ["—", ...Y.map((y) => m(-y.tax))]),
    row("**Net income**", [m(-r.y0Expenses), ...Y.map((y) => `**${m(y.netIncome)}**`)]),
  ].join("\n");
  const cf = [
    head,
    row("EBITDA (cash operating result)", ["—", ...Y.map((y) => m(y.ebitda))]),
    row("Cash tax paid", ["—", ...Y.map((y) => m(-y.tax))]),
    row("Initial investment (development, audit, legal, setup)", [m(-r.initialTotal), "—", "—", "—"]),
    row(
      "**Free cash flow**",
      r.cashFlows.map((x) => `**${m(x)}**`),
    ),
    row("Cumulative cash flow", r.cumulative.map(m)),
    row(
      "Discount factor",
      r.cashFlows.map((_, t) => (1 / (1 + rate) ** t).toFixed(4)),
    ),
    row("Discounted cash flow", r.discountedCashFlows.map(m)),
  ].join("\n");
  return { inc, cf };
}

function customersTable(r) {
  const Y = r.years;
  return [
    "| Customers | Year 1 | Year 2 | Year 3 |\n|---|---:|---:|---:|",
    row(
      "Opening subscribers",
      Y.map((y) => y.opening),
    ),
    row(
      "Churned (10% of opening, rounded)",
      Y.map((y) => y.churned),
    ),
    row(
      "Gross new subscribers",
      Y.map((y) => y.grossAdds),
    ),
    row(
      "Closing subscribers",
      Y.map((y) => y.closing),
    ),
    row(
      "Average subscribers (revenue basis)",
      Y.map((y) => y.avgSubs.toFixed(1)),
    ),
    row(
      "Pay-per-session elections",
      Y.map((y) => y.sessions),
    ),
    row(
      "Break-even average subscribers (EBITDA = 0)",
      Y.map((y) => y.breakEvenAvgSubscribers.toFixed(1)),
    ),
  ].join("\n");
}

export function render(a) {
  const base = buildModel(a);
  const { inc, cf } = incomeAndCashTables(base, v(a.valuation.discountRate));
  const scenarios = Object.values(a.scenarios).map((s) => buildModel(a, s));
  const scenarioTable = [
    "| Scenario | Revenue Y3 | EBITDA Y3 | NPV @25% (3 yrs) | Payback | Peak cash need | Funding incl. buffer |",
    "|---|---:|---:|---:|---|---:|---:|",
    ...scenarios.map((r) =>
      row(r.scenario, [
        m(r.years[2].revenue),
        m(r.years[2].ebitda),
        m(r.npv),
        yrs(r.paybackYears),
        m(r.peakDeficit),
        m(r.fundingRequest),
      ]),
    ),
  ].join("\n");
  const rates = [0.2, 0.25, 0.3];
  const sens = [
    "| Sensitivity of 3-year NPV (million KZT) | 20% | 25% | 30% |\n|---|---:|---:|---:|",
    row(
      "Base case",
      rates.map((r) => m(npv(r, base.cashFlows))),
    ),
    row(
      "Subscribers −20%",
      rates.map((r) => m(npv(r, buildModel(a, a.scenarios.base, { customerMultiplier: 0.8 }).cashFlows))),
    ),
    row(
      "Subscribers +20%",
      rates.map((r) => m(npv(r, buildModel(a, a.scenarios.base, { customerMultiplier: 1.2 }).cashFlows))),
    ),
    row(
      "Prices −20%",
      rates.map((r) => m(npv(r, buildModel(a, a.scenarios.base, { priceMultiplier: 0.8 }).cashFlows))),
    ),
    row(
      "Prices +20%",
      rates.map((r) => m(npv(r, buildModel(a, a.scenarios.base, { priceMultiplier: 1.2 }).cashFlows))),
    ),
  ].join("\n");
  const useOfFunds = [
    "| Use of funds | million KZT | Share |\n|---|---:|---:|",
    ...Object.entries({
      "Product development (capitalised)": base.initial.productDevelopment,
      "External smart-contract & application security audit": base.initial.externalSmartContractAudit,
      "Legal & regulatory review (Kazakhstan)": base.initial.legalAndRegulatoryReview,
      "Company setup & equipment": base.initial.companySetupAndEquipment,
      "Operating losses until cash-flow positive": base.peakDeficit - base.initialTotal,
      "Safety buffer / rounding": base.fundingRequest - base.peakDeficit,
    }).map(([k, x]) => row(k, [m(x), `${((x / base.fundingRequest) * 100).toFixed(1)}%`])),
    row("**Total funding request**", [`**${m(base.fundingRequest)}**`, "100%"]),
  ].join("\n");

  const kpis = [
    `- **3-year NPV at 25% (no terminal value): ${m(base.npv)} million KZT**`,
    `- Supplementary NPV including a Gordon-growth terminal value (g = 5%): ${m(base.npvWithTerminalValue)} million KZT — highly sensitive to the Year-3 cash flow; shown for discussion only.`,
    `- Payback (undiscounted): ${yrs(base.paybackYears)}; discounted payback: ${yrs(base.discountedPaybackYears)}`,
    `- Operating break-even (first year with EBITDA ≥ 0): Year ${base.firstEbitdaPositiveYear ?? "—"}`,
    `- Peak cumulative cash need: ${m(base.peakDeficit)} million KZT → funding request incl. 20% buffer: **${m(base.fundingRequest)} million KZT**`,
    `- Runway after the Year-0 investment at the Year-1 burn rate: ${base.runwayMonths === null ? "n/a" : base.runwayMonths.toFixed(1) + " months"}`,
  ].join("\n");

  return {
    base,
    scenarios,
    markdown: `_Generated by \`npm run finance:model\` from \`docs/finance/assumptions.json\` on ${new Date().toISOString().slice(0, 10)}. Do not edit by hand._

### Key results (base case)

${kpis}

### Customers and break-even

${customersTable(base)}

### Projected income statement

${inc}

### Projected cash-flow statement and discounting (r = 25%)

${cf}

### Scenarios

${scenarioTable}

### Sensitivity analysis

${sens}

### Funding request and use of funds

${useOfFunds}
`,
  };
}

function writeCsv(file, r) {
  const keys = Object.keys(r.years[0]);
  const lines = [["metric", ...r.years.map((y) => `year${y.year}`)].join(",")];
  for (const k of keys) lines.push([k, ...r.years.map((y) => Math.round(y[k] * 100) / 100)].join(","));
  lines.push(["freeCashFlow_incl_year0", ...r.cashFlows.map(Math.round)].join(","));
  fs.writeFileSync(file, lines.join("\n") + "\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const a = JSON.parse(fs.readFileSync(path.join(here, "assumptions.json"), "utf8"));
  const { markdown, scenarios } = render(a);
  const outDir = path.join(here, "output");
  fs.mkdirSync(outDir, { recursive: true });
  Object.keys(a.scenarios).forEach((key, i) => writeCsv(path.join(outDir, `${key}.csv`), scenarios[i]));
  fs.writeFileSync(path.join(outDir, "model-output.md"), markdown);
  const docPath = path.join(here, "..", "FINANCIAL_MODEL.md");
  if (fs.existsSync(docPath)) {
    const doc = fs.readFileSync(docPath, "utf8");
    const updated = doc.replace(
      /<!-- MODEL:START -->[\s\S]*<!-- MODEL:END -->/,
      `<!-- MODEL:START -->\n${markdown}\n<!-- MODEL:END -->`,
    );
    fs.writeFileSync(docPath, updated);
  }
  console.log(markdown.split("### Customers")[0]);
  console.log(`Wrote docs/finance/output/*.csv, model-output.md and refreshed docs/FINANCIAL_MODEL.md`);
}
