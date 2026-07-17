/**
 * Client-generated idempotency key (UUID: 36 url-safe chars). One key is
 * held per attempt and reused on retry so a reconnect cannot duplicate the
 * mutation; a new key is generated only after success.
 */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
