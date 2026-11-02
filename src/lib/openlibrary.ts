import { config } from '../config.js';
import {
  isValidIsbn10,
  isValidIsbn13,
  isbn10To13,
  isbn13To10,
  normalizeIsbn,
  normalizeIsbnPair,
} from './isbn.js';

export class OpenLibraryError extends Error {
  constructor(message = 'Open Library servisine şu anda ulaşılamıyor.') {
    super(message);
    this.name = 'OpenLibraryError';
  }
}

export interface OpenLibraryBook {
  openlibrary_key: string | null;
  title: string;
  subtitle: string | null;
  authors: string | null;
  publisher: string | null;
  published_year: number | null;
  language: string;
  page_count: number | null;
  categories: string | null;
  description: string | null;
  cover_url: string | null;
  isbn13: string | null;
  isbn10: string | null;
}

interface SearchDoc {
  key?: string;
  title?: string;
  subtitle?: string;
  author_name?: string[];
  publisher?: string[];
  first_publish_year?: number;
  language?: string[];
  number_of_pages_median?: number;
  subject?: string[];
  cover_i?: number;
  isbn?: string[];
}

interface EditionDoc {
  key?: string;
  title?: string;
  subtitle?: string;
  publishers?: string[];
  publish_date?: string;
  number_of_pages?: number;
  covers?: number[];
  isbn_13?: string[];
  isbn_10?: string[];
  works?: Array<{ key?: string }>;
  authors?: Array<{ key?: string }>;
  subjects?: string[];
  languages?: Array<{ key?: string }>;
  description?: string | { value?: string };
}

const LANGUAGE_NAMES: Record<string, string> = {
  turkish: 'tr',
  english: 'en',
  german: 'de',
  french: 'fr',
  spanish: 'es',
  italian: 'it',
  russian: 'ru',
  arabic: 'ar',
  persian: 'fa',
  farsi: 'fa',
  dutch: 'nl',
  greek: 'el',
  kurdish: 'ku',
  azerbaijani: 'az',
};

const LANGUAGE_CODES: Record<string, string> = {
  tur: 'tr',
  eng: 'en',
  ger: 'de',
  fre: 'fr',
  spa: 'es',
  ita: 'it',
  rus: 'ru',
  ara: 'ar',
  per: 'fa',
  dut: 'nl',
  gre: 'el',
  kur: 'ku',
  aze: 'az',
};

function cleanText(value: string | undefined | null): string | null {
  if (!value) return null;
  const cleaned = value.replace(/\s+/g, ' ').trim();
  return cleaned === '' ? null : cleaned;
}

function mapLanguageFromNames(values: string[] | undefined): string {
  if (!values || values.length === 0) return 'tr';
  for (const value of values) {
    const mapped = LANGUAGE_NAMES[value.toLowerCase()];
    if (mapped) return mapped;
  }
  return 'tr';
}

function mapLanguageFromKeys(values: Array<{ key?: string }> | undefined): string {
  if (!values || values.length === 0) return 'tr';
  for (const value of values) {
    const code = value.key?.split('/').pop()?.toLowerCase();
    if (code && LANGUAGE_CODES[code]) return LANGUAGE_CODES[code];
  }
  return 'tr';
}

function pickIsbn(values: string[] | undefined, preferred?: string): { isbn13: string | null; isbn10: string | null } {
  if (!values || values.length === 0) {
    if (preferred) {
      return normalizeIsbnPair(preferred) ?? { isbn13: null, isbn10: null };
    }
    return { isbn13: null, isbn10: null };
  }

  const normalized = values
    .map((value) => normalizeIsbn(value))
    .filter((value) => isValidIsbn10(value) || isValidIsbn13(value));

  const preferredNormalized = preferred ? normalizeIsbn(preferred) : null;
  const ordered = preferredNormalized
    ? [preferredNormalized, ...normalized.filter((value) => value !== preferredNormalized)]
    : normalized;

  for (const value of ordered) {
    if (isValidIsbn13(value)) {
      return { isbn13: value, isbn10: isbn13To10(value) };
    }
  }
  for (const value of ordered) {
    if (isValidIsbn10(value)) {
      return { isbn13: isbn10To13(value), isbn10: value };
    }
  }
  return { isbn13: null, isbn10: null };
}

function coverUrl(coverId: number | undefined, size: 'S' | 'M' | 'L' = 'M'): string | null {
  if (!coverId) return null;
  return `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg`;
}

function parseYear(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.match(/(\d{4})/);
  if (!match) return null;
  const year = Number(match[1]);
  return year >= 1000 && year <= 2100 ? year : null;
}

function toBookFromDoc(doc: SearchDoc, preferredIsbn?: string): OpenLibraryBook | null {
  const title = cleanText(doc.title);
  if (!title) return null;

  const isbn = pickIsbn(doc.isbn, preferredIsbn);

  return {
    openlibrary_key: doc.key ?? null,
    title,
    subtitle: cleanText(doc.subtitle),
    authors: doc.author_name?.slice(0, 6).map((name) => name.trim()).join(', ') || null,
    publisher: doc.publisher?.slice(0, 3).join('; ') || null,
    published_year: doc.first_publish_year ?? null,
    language: mapLanguageFromNames(doc.language),
    page_count: doc.number_of_pages_median ?? null,
    categories: doc.subject?.slice(0, 8).join(', ') || null,
    description: null,
    cover_url: coverUrl(doc.cover_i),
    isbn13: isbn.isbn13,
    isbn10: isbn.isbn10,
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        'User-Agent': config.openLibraryUserAgent,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(9_000),
    });
  } catch {
    throw new OpenLibraryError();
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw new OpenLibraryError('Bu ISBN için Open Library kaydı bulunamadı.');
    }
    throw new OpenLibraryError();
  }

  return (await response.json()) as T;
}

const SEARCH_FIELDS = [
  'key',
  'title',
  'subtitle',
  'author_name',
  'publisher',
  'first_publish_year',
  'language',
  'number_of_pages_median',
  'subject',
  'cover_i',
  'isbn',
].join(',');

export async function searchOpenLibrary(query: string, limit = 12): Promise<OpenLibraryBook[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const url = new URL('https://openlibrary.org/search.json');
  url.searchParams.set('q', trimmed);
  url.searchParams.set('limit', String(Math.min(Math.max(limit, 1), 25)));
  url.searchParams.set('fields', SEARCH_FIELDS);

  const data = await fetchJson<{ docs?: SearchDoc[] }>(url.toString());
  return (data.docs ?? [])
    .map((doc) => toBookFromDoc(doc))
    .filter((book): book is OpenLibraryBook => book !== null);
}

async function fetchWorkDescription(workKey: string | undefined): Promise<string | null> {
  if (!workKey) return null;
  try {
    const work = await fetchJson<{ description?: string | { value?: string } }>(
      `https://openlibrary.org${workKey}.json`,
    );
    if (typeof work.description === 'string') return cleanText(work.description);
    if (work.description && typeof work.description.value === 'string') {
      return cleanText(work.description.value);
    }
    return null;
  } catch {
    return null;
  }
}

export async function fetchOpenLibraryByIsbn(rawIsbn: string): Promise<OpenLibraryBook | null> {
  const normalized = normalizeIsbn(rawIsbn);
  const pair = normalizeIsbnPair(normalized);
  if (!pair) {
    throw new OpenLibraryError('Geçerli bir ISBN girin.');
  }

  const url = new URL('https://openlibrary.org/search.json');
  url.searchParams.set(
    'q',
    `isbn:${pair.isbn13 ?? pair.isbn10}`,
  );
  url.searchParams.set('limit', '5');
  url.searchParams.set('fields', SEARCH_FIELDS);

  try {
    const data = await fetchJson<{ docs?: SearchDoc[] }>(url.toString());
    const docs = data.docs ?? [];
    const preferred = pair.isbn13 ?? pair.isbn10 ?? normalized;
    const book = docs
      .map((doc) => toBookFromDoc(doc, preferred))
      .find((item): item is OpenLibraryBook => item !== null);

    if (book) {
      if (!book.isbn13) book.isbn13 = pair.isbn13;
      if (!book.isbn10) book.isbn10 = pair.isbn10;
      book.description = await fetchWorkDescription(book.openlibrary_key ?? undefined);
      return book;
    }
  } catch (error) {
    if (!(error instanceof OpenLibraryError)) throw error;
  }

  return fetchEditionByIsbn(normalized, pair);
}

async function fetchEditionByIsbn(
  normalized: string,
  pair: { isbn13: string | null; isbn10: string | null },
): Promise<OpenLibraryBook | null> {
  const edition = await fetchJson<EditionDoc>(
    `https://openlibrary.org/isbn/${encodeURIComponent(normalized)}.json`,
  );

  const authors: string[] = [];
  for (const author of (edition.authors ?? []).slice(0, 4)) {
    if (!author.key) continue;
    try {
      const detail = await fetchJson<{ name?: string }>(
        `https://openlibrary.org${author.key}.json`,
      );
      if (detail.name) authors.push(detail.name);
    } catch {
      // Yazar detayı alınamazsa künye yine de kullanılabilir.
    }
  }

  const title = cleanText(edition.title);
  if (!title) return null;

  const editionIsbn = pickIsbn(
    [...(edition.isbn_13 ?? []), ...(edition.isbn_10 ?? [])],
    pair.isbn13 ?? pair.isbn10 ?? normalized,
  );

  return {
    openlibrary_key: edition.works?.[0]?.key ?? edition.key ?? null,
    title,
    subtitle: cleanText(edition.subtitle),
    authors: authors.length > 0 ? authors.join(', ') : null,
    publisher: edition.publishers?.slice(0, 3).join('; ') || null,
    published_year: parseYear(edition.publish_date),
    language: mapLanguageFromKeys(edition.languages),
    page_count: edition.number_of_pages ?? null,
    categories: edition.subjects?.slice(0, 8).join(', ') || null,
    description: await fetchWorkDescription(edition.works?.[0]?.key),
    cover_url: coverUrl(edition.covers?.[0]),
    isbn13: editionIsbn.isbn13 ?? pair.isbn13,
    isbn10: editionIsbn.isbn10 ?? pair.isbn10,
  };
}
