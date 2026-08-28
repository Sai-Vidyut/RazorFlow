export type RegistrationErrorPayload = {
  error?: string;
  code?: string;
};

export type RegistrationErrorKind = "duplicate" | "validation" | "server";

export type RegistrationErrorView = {
  message: string;
  kind: RegistrationErrorKind;
};

export function mapRegistrationError(
  status: number,
  payload: RegistrationErrorPayload,
): RegistrationErrorView {
  const code = payload.code;

  if (status === 409 && code === "REGISTRATION_FAILED") {
    return {
      message: "An account already exists for this email. Log in instead.",
      kind: "duplicate",
    };
  }

  if (code === "INVALID_EMAIL") {
    return { message: "Enter a valid email address.", kind: "validation" };
  }

  if (code === "PASSWORD_MISMATCH") {
    return { message: "Passwords don't match.", kind: "validation" };
  }

  if (code === "INVALID_PASSWORD") {
    return {
      message: payload.error?.trim() || "Password must be at least 8 characters",
      kind: "validation",
    };
  }

  if (code === "EMAIL_DELIVERY_FAILED") {
    return {
      message:
        payload.error?.trim() ||
        "We couldn't send the verification email. Check SMTP settings or try again later.",
      kind: "server",
    };
  }

  if (status >= 500) {
    return {
      message: "We couldn't create your account. Please try again.",
      kind: "server",
    };
  }

  if (payload.error?.trim()) {
    return { message: payload.error.trim(), kind: "validation" };
  }

  return {
    message: "We couldn't create your account. Please try again.",
    kind: "server",
  };
}
