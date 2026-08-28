import { AuthError } from "@/lib/auth/errors";

export class VerificationRequiredError extends AuthError {
  constructor() {
    super("Email verification required before checkout", 403, "VERIFICATION_REQUIRED");
    this.name = "VerificationRequiredError";
  }
}
