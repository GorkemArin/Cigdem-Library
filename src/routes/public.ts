import { Router } from 'express';
import { getBookWithStock, listCopies, listLanguages, searchBooks } from '../repos/books.js';
import { getPublicStats } from '../repos/stats.js';
import { popularBooks, findActiveLoanForUserBook, countActiveLoansForUser } from '../repos/loans.js';
import { findOpenRequestForUserBook, countOpenRequestsForUser } from '../repos/requests.js';
import { formString, notFound, validateId } from '../lib/http.js';
import { paginate, parsePage } from '../lib/pagination.js';
import { getSettingInt } from '../repos/settings.js';

export const publicRouter = Router();

publicRouter.get('/', (req, res) => {
  const stats = getPublicStats();
  const { books: newBooks } = searchBooks({
    page: 1,
    perPage: 6,
    sort: 'newest',
  });
  const popular = popularBooks(4);

  res.render('home', {
    title: 'Mahalle kütüphanesi',
    stats,
    newBooks,
    popular,
  });
});

publicRouter.get('/kitaplar', (req, res) => {
  const q = formString(req.query.q);
  const availableOnly = req.query.musait === '1';
  const language = formString(req.query.dil);
  const requestedSort = formString(req.query.sirala);
  const sort =
    requestedSort === 'newest' || requestedSort === 'title' || requestedSort === 'relevance'
      ? requestedSort
      : q
        ? 'relevance'
        : 'newest';

  const page = parsePage(req.query.sayfa);
  const { books, total } = searchBooks({
    q: q || undefined,
    availableOnly,
    language: language || undefined,
    page,
    perPage: 12,
    sort,
  });

  const pagination = paginate({ page, perPage: 12, total });
  const baseQuery = {
    q: q || undefined,
    musait: availableOnly ? '1' : undefined,
    dil: language || undefined,
    sirala: sort,
  };

  res.render('catalog', {
    title: q ? `"${q}" araması` : 'Kitap kataloğu',
    books,
    total,
    q,
    availableOnly,
    language,
    sort,
    languages: listLanguages(),
    pagination,
    baseQuery,
  });
});

publicRouter.get('/kitaplar/:id', (req, res, next) => {
  try {
    const id = validateId(req.params.id);
    const book = getBookWithStock(id);
    if (!book) throw notFound('Kitap bulunamadı.');

    const copies = listCopies(book.id);
    const activeLoan = req.user ? findActiveLoanForUserBook(req.user.id, book.id) : null;
    const openRequest = req.user ? findOpenRequestForUserBook(req.user.id, book.id) : null;

    let limitReached = false;
    let activeCount = 0;
    let openCount = 0;
    if (req.user?.role === 'member' && req.user.status === 'active') {
      activeCount = countActiveLoansForUser(req.user.id);
      openCount = countOpenRequestsForUser(req.user.id);
      limitReached = activeCount + openCount >= getSettingInt('max_active_loans', 3);
    }

    res.render('book-detail', {
      title: book.title,
      book,
      copies,
      activeLoan,
      openRequest,
      limitReached,
      activeCount,
      openCount,
    });
  } catch (error) {
    next(error);
  }
});

publicRouter.get('/hakkinda', (req, res) => {
  res.render('about', { title: 'Hakkında' });
});
