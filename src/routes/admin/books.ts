import { Router } from 'express';
import type { Response } from 'express';
import {
  addCopy,
  addCopies,
  copyUsageCounts,
  createBook,
  deleteCopy,
  findBookByIsbn,
  getBookById,
  getBookWithStock,
  getCopyById,
  listCopies,
  searchBooks,
  updateBook,
  updateCopyStatus,
} from '../../repos/books.js';
import { findActiveLoanByCopy, listLoansForBook } from '../../repos/loans.js';
import { findApprovedRequestForCopy, listRequestsForBook } from '../../repos/requests.js';
import { bookSchema, copySchema, copyStatusSchema } from '../../lib/validation.js';
import { formString, notFound, validateId, zodFieldErrors } from '../../lib/http.js';
import { paginate, parsePage } from '../../lib/pagination.js';
import { setFlash } from '../../lib/flash.js';
import { logAudit } from '../../repos/audit.js';
import {
  bodyToBookFormValues,
  bookToFormValues,
  emptyBookFormValues,
  toBookInput,
} from './shared.js';

export const adminBooksRouter = Router();

function renderForm(
  res: Response,
  options: {
    mode: 'create' | 'edit';
    bookId?: number;
    values: Record<string, string>;
    errors: Record<string, string>;
    status?: number;
  },
): void {
  res.status(options.status ?? 200).render('admin/books/form', {
    title: options.mode === 'create' ? 'Yeni kitap ekle' : 'Kitabı düzenle',
    mode: options.mode,
    bookId: options.bookId,
    values: options.values,
    errors: options.errors,
    activeAdmin: 'kitaplar',
  });
}

adminBooksRouter.get('/kitaplar', (req, res) => {
  const q = formString(req.query.q);
  const page = parsePage(req.query.sayfa);
  const { books, total } = searchBooks({
    q: q || undefined,
    page,
    perPage: 20,
    sort: q ? 'relevance' : 'newest',
  });
  const pagination = paginate({ page, perPage: 20, total });

  res.render('admin/books/index', {
    title: 'Kitaplar',
    books,
    total,
    q,
    pagination,
    activeAdmin: 'kitaplar',
  });
});

adminBooksRouter.get('/kitaplar/yeni', (req, res) => {
  renderForm(res, {
    mode: 'create',
    values: emptyBookFormValues(),
    errors: {},
  });
});

adminBooksRouter.post('/kitaplar/yeni', (req, res) => {
  const parsed = bookSchema.safeParse(req.body);

  if (!parsed.success) {
    renderForm(res, {
      mode: 'create',
      values: bodyToBookFormValues(req.body),
      errors: zodFieldErrors(parsed.error),
      status: 400,
    });
    return;
  }

  const input = toBookInput(parsed.data);
  const duplicate = findBookByIsbn(input.isbn13, input.isbn10);
  if (duplicate) {
    renderForm(res, {
      mode: 'create',
      values: bodyToBookFormValues(req.body),
      errors: { isbn: `Bu ISBN zaten kayıtlı: "${duplicate.title}" (Kayıt #${duplicate.id}).` },
      status: 400,
    });
    return;
  }

  const bookId = createBook(input);
  if (parsed.data.copies_count > 0) {
    addCopies(bookId, parsed.data.copies_count, {
      shelf_location: parsed.data.shelf_location ?? null,
      condition: parsed.data.copy_condition,
    });
  }

  logAudit(req.user!.id, 'book.create', 'book', bookId, {
    title: input.title,
    isbn13: input.isbn13,
    copies: parsed.data.copies_count,
  });
  setFlash(res, 'success', `"${input.title}" kütüphaneye eklendi.`);
  res.redirect(`/admin/kitaplar/${bookId}`);
});

adminBooksRouter.get('/kitaplar/:id', (req, res, next) => {
  try {
    const id = validateId(req.params.id);
    const book = getBookWithStock(id);
    if (!book) throw notFound('Kitap bulunamadı.');

    res.render('admin/books/detail', {
      title: book.title,
      book,
      copies: listCopies(book.id),
      loans: listLoansForBook(book.id, 15),
      requests: listRequestsForBook(book.id, 10),
      activeAdmin: 'kitaplar',
    });
  } catch (error) {
    next(error);
  }
});

adminBooksRouter.get('/kitaplar/:id/duzenle', (req, res, next) => {
  try {
    const id = validateId(req.params.id);
    const book = getBookById(id);
    if (!book) throw notFound('Kitap bulunamadı.');

    renderForm(res, {
      mode: 'edit',
      bookId: book.id,
      values: bookToFormValues(book),
      errors: {},
    });
  } catch (error) {
    next(error);
  }
});

adminBooksRouter.post('/kitaplar/:id/duzenle', (req, res, next) => {
  try {
    const id = validateId(req.params.id);
    const book = getBookById(id);
    if (!book) throw notFound('Kitap bulunamadı.');

    const parsed = bookSchema.safeParse(req.body);
    if (!parsed.success) {
      renderForm(res, {
        mode: 'edit',
        bookId: id,
        values: bodyToBookFormValues(req.body),
        errors: zodFieldErrors(parsed.error),
        status: 400,
      });
      return;
    }

    const input = toBookInput(parsed.data);
    const duplicate = findBookByIsbn(input.isbn13, input.isbn10);
    if (duplicate && duplicate.id !== id) {
      renderForm(res, {
        mode: 'edit',
        bookId: id,
        values: bodyToBookFormValues(req.body),
        errors: { isbn: `Bu ISBN başka bir kayıtta kullanılıyor: "${duplicate.title}" (#${duplicate.id}).` },
        status: 400,
      });
      return;
    }

    updateBook(id, input);
    logAudit(req.user!.id, 'book.update', 'book', id, { title: input.title });
    setFlash(res, 'success', 'Kitap künyesi güncellendi.');
    res.redirect(`/admin/kitaplar/${id}`);
  } catch (error) {
    next(error);
  }
});

adminBooksRouter.post('/kitaplar/:id/kopya', (req, res, next) => {
  try {
    const id = validateId(req.params.id);
    const book = getBookById(id);
    if (!book) throw notFound('Kitap bulunamadı.');

    const parsed = copySchema.safeParse(req.body);
    if (!parsed.success) {
      setFlash(res, 'error', Object.values(zodFieldErrors(parsed.error))[0] ?? 'Kopya eklenemedi.');
      res.redirect(`/admin/kitaplar/${id}`);
      return;
    }

    try {
      const copyId = addCopy(id, {
        inventory_no: parsed.data.inventory_no ?? null,
        condition: parsed.data.condition,
        shelf_location: parsed.data.shelf_location ?? null,
        acquired_at: parsed.data.acquired_at ?? null,
        notes: parsed.data.notes ?? null,
      });
      logAudit(req.user!.id, 'copy.create', 'copy', copyId, { book_id: id });
      setFlash(res, 'success', 'Yeni kopya eklendi.');
    } catch (error) {
      const message =
        error instanceof Error && error.message.includes('UNIQUE')
          ? 'Bu envanter numarası zaten kullanılıyor.'
          : 'Kopya eklenemedi.';
      setFlash(res, 'error', message);
    }

    res.redirect(`/admin/kitaplar/${id}`);
  } catch (error) {
    next(error);
  }
});

adminBooksRouter.post('/kopya/:id/durum', (req, res, next) => {
  try {
    const id = validateId(req.params.id);
    const copy = getCopyById(id);
    if (!copy) throw notFound('Kopya bulunamadı.');

    const parsed = copyStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      setFlash(res, 'error', 'Geçersiz kopya durumu.');
      res.redirect(`/admin/kitaplar/${copy.book_id}`);
      return;
    }

    const newStatus = parsed.data.status;
    const activeLoan = findActiveLoanByCopy(copy.id);
    const approvedRequest = findApprovedRequestForCopy(copy.id);

    let error: string | null = null;
    if (activeLoan && newStatus !== 'on_loan') {
      error = 'Bu kopya ödünçte. Durumu değiştirmeden önce iade işlemini yapın.';
    } else if (!activeLoan && newStatus === 'on_loan') {
      error = '"Ödünçte" durumu yalnızca ödünç verme işlemiyle atanabilir.';
    } else if (approvedRequest && newStatus !== 'reserved') {
      error = 'Bu kopya teslim bekleyen bir talebe rezerve edilmiş. Önce talebi kapatın veya teslim edin.';
    }

    if (error) {
      setFlash(res, 'error', error);
      res.redirect(`/admin/kitaplar/${copy.book_id}`);
      return;
    }

    if (copy.status !== newStatus) {
      updateCopyStatus(copy.id, newStatus);
      logAudit(req.user!.id, 'copy.status', 'copy', copy.id, {
        from: copy.status,
        to: newStatus,
      });
      setFlash(res, 'success', 'Kopya durumu güncellendi.');
    }

    res.redirect(`/admin/kitaplar/${copy.book_id}`);
  } catch (error) {
    next(error);
  }
});

adminBooksRouter.post('/kopya/:id/sil', (req, res, next) => {
  try {
    const id = validateId(req.params.id);
    const copy = getCopyById(id);
    if (!copy) throw notFound('Kopya bulunamadı.');

    const usage = copyUsageCounts(copy.id);
    if (usage.loans > 0 || usage.requests > 0) {
      setFlash(
        res,
        'error',
        'Bu kopyanın geçmiş ödünç/talep kaydı var. Silmek yerine "Arşiv dışı" durumuna alabilirsiniz.',
      );
      res.redirect(`/admin/kitaplar/${copy.book_id}`);
      return;
    }

    deleteCopy(copy.id);
    logAudit(req.user!.id, 'copy.delete', 'copy', copy.id, {
      book_id: copy.book_id,
      inventory_no: copy.inventory_no,
    });
    setFlash(res, 'success', 'Kopya silindi.');
    res.redirect(`/admin/kitaplar/${copy.book_id}`);
  } catch (error) {
    next(error);
  }
});
