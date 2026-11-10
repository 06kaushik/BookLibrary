import React, {memo, useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useIsFocused} from '@react-navigation/native';
import {useNetInfo} from '@react-native-community/netinfo';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Action, Notice} from '../components/Controls';
import {fetchBrowse, LANGUAGES, TOPICS} from '../data/books';
import {readBrowse, readSavedPage, writeBrowse} from '../data/storage';
import {colors} from '../theme';


 
const BookItem = memo(function BookItemView({book, details, open}) {
 

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => open(book.id, details)}
      style={({pressed}) => [styles.row, pressed && styles.pressed]}>
      <View
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={styles.spine}>
        <Text style={styles.spineText}>B</Text>
      </View>
      <View style={styles.rowText}>
        <Text numberOfLines={2} style={styles.bookTitle}>
          {book.title}
        </Text>
        <Text numberOfLines={1} style={styles.author}>
          {book.author}
        </Text>
      </View>
      <Text
        accessible={false}
        importantForAccessibility="no"
        style={styles.arrow}>
        ›
      </Text>
    </Pressable>
  );
});


function Chips({label, options, selected, onSelect}) {
  return (
    <View style={styles.filter}>
      <Text style={styles.filterLabel}>{label}</Text>
      <View style={styles.chips}>
        {options.map(([name, value]) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityLabel={label + ', ' + name}
            accessibilityState={{
              selected: selected === value,
            }}
            onPress={() => onSelect(value)}
            style={[styles.chip, selected === value && styles.selected]}>
            <Text
              style={[
                styles.chipText,
                selected === value && styles.selectedText,
              ]}>
              {name}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}


export function BrowseScreen({navigation}) {

  const [section, setSection] = useState('catalog');
  const [language, setLanguage] = useState('');
  const [topic, setTopic] = useState('');
  const [page, setPage] = useState(1);
  const net = useNetInfo();
  const offline =
    net.isConnected === false || net.isInternetReachable === false;
  const catalog = section === 'catalog';
  const visiblePage = catalog && offline ? 1 : page;
  useEffect(() => {
    if (catalog && offline) {
      setPage(1);
    }
  }, [catalog, offline]);
  const open = useCallback(
    (id, book) => navigation.navigate('Details', {id, book}),
    [navigation],
  );
  const header = (
    <View style={styles.header}>
      <Text accessibilityRole="header" style={styles.heading}>
        Book Library
      </Text>
      <View style={styles.tabs}>
        <View style={styles.tab}>
          <Action
            label="Browse"
            primary={catalog}
            onPress={() => {
              if (!catalog) {
                setSection('catalog');
                setPage(1);
              }
            }}
          />
        </View>
        <View style={styles.tab}>
          <Action
            label="Saved books"
            primary={!catalog}
            onPress={() => {
              if (catalog) {
                setSection('saved');
                setPage(1);
              }
            }}
          />
        </View>
      </View>
      {catalog && (
        <>
          <Chips
            label="Language"
            options={LANGUAGES}
            selected={language}
            onSelect={value => {
              setLanguage(value);
              setPage(1);
            }}
          />
          <Chips
            label="Topic"
            options={TOPICS}
            selected={topic}
            onSelect={value => {
              setTopic(value);
              setPage(1);
            }}
          />
        </>
      )}
    </View>
  );
  return (
    <SafeAreaView
      edges={['top', 'left', 'right', 'bottom']}
      style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      <BookPage
        key={JSON.stringify([section, language, topic, visiblePage])}
        section={section}
        language={language}
        topic={topic}
        page={visiblePage}
        offline={offline}
        header={header}
        open={open}
        setPage={setPage}
      />
    </SafeAreaView>
  );
}
function BookPage({
  section,
  language,
  topic,
  page,
  offline,
  header,
  open,
  setPage,
}) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const focused = useIsFocused();
  const saved = section === 'saved';
  const loadOffline = !saved && offline;
  const active = !saved || focused;

  useEffect(() => {
    if (!active) {
      return;
    }
    const controller = new AbortController();
    const {signal} = controller;
    setBusy(true);
    setError('');
    async function load() {
      try {
        if (saved) {
          const result = await readSavedPage(page);
          if (!signal.aborted) {
            if (page > 1 && result.rows.length === 0) {
              setPage(page - 1);
            } else {
              setData({
                ...result,
                source: 'saved',
              });
            }
          }
          return;
        }
        const key = language + '|' + topic;
        if (page === 1) {
          let rows = null;
          try {
            rows = await readBrowse(key);
          } catch {
            if (loadOffline) {
              throw new Error('cache unavailable');
            }
          }
          if (signal.aborted) {
            return;
          }
          if (rows) {
            setData({
              rows,
              hasNext: false,
              source: 'cached',
            });
          }
        }
        if (loadOffline) {
          return;
        }
        const result = await fetchBrowse(language, topic, page, signal);
        if (signal.aborted) {
          return;
        }
        setData({
          ...result,
          source: 'fresh',
        });
        if (page === 1) {
          writeBrowse(key, result.rows).catch(() => {
            if (!signal.aborted) {
              setError('Could not update the on-device Browse cache.');
            }
          });
        }
      } catch (requestError) {
        if (!signal.aborted) {
          const message = saved
            ? 'Could not open your saved library.'
            : loadOffline
            ? 'Could not read the Browse cache.'
            : requestError.kind === 'timeout'
            ? 'Gutendex took too long to respond.'
            : requestError.kind === 'unavailable'
            ? 'Gutendex is temporarily unavailable.'
            : 'Could not refresh from Gutendex.';
          setError(message);
        }
      } finally {
        if (!signal.aborted) {
          setBusy(false);
        }
      }
    }
    load();
    return () => controller.abort();
  }, [active, attempt, language, loadOffline, page, saved, setPage, topic]);
  const details = data?.details;
  const renderItem = useCallback(
    ({item}) => (
      <BookItem book={item} details={details?.[item.id]} open={open} />
    ),
    [details, open],
  );
  const sourceText = saved
    ? 'Saved on this device'
    : data?.source === 'cached'
    ? busy && !offline
      ? 'Cached results · Refreshing…'
      : 'Cached results'
    : data?.source === 'fresh'
    ? offline
      ? 'Last fetched results'
      : busy
      ? 'Fresh results · Refreshing…'
      : 'Fresh results from Gutendex'
    : busy
    ? 'Loading catalog…'
    : 'Catalog unavailable';
  const emptyText = saved
    ? 'Books you save for offline access appear here.'
    : offline && !data
    ? 'No cached results for these filters. Try other filters or open Saved books.'
    : data
    ? 'No books matched these filters.'
    : 'Try again to load the catalog.';
  const showPaging = page > 1 || data?.hasNext;
  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.listContent}
      data={data?.rows ?? []}
      renderItem={renderItem}
      keyExtractor={item => String(item.id)}
      initialNumToRender={7}
      maxToRenderPerBatch={5}
      windowSize={5}
      ListHeaderComponent={
        <View style={styles.listHeader}>
          {header}
          {offline && <Notice warning text="You’re offline." />}
          <Notice text={sourceText} />
          {error !== '' && <Notice warning text={error} />}
          {(!offline || saved) && error !== '' && (
            <Action
              label="Try again"
              onPress={() => setAttempt(value => value + 1)}
            />
          )}
        </View>
      }
      ListEmptyComponent={
        busy ? (
          <ActivityIndicator color={colors.green} style={styles.empty} />
        ) : (
          <Text style={styles.empty}>{emptyText}</Text>
        )
      }
      ListFooterComponent={
        showPaging ? (
          <View style={styles.paging}>
            <Action
              label="Previous"
              disabled={page === 1}
              onPress={() => setPage(page - 1)}
            />
            <Text style={styles.pageNumber}>Page {page}</Text>
            <Action
              label="Next"
              disabled={!data?.hasNext || busy || loadOffline}
              onPress={() => setPage(page + 1)}
            />
          </View>
        ) : null
      }
    />
  );
}


const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 18,
    paddingBottom: 18,
  },
  header: {
    paddingTop: 14,
    gap: 10,
  },
  eyebrow: {
    color: colors.green,
    fontWeight: '800',
    letterSpacing: 2,
    fontSize: 11,
  },
  heading: {
    color: colors.ink,
    fontSize: 34,
    fontFamily: 'serif',
    fontWeight: '700',
  },
  tabs: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 3,
  },
  tab: {
    flex: 1,
  },
  filter: {
    gap: 3,
  },
  filterLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  chip: {
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: 20,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  selected: {
    backgroundColor: colors.green,
    borderColor: colors.green,
  },
  chipText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '600',
  },
  selectedText: {
    color: colors.white,
  },
  listHeader: {
    gap: 8,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 72,
    padding: 10,
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    marginBottom: 8,
  },
  pressed: {
    backgroundColor: colors.softGreen,
  },
  spine: {
    width: 32,
    height: 44,
    borderRadius: 4,
    backgroundColor: colors.softGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spineText: {
    fontFamily: 'serif',
    fontWeight: '700',
    color: colors.green,
    fontSize: 20,
  },
  rowText: {
    flex: 1,
  },
  bookTitle: {
    color: colors.ink,
    fontWeight: '700',
    fontSize: 15,
  },
  author: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 3,
  },
  arrow: {
    color: colors.green,
    fontSize: 25,
    paddingHorizontal: 4,
  },
  empty: {
    color: colors.muted,
    padding: 14,
    textAlign: 'center',
  },
  paging: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginTop: 8,
  },
  pageNumber: {
    color: colors.muted,
    flexShrink: 1,
    textAlign: 'center',
  },
});
