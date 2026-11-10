/**
 * Pick only the given fields from an untrusted request body before passing
 * it to Prisma. Spreading the raw body into prisma create/update makes every
 * unexpected client field a 500 ("Unknown argument"), so routes must
 * whitelist fields explicitly. Fields explicitly set to null are kept
 * (allows clearing optional columns); absent fields are skipped.
 */
export function pickFields<S extends object, K extends keyof S>(
  body: S,
  fields: readonly K[]
): Pick<S, K> {
  const out = {} as Pick<S, K>;
  for (const field of fields) {
    if (body[field] !== undefined) {
      out[field] = body[field];
    }
  }
  return out;
}
