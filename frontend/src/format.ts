const eur = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' });

// Display only: the API always works in integer cents.
export const formatCents = (cents: number) => eur.format(cents / 100);

// "12.50" -> 1250. Invalid input becomes NaN and is rejected by the backend.
export const eurosToCents = (value: string) => Math.round(Number(value) * 100);
