import { describe, expect, it } from "vitest";
import { mapRegistrationError } from "@/lib/auth/registration-errors";

describe("mapRegistrationError", () => {
  it("maps duplicate registration to a specific login prompt", () => {
    const result = mapRegistrationError(409, {
      error: "Unable to create account. Check your details or sign in.",
      code: "REGISTRATION_FAILED",
    });
    expect(result.kind).toBe("duplicate");
    expect(result.message).toBe("An account already exists for this email. Log in instead.");
  });

  it("maps invalid email", () => {
    const result = mapRegistrationError(400, {
      error: "Enter a valid email address",
      code: "INVALID_EMAIL",
    });
    expect(result.message).toBe("Enter a valid email address.");
  });

  it("maps password mismatch", () => {
    const result = mapRegistrationError(400, {
      error: "Passwords do not match",
      code: "PASSWORD_MISMATCH",
    });
    expect(result.message).toBe("Passwords don't match.");
  });

  it("maps password validation with server detail", () => {
    const result = mapRegistrationError(400, {
      error: "Password must be at least 8 characters",
      code: "INVALID_PASSWORD",
    });
    expect(result.message).toBe("Password must be at least 8 characters");
  });

  it("maps server errors to a safe generic message", () => {
    const result = mapRegistrationError(500, { error: "Could not create account" });
    expect(result.kind).toBe("server");
    expect(result.message).toBe("We couldn't create your account. Please try again.");
  });

  it("maps email delivery failures to the server message from the API", () => {
    const result = mapRegistrationError(503, {
      error: "We couldn't send the email. Check SMTP settings.",
      code: "EMAIL_DELIVERY_FAILED",
    });
    expect(result.kind).toBe("server");
    expect(result.message).toBe("We couldn't send the email. Check SMTP settings.");
  });
});
