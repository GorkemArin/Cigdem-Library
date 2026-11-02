(() => {
  'use strict';

  // Flash mesajlarını kapat.
  document.querySelectorAll('[data-dismiss]').forEach((button) => {
    button.addEventListener('click', () => {
      const flash = button.closest('.flash');
      if (flash) flash.remove();
    });
  });

  document.querySelectorAll('.flash').forEach((flash) => {
    window.setTimeout(() => {
      flash.classList.add('flash--leaving');
      window.setTimeout(() => flash.remove(), 300);
    }, 9000);
  });

  // Kapak görseli yüklenemezse yer tutucuyu göster.
  document.querySelectorAll('img[data-cover]').forEach((image) => {
    image.addEventListener('error', () => image.remove());
  });

  // Onay gerektiren formlar.
  document.querySelectorAll('form[data-confirm]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      const message = form.getAttribute('data-confirm') || 'Bu işlemi yapmak istediğinize emin misiniz?';
      if (!window.confirm(message)) event.preventDefault();
    });
  });

  // Open Library künye arama paneli.
  const panel = document.querySelector('[data-ol-panel]');
  if (!panel) return;

  const isbnInput = panel.querySelector('[data-ol-isbn]');
  const queryInput = panel.querySelector('[data-ol-query]');
  const resultsBox = panel.querySelector('[data-ol-results]');
  const statusBox = panel.querySelector('[data-ol-status]');
  const isbnButton = panel.querySelector('[data-ol-isbn-button]');
  const queryButton = panel.querySelector('[data-ol-query-button]');
  const bookForm = document.querySelector('[data-book-form]');

  const setStatus = (message, tone = 'info') => {
    if (!statusBox) return;
    statusBox.textContent = message;
    statusBox.className = `ol-status ol-status--${tone}`;
  };

  const setLoading = (loading) => {
    if (isbnButton) isbnButton.disabled = loading;
    if (queryButton) queryButton.disabled = loading;
  };

  const fillForm = (book) => {
    if (!bookForm) return;

    const values = {
      title: book.title,
      subtitle: book.subtitle,
      authors: book.authors,
      isbn: book.isbn13 || book.isbn10,
      publisher: book.publisher,
      published_year: book.published_year,
      language: book.language,
      page_count: book.page_count,
      categories: book.categories,
      description: book.description,
      cover_url: book.cover_url,
      openlibrary_key: book.openlibrary_key,
    };

    for (const [name, value] of Object.entries(values)) {
      const field = bookForm.elements.namedItem(name);
      if (!field || value === null || value === undefined) continue;

      if (field instanceof HTMLSelectElement) {
        const optionExists = Array.from(field.options).some(
          (option) => option.value === String(value),
        );
        if (!optionExists) continue;
      }

      field.value = String(value);
    }

    setStatus('Künye forma aktarıldı. Kaydetmeden önce alanları kontrol edin.', 'success');
    bookForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const titleField = bookForm.elements.namedItem('title');
    if (titleField instanceof HTMLInputElement) {
      window.setTimeout(() => titleField.focus({ preventScroll: true }), 350);
    }
  };

  const makeCover = (book) => {
    const cover = document.createElement('div');
    cover.className = 'ol-cover';

    if (book.cover_url) {
      const image = document.createElement('img');
      image.src = book.cover_url;
      image.alt = '';
      image.loading = 'lazy';
      image.referrerPolicy = 'no-referrer';
      image.addEventListener('error', () => image.remove());
      cover.appendChild(image);
    }

    const fallback = document.createElement('span');
    fallback.className = 'ol-cover-fallback';
    fallback.textContent = (book.title || '?').trim().charAt(0).toLocaleUpperCase('tr-TR');
    cover.appendChild(fallback);
    return cover;
  };

  const renderResults = (books) => {
    if (!resultsBox) return;
    resultsBox.replaceChildren();

    if (!books || books.length === 0) {
      setStatus('Sonuç bulunamadı. Farklı bir arama deneyin veya künyeyi elle girin.', 'warning');
      return;
    }

    setStatus(`${books.length} sonuç bulundu. "Künyeyi doldur" ile formu otomatik doldurabilirsiniz.`, 'success');

    for (const book of books) {
      const card = document.createElement('article');
      card.className = 'ol-result';

      card.appendChild(makeCover(book));

      const body = document.createElement('div');
      body.className = 'ol-result-body';

      const title = document.createElement('h3');
      title.textContent = book.title || 'Adsız';
      body.appendChild(title);

      const authors = document.createElement('p');
      authors.className = 'ol-result-authors';
      authors.textContent = book.authors || 'Yazar bilgisi yok';
      body.appendChild(authors);

      const metaParts = [];
      if (book.published_year) metaParts.push(book.published_year);
      if (book.publisher) metaParts.push(book.publisher);
      if (book.isbn13) metaParts.push(`ISBN ${book.isbn13}`);
      if (metaParts.length > 0) {
        const meta = document.createElement('p');
        meta.className = 'ol-result-meta';
        meta.textContent = metaParts.join(' · ');
        body.appendChild(meta);
      }

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn--secondary btn--sm';
      button.textContent = 'Künyeyi doldur';
      button.addEventListener('click', () => fillForm(book));
      body.appendChild(button);

      card.appendChild(body);
      resultsBox.appendChild(card);
    }
  };

  const requestJson = async (url) => {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || 'İstek tamamlanamadı.');
    }
    return data;
  };

  if (isbnButton) {
    isbnButton.addEventListener('click', async () => {
      const isbn = (isbnInput?.value || '').trim();
      if (!isbn) {
        setStatus('Önce bir ISBN girin.', 'warning');
        isbnInput?.focus();
        return;
      }

      setLoading(true);
      setStatus('ISBN aranıyor...', 'info');
      try {
        const data = await requestJson(
          `/admin/api/openlibrary/isbn?isbn=${encodeURIComponent(isbn)}`,
        );
        renderResults([data.book]);
      } catch (error) {
        setStatus(error.message, 'error');
        if (resultsBox) resultsBox.replaceChildren();
      } finally {
        setLoading(false);
      }
    });

    isbnInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        isbnButton.click();
      }
    });
  }

  if (queryButton) {
    queryButton.addEventListener('click', async () => {
      const query = (queryInput?.value || '').trim();
      if (query.length < 2) {
        setStatus('Arama için en az 2 karakter girin.', 'warning');
        queryInput?.focus();
        return;
      }

      setLoading(true);
      setStatus('Open Library’de aranıyor...', 'info');
      try {
        const data = await requestJson(
          `/admin/api/openlibrary/ara?q=${encodeURIComponent(query)}`,
        );
        renderResults(data.results);
      } catch (error) {
        setStatus(error.message, 'error');
        if (resultsBox) resultsBox.replaceChildren();
      } finally {
        setLoading(false);
      }
    });

    queryInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        queryButton.click();
      }
    });
  }
})();
