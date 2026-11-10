import {open} from '@op-engineering/op-sqlite';
let connection;
let ready;
export const SAVED_PAGE_SIZE = 24;


async function database() {
  ready ??= (async () => {
    const db = (connection ??= open({
      name: 'book-library.sqlite',
    }));
    await db.execute(`
      CREATE TABLE IF NOT EXISTS browse_cache (
        filter_key TEXT PRIMARY KEY,
        rows_json TEXT NOT NULL
      )
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS saved_books (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        author TEXT NOT NULL,
        metadata_json TEXT NOT NULL,
        saved_at INTEGER NOT NULL
      )
    `);
    await db.execute(`
      CREATE INDEX IF NOT EXISTS saved_books_order ON saved_books(saved_at DESC, id DESC)
    `);
    return db;
  })().catch(error => {
    ready = undefined;
    throw error;
  });
  return ready;
}
export async function readBrowse(key) {

  const db = await database();
  const result = await db.execute(
    'SELECT rows_json FROM browse_cache WHERE filter_key = ?',
    [key],
  );
  const json = result.rows[0]?.rows_json;
  return typeof json === 'string' ? JSON.parse(json) : null;
}
export async function writeBrowse(key, rows) {
  const db = await database();
  await db.execute(
    'INSERT OR REPLACE INTO browse_cache (filter_key, rows_json) VALUES (?, ?)',
    [key, JSON.stringify(rows)],
  );
}
export async function readSavedPage(page) {
  const db = await database();
  const result = await db.execute(
    'SELECT id, title, author FROM saved_books ORDER BY saved_at DESC, id DESC LIMIT ? OFFSET ?',
    [SAVED_PAGE_SIZE + 1, (page - 1) * SAVED_PAGE_SIZE],
  );
  return {
    rows: result.rows.slice(0, SAVED_PAGE_SIZE),
    hasNext: result.rows.length > SAVED_PAGE_SIZE,
  };
}
export async function readSaved(id) {
  const db = await database();
  const result = await db.execute(
    'SELECT metadata_json FROM saved_books WHERE id = ?',
    [id],
  );
  const json = result.rows[0]?.metadata_json;
  return typeof json === 'string' ? JSON.parse(json) : null;
}
export async function saveBook(book) {
  const db = await database();
  await db.execute(
    'INSERT OR REPLACE INTO saved_books (id, title, author, metadata_json, saved_at) VALUES (?, ?, ?, ?, ?)',
    [
      book.id,
      book.title,
      book.authors.join(', ') || 'Unknown author',
      JSON.stringify(book),
      Date.now(),
    ],
  );
}

export async function removeBook(id) {
  const db = await database();
  await db.execute('DELETE FROM saved_books WHERE id = ?', [id]);
}
