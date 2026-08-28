import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 8;

export function validatePasswordStrength(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error("Password must be at least 8 characters");
  }
}

export async function hashPassword(password: string): Promise<string> {
  validatePasswordStrength(password);
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}
