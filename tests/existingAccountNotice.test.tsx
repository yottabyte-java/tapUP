// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ExistingAccountNotice } from "@/components/ExistingAccountNotice";

afterEach(cleanup);

describe("existing-account signup notice", () => {
  it("explains the duplicate account and links to the existing login route", () => {
    render(<ExistingAccountNotice />);

    expect(screen.getByRole("alert").textContent).toContain("An account with this email already exists.");
    expect(screen.getByRole("link", { name: "Log in" }).getAttribute("href")).toBe("/login");
    expect(screen.getByRole("alert").textContent).not.toContain("Check the email address");
  });

  it("does not present a nonexistent password-recovery route as a working link", () => {
    render(<ExistingAccountNotice />);

    expect(screen.getByRole("alert").textContent).toContain("Password reset is not available in this app yet.");
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });
});
