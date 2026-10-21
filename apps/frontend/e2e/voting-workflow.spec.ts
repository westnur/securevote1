/**
 * E2E: the complete primary workflow through the browser UI.
 *
 *   organizer: create draft -> eligible voters -> publish -> register -> open
 *   shareholders: vote (signed by their own local test account) -> duplicate rejected
 *   organizer: close -> results show correct weighted totals
 *   auditor: audit page verifies totals against the event log
 */
import { expect, test, type Page } from "@playwright/test";

const PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "";
const TITLE = `E2E dividend vote ${Date.now()}`;
const email = (u: string) => `${u}@demo.securevote.test`;

async function login(page: Page, user: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email(user));
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/app$/);
}

async function logout(page: Page) {
  const done = page.waitForResponse((r) => r.url().endsWith("/api/auth/logout") && r.status() === 204);
  await page.getByRole("button", { name: "Sign out" }).click();
  await done;
  await expect(page).toHaveURL(/\/login$/);
}

async function connectDevWallet(page: Page) {
  const connected = page.getByText(/Dev account 0x/);
  // The app remembers the connector TYPE and reconnects automatically after login.
  const auto = await connected.waitFor({ timeout: 3000 }).then(
    () => true,
    () => false,
  );
  if (auto) return;
  await page.getByRole("button", { name: "Connect wallet" }).click();
  await page.getByRole("button", { name: /Hardhat dev account/ }).click();
  await expect(connected).toBeVisible();
}

async function expectConfirmed(page: Page) {
  await expect(page.getByText("Transaction confirmed", { exact: true })).toBeVisible({ timeout: 60_000 });
}

async function vote(page: Page, user: string, option: string, electionUrl: string) {
  await login(page, user);
  await connectDevWallet(page);
  await page.goto(electionUrl);
  await expect(page.getByText("Select one option")).toBeVisible();
  await page.getByRole("radio", { name: option }).check();
  await page.getByRole("button", { name: "Review and sign vote" }).click();
  await expect(page.getByRole("dialog")).toContainText("transparent ballot");
  await page.getByRole("button", { name: "Sign and submit" }).click();
  await expectConfirmed(page);
}

test.describe.configure({ mode: "serial" });

test("full voting workflow with weighted results and duplicate-vote rejection", async ({ page }) => {
  expect(PASSWORD, "SEED_DEMO_PASSWORD must be set in .env").not.toBe("");

  // --- Organizer creates and configures the election --------------------------------
  await login(page, "organizer");
  await connectDevWallet(page);
  await page.getByRole("link", { name: "Organizer", exact: true }).click();
  await page.getByLabel("Title").fill(TITLE);
  await page.getByLabel("Description").fill("Synthetic end-to-end test election.");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/app\/organizer\/elections\//);
  const electionId = page.url().split("/").pop()!;
  const electionUrl = `/app/elections/${electionId}`;

  for (const name of ["Alikhan Shareholder", "Madina Shareholder", "Timur Shareholder"]) {
    await page.getByRole("checkbox", { name: `Eligible: ${name}` }).check();
  }
  await page.getByRole("button", { name: "Save eligibility list" }).click();
  await expect(page.getByText("Saved 3 eligible voter(s).")).toBeVisible();

  await page.getByRole("button", { name: "Sign and publish" }).click();
  await expectConfirmed(page);
  await page.getByRole("button", { name: /Sign and register 3 voter/ }).click();
  await expectConfirmed(page);
  await page.getByRole("button", { name: "Sign and open voting" }).click();
  await expectConfirmed(page);
  await expect(page.getByText("Voting open").first()).toBeVisible();
  await logout(page);

  // --- An ineligible shareholder cannot even see the election -------------------------
  await login(page, "zarina");
  await page.goto(electionUrl);
  await expect(page.getByText("Election not available")).toBeVisible();
  await logout(page);

  // --- Shareholders vote with their own wallets ----------------------------------------
  await vote(page, "alikhan", "Reject", electionUrl);
  // Duplicate vote: the UI no longer offers a ballot, and a forced second transaction is rejected by the contract.
  await page.reload();
  await expect(page.getByText("Your vote is recorded on-chain")).toBeVisible();
  await page.getByRole("button", { name: "Try to vote again" }).click();
  await expect(page.getByText("Duplicate vote rejected")).toBeVisible();
  await logout(page);

  await vote(page, "madina", "Approve", electionUrl);
  await logout(page);
  await vote(page, "timur", "Approve", electionUrl);
  await logout(page);

  // --- Organizer closes the session (allowed early because everyone voted) -------------
  await login(page, "organizer");
  await connectDevWallet(page);
  await page.goto(`/app/organizer/elections/${electionId}`);
  await page.getByRole("button", { name: "Sign and close" }).click();
  await expectConfirmed(page);

  // --- Final weighted results -----------------------------------------------------------
  await page.goto(`${electionUrl}/results`);
  await expect(page.getByText("Decision adopted")).toBeVisible();
  await expect(page.getByText('"Approve" received the largest voting weight.')).toBeVisible();
  const table = page.getByRole("table");
  await expect(table.getByRole("row", { name: /Approve/ })).toContainText("5,000");
  await expect(table.getByRole("row", { name: /Approve/ })).toContainText("55.55%");
  await expect(table.getByRole("row", { name: /Reject/ })).toContainText("4,000");
  await expect(page.getByText("match", { exact: true })).toBeVisible();
  await logout(page);

  // --- Auditor verifies totals against the public event log ---------------------------
  await login(page, "auditor");
  await page.goto(`/app/audit/${electionId}`);
  await expect(page.getByText("Totals verified")).toBeVisible();
  await expect(page.getByText("VoteCast", { exact: true })).toHaveCount(3);
  await expect(page.getByText("SessionClosed").first()).toBeVisible();
});
