export const LANGUAGES = [
  ['All', ''],
  ['English', 'en'],
  ['French', 'fr'],
  ['Finnish', 'fi'],
  ['German', 'de'],
];
export const TOPICS = [
  ['All', ''],
  ['Fiction', 'fiction'],
  ['Children', 'children'],
  ['Science Fiction', 'science fiction'],
  ['Poetry', 'poetry'],
];
const base = 'https://gutendex.com/books/';
const requestTimeoutMs = 25000;
const retryDelayMs = 650;


export class BookRequestError extends Error {
  constructor(kind) {
    super(kind);
    this.kind = kind;
  }
}
export function languageName(code) {
  return (
    LANGUAGES.find(([, value]) => value === code)?.[0] ?? code.toUpperCase()
  );
}
export function bookRow(book) {

  return {
    id: book.id,
    title: book.title,
    author: book.authors.join(', ') || 'Unknown author',
  };
}
async function requestPage(query, signal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal.aborted) {
    abort();
  }
  signal.addEventListener('abort', abort);
  const timer = setTimeout(abort, requestTimeoutMs);
  const failureKind = () =>
    controller.signal.aborted && !signal.aborted ? 'timeout' : 'connection';
  const url = query ? base + '?' + query : base;

  async function fetchResponse() {
    let response;
    try {
      response = await fetch(url, {signal: controller.signal});
    } catch {
      throw new BookRequestError(failureKind());
    }
    if ([500, 502, 503, 504].includes(response.status)) {
      throw new BookRequestError('unavailable');
    }
    if (!response.ok) {
      throw new BookRequestError('server');
    }
    return response;
  }

  try {
    const response = await fetchResponse().catch(async error => {
      const transient =
        error.kind === 'unavailable' || error.kind === 'connection';
      if (!transient || controller.signal.aborted) {
        throw error;
      }
      
      await new Promise(resolve => {
        const finish = () => {
          clearTimeout(retryTimer);
          controller.signal.removeEventListener('abort', finish);
          resolve();
        };
        const retryTimer = setTimeout(finish, retryDelayMs);
        controller.signal.addEventListener('abort', finish);
      });
      if (controller.signal.aborted) {
        throw new BookRequestError(failureKind());
      }
      return fetchResponse();
    });
    try {
      return await response.json();
    } catch {
      throw new BookRequestError(
        controller.signal.aborted ? failureKind() : 'server',
      );
    }
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
  }
}
export async function fetchBrowse(language, topic, page, signal) {
  
  const params = [];
  if (language) {
    params.push('languages=' + encodeURIComponent(language));
  }
  if (topic) {
    params.push('topic=' + encodeURIComponent(topic));
  }
  if (page > 1) {
    params.push('page=' + page);
  }
  const {results, next} = await requestPage(params.join('&'), signal);
  const books = results.map(normalizeBook);
  return {
    rows: books.map(bookRow),
    details: Object.fromEntries(books.map(book => [book.id, book])),
    hasNext: Boolean(next),
  };
}

export async function fetchBook(id, signal) {
  const {results} = await requestPage('ids=' + id, signal);
  const book = results[0];
  if (!book) {
    throw new BookRequestError('missing');
  }
  return normalizeBook(book);
}

function normalizeBook(book) {
  const formats = Object.entries(book.formats)
    .filter(([, url]) => /^https?:\/\//i.test(url))
    .map(([mime, url]) => ({
      mime,
      url,
    }));
  const cover =
    formats.find(
      format =>
        format.mime === 'image/jpeg' && format.url.startsWith('https://'),
    )?.url ?? null;
  return {
    id: book.id,
    title: book.title,
    authors: book.authors.map(author => author.name),
    languages: book.languages,
    subjects: book.subjects,
    shelves: book.bookshelves,
    downloads: book.download_count,
    cover,
    formats,
  };
}
