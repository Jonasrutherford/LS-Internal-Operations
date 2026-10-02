/** Supabase types an embedded relation as an array when it cannot prove the join is
 *  to-one. These selects are all to-one, so normalise to a single row or null. */
export function one<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}
