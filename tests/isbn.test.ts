import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatIsbn,
  isbn10To13,
  isbn13To10,
  isValidIsbn10,
  isValidIsbn13,
  normalizeIsbn,
  normalizeIsbnPair,
} from '../src/lib/isbn.js';

test('ISBN normalizasyonu tire ve boşlukları temizler', () => {
  assert.equal(normalizeIsbn('978-975-470-211-7'), '9789754702117');
  assert.equal(normalizeIsbn(' 0-306-40615-2 '), '0306406152');
});

test('ISBN-10 doğrulaması', () => {
  assert.equal(isValidIsbn10('0306406152'), true);
  assert.equal(isValidIsbn10('0306406153'), false);
  assert.equal(isValidIsbn10('097522980X'), true);
});

test('ISBN-13 doğrulaması', () => {
  assert.equal(isValidIsbn13('9780306406157'), true);
  assert.equal(isValidIsbn13('9780306406158'), false);
  assert.equal(isValidIsbn13('1234567890123'), false);
});

test('ISBN-10 ve ISBN-13 birbirine dönüştürülür', () => {
  assert.equal(isbn10To13('0306406152'), '9780306406157');
  assert.equal(isbn13To10('9780306406157'), '0306406152');
  assert.equal(isbn10To13('gecersiz'), null);
  assert.equal(isbn13To10('9790306406150'), null);
});

test('normalizeIsbnPair çifti doğru üretir', () => {
  assert.deepEqual(normalizeIsbnPair('0306406152'), {
    isbn13: '9780306406157',
    isbn10: '0306406152',
  });
  assert.deepEqual(normalizeIsbnPair('978-0-306-40615-7'), {
    isbn13: '9780306406157',
    isbn10: '0306406152',
  });
  assert.equal(normalizeIsbnPair(''), null);
  assert.equal(normalizeIsbnPair('abc'), null);
});

test('formatIsbn okunabilir biçim verir', () => {
  assert.equal(formatIsbn('9780306406157'), '978-0-3064-0615-7');
  assert.equal(formatIsbn(null), '—');
});
