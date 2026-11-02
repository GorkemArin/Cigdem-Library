export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    sql: `
      CREATE TABLE users (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        full_name     TEXT    NOT NULL,
        email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
        phone         TEXT,
        password_hash TEXT    NOT NULL,
        role          TEXT    NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
        status        TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended')),
        member_no     TEXT    UNIQUE,
        address       TEXT,
        notes         TEXT,
        created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
      );

      CREATE TABLE sessions (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        token_hash TEXT    NOT NULL UNIQUE,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        expires_at TEXT    NOT NULL
      );
      CREATE INDEX idx_sessions_expires ON sessions(expires_at);

      CREATE TABLE books (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        isbn13          TEXT    UNIQUE,
        isbn10          TEXT,
        title           TEXT    NOT NULL,
        subtitle        TEXT,
        authors         TEXT,
        publisher       TEXT,
        published_year  INTEGER,
        language        TEXT    NOT NULL DEFAULT 'tr',
        page_count      INTEGER,
        categories      TEXT,
        description     TEXT,
        cover_url       TEXT,
        openlibrary_key TEXT,
        created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
      );
      CREATE INDEX idx_books_title ON books(title);

      CREATE VIRTUAL TABLE books_fts USING fts5(
        title,
        subtitle,
        authors,
        publisher,
        isbn,
        categories,
        description,
        content='books',
        content_rowid='id',
        tokenize='unicode61 remove_diacritics 2'
      );

      CREATE TRIGGER books_ai AFTER INSERT ON books BEGIN
        INSERT INTO books_fts(rowid, title, subtitle, authors, publisher, isbn, categories, description)
        VALUES (new.id, new.title, new.subtitle, new.authors, new.publisher,
                coalesce(new.isbn13, new.isbn10, ''), new.categories, new.description);
      END;
      CREATE TRIGGER books_ad AFTER DELETE ON books BEGIN
        INSERT INTO books_fts(books_fts, rowid, title, subtitle, authors, publisher, isbn, categories, description)
        VALUES ('delete', old.id, old.title, old.subtitle, old.authors, old.publisher,
                coalesce(old.isbn13, old.isbn10, ''), old.categories, old.description);
      END;
      CREATE TRIGGER books_au AFTER UPDATE ON books BEGIN
        INSERT INTO books_fts(books_fts, rowid, title, subtitle, authors, publisher, isbn, categories, description)
        VALUES ('delete', old.id, old.title, old.subtitle, old.authors, old.publisher,
                coalesce(old.isbn13, old.isbn10, ''), old.categories, old.description);
        INSERT INTO books_fts(rowid, title, subtitle, authors, publisher, isbn, categories, description)
        VALUES (new.id, new.title, new.subtitle, new.authors, new.publisher,
                coalesce(new.isbn13, new.isbn10, ''), new.categories, new.description);
      END;

      CREATE TABLE copies (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        book_id        INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        inventory_no   TEXT    NOT NULL UNIQUE,
        status         TEXT    NOT NULL DEFAULT 'available'
                       CHECK (status IN ('available', 'on_loan', 'reserved', 'lost', 'repair', 'withdrawn')),
        condition      TEXT    NOT NULL DEFAULT 'good'
                       CHECK (condition IN ('new', 'good', 'fair', 'poor')),
        shelf_location TEXT,
        acquired_at    TEXT,
        notes          TEXT,
        created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        updated_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
      );
      CREATE INDEX idx_copies_book ON copies(book_id);
      CREATE INDEX idx_copies_status ON copies(status);

      CREATE TABLE borrow_requests (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        book_id     INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        copy_id     INTEGER REFERENCES copies(id) ON DELETE SET NULL,
        status      TEXT    NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'fulfilled')),
        member_note TEXT,
        admin_note  TEXT,
        handled_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
        handled_at  TEXT,
        created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
      );
      CREATE INDEX idx_requests_user ON borrow_requests(user_id);
      CREATE INDEX idx_requests_book ON borrow_requests(book_id);
      CREATE INDEX idx_requests_status ON borrow_requests(status);

      CREATE TABLE loans (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        copy_id     INTEGER NOT NULL REFERENCES copies(id),
        book_id     INTEGER NOT NULL REFERENCES books(id),
        user_id     INTEGER NOT NULL REFERENCES users(id),
        request_id  INTEGER REFERENCES borrow_requests(id) ON DELETE SET NULL,
        loaned_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
        loaned_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        due_at      TEXT    NOT NULL,
        returned_at TEXT,
        returned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        renew_count INTEGER NOT NULL DEFAULT 0,
        notes       TEXT
      );
      CREATE INDEX idx_loans_user ON loans(user_id);
      CREATE INDEX idx_loans_copy ON loans(copy_id);
      CREATE INDEX idx_loans_due ON loans(returned_at, due_at);
      CREATE UNIQUE INDEX idx_loans_active_copy ON loans(copy_id) WHERE returned_at IS NULL;

      CREATE TABLE settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE audit_log (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        actor_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
        action      TEXT    NOT NULL,
        entity_type TEXT,
        entity_id   INTEGER,
        details     TEXT,
        created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
      );
      CREATE INDEX idx_audit_created ON audit_log(created_at DESC);

      INSERT INTO settings (key, value) VALUES
        ('library_name', 'Çiğdemim Derneği Kütüphanesi'),
        ('loan_days', '21'),
        ('renew_days', '14'),
        ('max_renewals', '1'),
        ('max_active_loans', '3'),
        ('hold_days', '3'),
        ('fine_per_day', '0'),
        ('contact_email', 'kutuphane@cigdemim.org'),
        ('contact_phone', '');
    `,
  },
];
