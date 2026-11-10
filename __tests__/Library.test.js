import React from 'react';
import {Text} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {Action} from '../src/components/Controls';
import {readSaved, removeBook, writeBrowse} from '../src/data/storage';
import {BrowseScreen} from '../src/screens/BrowseScreen';
import {DetailsScreen} from '../src/screens/DetailsScreen';
let mockOffline = false;
jest.mock('@react-native-community/netinfo', () => ({
  useNetInfo: () => ({
    isConnected: !mockOffline,
    isInternetReachable: !mockOffline,
  }),
}));
jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => true,
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
}));
jest.mock('@op-engineering/op-sqlite', () => ({
  open: () => {
    // Use the real SQLite engine on the host. Replace only the RN native binding.
    const {DatabaseSync} = require('node:sqlite');
    const db = new DatabaseSync(':memory:');
    return {
      execute: async (sql, params = []) => ({
        rows: db.prepare(sql).all(...params),
      }),
    };
  },
}));
const book = {
  id: 1342,
  title: 'Pride and Prejudice',
  authors: ['Austen, Jane'],
  languages: ['en'],
  subjects: ['Courtship -- Fiction'],
  shelves: ['Best Books Ever Listings'],
  downloads: 120,
  cover: 'https://example.org/cover.jpg',
  formats: [
    {
      mime: 'text/html',
      url: 'https://example.org/book',
    },
    {
      mime: 'image/jpeg',
      url: 'https://example.org/cover.jpg',
    },
  ],
};
const apiResponse = {
  ok: true,
  json: async () => ({
    next: null,
    results: [
      {
        id: book.id,
        title: book.title,
        authors: book.authors.map(name => ({
          name,
        })),
        languages: book.languages,
        subjects: book.subjects,
        bookshelves: book.shelves,
        download_count: book.downloads,
        formats: Object.fromEntries(
          book.formats.map(format => [format.mime, format.url]),
        ),
      },
    ],
  }),
};
let screen;
async function mount(element) {
  await act(async () => {
    screen = ReactTestRenderer.create(element);
  });
}
function visible(label) {
  return screen.root
    .findAllByType(Text)
    .some(node => node.props.children === label);
}
async function press(label) {
  const action = screen.root
    .findAllByType(Action)
    .find(node => node.props.label === label);
  expect(action).toBeDefined();
  await act(async () => {
    await action?.props.onPress();
  });
}
function browse() {
  const navigation = {
    navigate: jest.fn(),
  };
  return (
    <BrowseScreen
      navigation={navigation}
      route={{
        key: 'browse',
        name: 'Browse',
      }}
    />
  );
}
function details() {
  return (
    <DetailsScreen
      navigation={{}}
      route={{
        key: 'details',
        name: 'Details',
        params: {
          id: book.id,
        },
      }}
    />
  );
}
beforeEach(async () => {
  mockOffline = false;
  await removeBook(book.id);
});
afterEach(async () => {
  if (screen) {
    await act(async () => {
      screen.unmount();
    });
  }
  jest.restoreAllMocks();
});
test('shows SQLite Browse rows while refresh is pending, then switches to fresh data', async () => {
  await writeBrowse('|', [
    {
      id: 84,
      title: 'Frankenstein',
      author: 'Shelley, Mary',
    },
  ]);
  let complete;
  const request = new Promise(resolve => {
    complete = resolve;
  });
  jest.spyOn(globalThis, 'fetch').mockReturnValue(request);
  await mount(browse());
  expect(visible('Cached results · Refreshing…')).toBe(true);
  expect(visible('Frankenstein')).toBe(true);
  await act(async () => {
    complete(apiResponse);
  });
  expect(visible('Fresh results from Gutendex')).toBe(true);
  expect(visible(book.title)).toBe(true);
  expect(visible('Frankenstein')).toBe(false);
});
test('keeps cached Browse visible during an offline launch', async () => {
  mockOffline = true;
  await writeBrowse('|', [
    {
      id: 84,
      title: 'Frankenstein',
      author: 'Shelley, Mary',
    },
  ]);
  const network = jest.spyOn(globalThis, 'fetch');
  await mount(browse());
  expect(visible('You’re offline.')).toBe(true);
  expect(visible('Cached results')).toBe(true);
  expect(visible('Frankenstein')).toBe(true);
  expect(network).not.toHaveBeenCalled();
});
test('saves metadata, shows it in the offline library, and opens it offline until removed', async () => {
  const network = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(apiResponse);
  await mount(details());
  await press('Save for offline');
  expect(await readSaved(book.id)).toEqual(book);
  expect(network).toHaveBeenCalledTimes(1);
  mockOffline = true;
  await act(async () => {
    screen.update(browse());
  });
  await press('Saved books');
  expect(visible(book.title)).toBe(true);
  await act(async () => {
    screen.update(details());
  });
  expect(visible(book.title)).toBe(true);
  expect(visible('Courtship -- Fiction')).toBe(true);
  expect(network).toHaveBeenCalledTimes(1);
  await press('Remove from offline');
  expect(await readSaved(book.id)).toBeNull();
  expect(
    visible(
      'This book is not saved on this device. Reconnect to open its details.',
    ),
  ).toBe(true);
  expect(network).toHaveBeenCalledTimes(1);
});
test('uses the selected language and topic on every page and resets page on filter change', async () => {
  const payload = await apiResponse.json();
  const network = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => ({
      ...payload,
      next: 'https://gutendex.com/books/?page=2',
    }),
  });
  async function chip(label) {
    const target = screen.root.findAll(
      node => node.props.accessibilityLabel === label && !!node.props.onPress,
    )[0];
    expect(target).toBeDefined();
    await act(async () => {
      target.props.onPress();
    });
  }
  await mount(browse());
  expect(network).toHaveBeenLastCalledWith(
    'https://gutendex.com/books/',
    expect.anything(),
  );
  await chip('Language, Finnish');
  await chip('Topic, Science Fiction');
  expect(network).toHaveBeenLastCalledWith(
    'https://gutendex.com/books/?languages=fi&topic=science%20fiction',
    expect.anything(),
  );
  await press('Next');
  expect(network).toHaveBeenLastCalledWith(
    'https://gutendex.com/books/?languages=fi&topic=science%20fiction&page=2',
    expect.anything(),
  );
  await chip('Language, German');
  expect(network).toHaveBeenLastCalledWith(
    'https://gutendex.com/books/?languages=de&topic=science%20fiction',
    expect.anything(),
  );
});
