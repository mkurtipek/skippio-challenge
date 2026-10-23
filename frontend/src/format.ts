const eur = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' });

// Display only: the API always works in integer cents.
export const formatCents = (cents: number) => eur.format(cents / 100);

// "12.50" -> 1250. Anything that is not a plain amount with up to two decimals
// (empty, negative, "12.345") becomes NaN, which the backend rejects. Money is
// never rounded silently.
export const eurosToCents = (value: string) =>
  /^\d+(\.\d{1,2})?$/.test(value.trim()) ? Math.round(Number(value) * 100) : NaN;
