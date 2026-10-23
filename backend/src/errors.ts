// Errors the service throws on purpose; the HTTP layer maps them to responses.
// `extra` is merged into the JSON body (e.g. validation details, current order).
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}
