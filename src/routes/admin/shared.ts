import type { Book } from '../../db/types.js';
import type { BookInput } from '../../repos/books.js';
import type { z } from 'zod';
import type { bookSchema } from '../../lib/validation.js';
import { normalizeIsbnPair } from '../../lib/isbn.js';

export function emptyBookFormValues(): Record<string, string> {
  return {
    title: '',
    subtitle: '',
    authors: '',
    isbn: '',
    publisher: '',
    published_year: '',
    language: 'tr',
    page_count: '',
    categories: '',
    description: '',
    cover_url: '',
    openlibrary_key: '',
    copies_count: '1',
    shelf_location: '',
    copy_condition: 'good',
  };
}

export function bookToFormValues(book: Book): Record<string, string> {
  return {
    title: book.title,
    subtitle: book.subtitle ?? '',
    authors: book.authors ?? '',
    isbn: book.isbn13 ?? book.isbn10 ?? '',
    publisher: book.publisher ?? '',
    published_year: book.published_year ? String(book.published_year) : '',
    language: book.language,
    page_count: book.page_count ? String(book.page_count) : '',
    categories: book.categories ?? '',
    description: book.description ?? '',
    cover_url: book.cover_url ?? '',
    openlibrary_key: book.openlibrary_key ?? '',
    copies_count: '1',
    shelf_location: '',
    copy_condition: 'good',
  };
}

export function bodyToBookFormValues(body: Record<string, unknown>): Record<string, string> {
  const value = (key: string): string => {
    const raw = body[key];
    return typeof raw === 'string' ? raw : '';
  };

  return {
    title: value('title'),
    subtitle: value('subtitle'),
    authors: value('authors'),
    isbn: value('isbn'),
    publisher: value('publisher'),
    published_year: value('published_year'),
    language: value('language') || 'tr',
    page_count: value('page_count'),
    categories: value('categories'),
    description: value('description'),
    cover_url: value('cover_url'),
    openlibrary_key: value('openlibrary_key'),
    copies_count: value('copies_count') || '1',
    shelf_location: value('shelf_location'),
    copy_condition: value('copy_condition') || 'good',
  };
}

export function toBookInput(data: z.infer<typeof bookSchema>): BookInput {
  const isbn = normalizeIsbnPair(data.isbn ?? null);
  return {
    isbn13: isbn?.isbn13 ?? null,
    isbn10: isbn?.isbn10 ?? null,
    title: data.title,
    subtitle: data.subtitle ?? null,
    authors: data.authors ?? null,
    publisher: data.publisher ?? null,
    published_year: data.published_year ?? null,
    language: data.language || 'tr',
    page_count: data.page_count ?? null,
    categories: data.categories ?? null,
    description: data.description ?? null,
    cover_url: data.cover_url ?? null,
    openlibrary_key: data.openlibrary_key ?? null,
  };
}

export function auditDetails(source: Record<string, unknown>): Record<string, unknown> {
  return source;
}
