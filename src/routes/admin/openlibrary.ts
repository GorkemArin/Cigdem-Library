import { Router } from 'express';
import { fetchOpenLibraryByIsbn, OpenLibraryError, searchOpenLibrary } from '../../lib/openlibrary.js';
import { formString } from '../../lib/http.js';

export const adminOpenLibraryRouter = Router();

adminOpenLibraryRouter.get('/api/openlibrary/ara', async (req, res) => {
  const q = formString(req.query.q);
  if (q.length < 2) {
    res.status(400).json({ error: 'Arama için en az 2 karakter girin.' });
    return;
  }

  try {
    const results = await searchOpenLibrary(q, 12);
    res.json({ results });
  } catch (error) {
    if (error instanceof OpenLibraryError) {
      res.status(502).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Open Library araması sırasında beklenmeyen bir hata oluştu.' });
  }
});

adminOpenLibraryRouter.get('/api/openlibrary/isbn', async (req, res) => {
  const isbn = formString(req.query.isbn);
  if (!isbn) {
    res.status(400).json({ error: 'ISBN girin.' });
    return;
  }

  try {
    const book = await fetchOpenLibraryByIsbn(isbn);
    if (!book) {
      res.status(404).json({ error: 'Bu ISBN için kayıt bulunamadı. Künyeyi elle girebilirsiniz.' });
      return;
    }
    res.json({ book });
  } catch (error) {
    if (error instanceof OpenLibraryError) {
      res.status(502).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Open Library kaydı alınırken beklenmeyen bir hata oluştu.' });
  }
});
