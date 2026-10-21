import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildModel, npv, paybackYears } from "./model.mjs";

const a = JSON.parse(fs.readFileSync(new URL("./assumptions.json", import.meta.url), "utf8"));
const close = (x, y, eps = 1e-6) => assert.ok(Math.abs(x - y) < eps, `${x} != ${y}`);

test("NPV discounts year t by (1 + r)^t", () => {
  close(npv(0.25, [-100, 125]), 0);
  close(npv(0.1, [0, 110, 121]), 200);
});

test("payback interpolates inside the crossing year and returns null if never reached", () => {
  close(paybackYears([-100, 50, 100]), 1.5);
  assert.equal(paybackYears([-100, 10, 10]), null);
});

test("base case: revenue = avg subscribers × price + sessions × fee", () => {
  const r = buildModel(a);
  close(r.years[0].revenue, 4 * 3_600_000 + 25 * 400_000);
  close(r.years[2].revenue, 40 * 3_600_000 + 110 * 400_000);
});

test("initial investment is counted once (Year 0 cash flow) and not inside OPEX", () => {
  const r = buildModel(a);
  close(r.cashFlows[0], -38_000_000);
  const y1 = r.years[0];
  close(y1.opex, y1.team + y1.infrastructure + y1.legal + y1.audit + y1.salesMarketing + y1.ga);
  close(y1.fcf, y1.ebitda - y1.tax); // amortisation is non-cash
});

test("tax is zero until accumulated losses are used up", () => {
  const r = buildModel(a);
  assert.equal(r.years[0].tax, 0);
  assert.equal(r.years[1].tax, 0);
  // Year 3: (EBIT3 − remaining losses) × 20%
  const remaining = 20_000_000 + -r.years[0].ebit - r.years[1].ebit;
  close(r.years[2].tax, (r.years[2].ebit - remaining) * 0.2, 1e-3);
});

test("every pessimistic scenario has a lower NPV than the base case", () => {
  const base = buildModel(a).npv;
  for (const [key, s] of Object.entries(a.scenarios)) {
    if (key !== "base") assert.ok(buildModel(a, s).npv < base, key);
  }
});
