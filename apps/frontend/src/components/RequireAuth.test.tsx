import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { RequireAuth } from "./RequireAuth";

const auth = { me: null as unknown, loading: false, signedOut: false, hasRole: (..._r: string[]) => false };
vi.mock("../lib/auth", () => ({ useAuth: () => auth }));

const renderAt = (roles?: ("ADMIN" | "ORGANIZER")[]) =>
  render(
    <MemoryRouter initialEntries={["/app/secret"]}>
      <Routes>
        <Route path="/login" element={<p>Login page</p>} />
        <Route
          path="/app/secret"
          element={
            <RequireAuth roles={roles}>
              <p>Secret content</p>
            </RequireAuth>
          }
        />
      </Routes>
    </MemoryRouter>,
  );

describe("RequireAuth (UI guard — the API enforces the real permissions)", () => {
  it("redirects anonymous users to the login page", () => {
    auth.me = null;
    renderAt();
    expect(screen.getByText("Login page")).toBeInTheDocument();
  });

  it("explains missing roles instead of rendering the page", () => {
    auth.me = { user: { id: "u" } };
    auth.hasRole = () => false;
    renderAt(["ORGANIZER"]);
    expect(screen.getByText("Not available for your role")).toBeInTheDocument();
    expect(screen.queryByText("Secret content")).not.toBeInTheDocument();
  });

  it("renders the page for an authorized user", () => {
    auth.me = { user: { id: "u" } };
    auth.hasRole = () => true;
    renderAt(["ORGANIZER"]);
    expect(screen.getByText("Secret content")).toBeInTheDocument();
  });
});
