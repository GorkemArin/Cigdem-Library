export function normalizeIsbn(value: string): string {
  return value.replace(/[^0-9Xx]/g, '').toUpperCase();
}

export function isValidIsbn10(value: string): boolean {
  const isbn = normalizeIsbn(value);
  if (!/^\d{9}[\dX]$/.test(isbn)) return false;

  let sum = 0;
  for (let i = 0; i < 10; i += 1) {
    const char = isbn[i]!;
    const digit = char === 'X' ? 10 : Number(char);
    sum += digit * (10 - i);
  }
  return sum % 11 === 0;
}

export function isValidIsbn13(value: string): boolean {
  const isbn = normalizeIsbn(value);
  if (!/^\d{13}$/.test(isbn)) return false;
  if (!isbn.startsWith('978') && !isbn.startsWith('979')) return false;

  let sum = 0;
  for (let i = 0; i < 13; i += 1) {
    sum += Number(isbn[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return sum % 10 === 0;
}

export function isbn10To13(value: string): string | null {
  const isbn = normalizeIsbn(value);
  if (!isValidIsbn10(isbn)) return null;

  const core = `978${isbn.slice(0, 9)}`;
  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    sum += Number(core[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  return `${core}${check}`;
}

export function isbn13To10(value: string): string | null {
  const isbn = normalizeIsbn(value);
  if (!isValidIsbn13(isbn) || !isbn.startsWith('978')) return null;

  const core = isbn.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i += 1) {
    sum += Number(core[i]) * (10 - i);
  }
  const remainder = (11 - (sum % 11)) % 11;
  return `${core}${remainder === 10 ? 'X' : remainder}`;
}

export interface NormalizedIsbn {
  isbn13: string | null;
  isbn10: string | null;
}

export function normalizeIsbnPair(value: string | null | undefined): NormalizedIsbn | null {
  if (!value) return null;
  const isbn = normalizeIsbn(value);
  if (!isbn) return null;

  if (isValidIsbn13(isbn)) {
    return { isbn13: isbn, isbn10: isbn13To10(isbn) };
  }
  if (isValidIsbn10(isbn)) {
    return { isbn13: isbn10To13(isbn), isbn10: isbn };
  }
  return null;
}

export function formatIsbn(value: string | null | undefined): string {
  if (!value) return '—';
  const isbn = normalizeIsbn(value);
  if (isbn.length === 13) {
    return `${isbn.slice(0, 3)}-${isbn.slice(3, 4)}-${isbn.slice(4, 8)}-${isbn.slice(8, 12)}-${isbn.slice(12)}`;
  }
  return value;
}
