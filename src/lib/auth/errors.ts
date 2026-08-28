export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: number = 401,
    readonly code?: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}
