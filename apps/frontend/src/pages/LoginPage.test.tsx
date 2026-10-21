import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../lib/auth";
import { LoginPage } from "./LoginPage";

const json = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

function renderLogin() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={["/login"]}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/app" element={<p>Dashboard reached</p>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("LoginPage", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("validates the form before calling the API", async () => {
    fetchMock.mockImplementation((url: string) =>
      url.includes("demo-accounts")
        ? json(200, { accounts: [] })
        : json(401, { error: { code: "UNAUTHENTICATED", message: "x" } }),
    );
    renderLogin();
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Enter a valid e-mail address")).toBeInTheDocument();
    expect(screen.getByText("Password is required")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("/api/auth/login"))).toBe(false);
  });

  it("fills the e-mail from a demo account and shows the server's generic error", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("demo-accounts"))
        return json(200, {
          accounts: [
            { email: "timur@demo.securevote.test", displayName: "Timur", roles: ["SHAREHOLDER"], organizations: ["Demo"] },
          ],
        });
      if (url.includes("/login")) {
        expect((init?.headers as Record<string, string>)["X-SecureVote-CSRF"]).toBe("1");
        return json(401, { error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" } });
      }
      return json(401, { error: { code: "UNAUTHENTICATED", message: "Authentication required" } });
    });
    renderLogin();
    await userEvent.click(await screen.findByRole("button", { name: /Timur/ }));
    expect(screen.getByLabelText("E-mail")).toHaveValue("timur@demo.securevote.test");
    await userEvent.type(screen.getByLabelText("Password"), "wrong-password");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Invalid email or password")).toBeInTheDocument();
  });

  it("navigates to the dashboard after a successful login", async () => {
    let loggedIn = false;
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("demo-accounts")) return json(200, { accounts: [] });
      if (url.includes("/login")) {
        loggedIn = true;
        return json(200, { user: { id: "u1" } });
      }
      return loggedIn
        ? json(200, {
            user: { id: "u1", email: "a@demo.securevote.test", displayName: "A", walletAddress: null },
            memberships: [],
          })
        : json(401, { error: { code: "UNAUTHENTICATED", message: "Authentication required" } });
    });
    renderLogin();
    await userEvent.type(screen.getByLabelText("E-mail"), "a@demo.securevote.test");
    await userEvent.type(screen.getByLabelText("Password"), "secret-password");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Dashboard reached")).toBeInTheDocument();
  });
});
