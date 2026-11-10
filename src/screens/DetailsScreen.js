import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNetInfo } from '@react-native-community/netinfo';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Action, Notice } from '../components/Controls';
import { BookRequestError, fetchBook, languageName } from '../data/books';
import { readSaved, removeBook, saveBook } from '../data/storage';
import { colors } from '../theme';



const offlineError =
  'This book is not saved on this device. Reconnect to open its details.';

export function DetailsScreen({ route }) {
  const { id, book } = route.params;
  return <BookDetails key={id} id={id} initialBook={book} />;
}


function BookDetails({ id, initialBook }) {
  
  const net = useNetInfo();
  const offline =
    net.isConnected === false || net.isInternetReachable === false;
  const [book, setBook] = useState(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(true);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState(0);
  const writeLock = useRef(false);
  const onlineBook = useRef(null);
  useEffect(() => {
    if (writing) {
      return;
    }
    const controller = new AbortController();
    const { signal } = controller;
    const active = () => !signal.aborted && !writeLock.current;
    setBusy(true);
    setError('');
    async function load() {
      try {
        const local = await readSaved(id).catch(storageError => {
          if (offline) {
            throw storageError;
          }
          return null;
        });
        if (!active()) {
          return;
        }
        setSaved(Boolean(local));
        if (local) {
          setBook(local);
        } else if (offline) {
          onlineBook.current = null;
          setBook(null);
          setError(offlineError);
        } else {
          const remote =
            onlineBook.current ?? initialBook ?? (await fetchBook(id, signal));
          if (active()) {
            onlineBook.current = remote;
            setBook(remote);
          }
        } 
      } catch (requestError) {
        if (!active()) {
          return;
        }
        setBook(null);
        if (requestError instanceof BookRequestError) {
          if (requestError.kind === 'missing') {
            setError('Gutendex could not find this book.');
          } else if (requestError.kind === 'timeout') {
            setError('Gutendex took too long to respond. Try again.');
          } else if (requestError.kind === 'unavailable') {
            setError('Gutendex is temporarily unavailable. Try again.');
          } else if (requestError.kind === 'connection') {
            setError(
              'Could not reach Gutendex. Check your connection and try again.',
            );
          } else {
            setError(
              'Gutendex could not load this book. Try again in a moment.',
            );
          }
        } else {
          setError('Could not read saved book metadata. Try again.');
        }
      } finally {
        if (!signal.aborted) {
          setBusy(false);
        }
      }
    }
    load();
    return () => controller.abort();
  }, [attempt, id, initialBook, offline, writing]);
  async function toggleSaved() {
    if (!book || busy || writeLock.current) {
      return;
    }
    writeLock.current = true;
    setWriting(true);
    setNotice('');
    try {
      if (saved) {
        await removeBook(id);
        if (!offline) {
          onlineBook.current = book;
        }
      } else {
        await saveBook(book);
      }
      setSaved(!saved);
      setNotice(
        saved ? 'Removed from saved books.' : 'Saved for offline access.',
      );
    } catch {
      setNotice('Could not update your saved books. Please try again.');
    } finally {
      writeLock.current = false;
      setWriting(false);
    }
  }

  async function openFormat(url) {
    try {
      await Linking.openURL(url);
    } catch {
      setNotice('Could not open this format on your device.');
    }
  }
  const visibleBook = offline && !saved ? null : book;
  const failure = error || (offline && !saved ? offlineError : '');
  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        {offline && <Notice warning text="You’re offline." />}
        {notice !== '' && <Notice text={notice} />}
        {visibleBook ? (
          <>
            <View style={styles.hero}>
              <Cover
                key={visibleBook.cover}
                book={visibleBook}
                offline={offline}
              />
              <Text accessibilityRole="header" style={styles.title}>
                {visibleBook.title}
              </Text>
              <Text style={styles.author}>
                {visibleBook.authors.join(', ') || 'Unknown author'}
              </Text>
            </View>
            <Action
              primary
              label={
                writing
                  ? 'Updating saved books…'
                  : saved
                    ? 'Remove from offline'
                    : 'Save for offline'
              }
              disabled={busy || writing}
              onPress={toggleSaved}
            />
            <View style={styles.card}>
              <Field
                label="Languages"
                value={visibleBook.languages.map(languageName).join(', ')}
              />
              <Field
                label="Downloads"
                value={visibleBook.downloads?.toLocaleString() ?? 'Unavailable'}
              />
              <Field label="Subjects" value={visibleBook.subjects.join('\n')} />
              <Field
                label="Bookshelves"
                value={visibleBook.shelves.join('\n')}
              />
            </View>
            <Text accessibilityRole="header" style={styles.sectionTitle}>
              Available formats
            </Text>
            {offline && (
              <Text style={styles.body}>
                Connect to the internet to open format links.
              </Text>
            )}
            {visibleBook.formats.map(({ mime, url }) => (
              <Action
                key={mime}
                label={mime}
                disabled={offline}
                onPress={() => openFormat(url)}
              />
            ))}
            {visibleBook.formats.length === 0 && (
              <Text style={styles.body}>No formats listed.</Text>
            )}
          </>
        ) : busy ? (
          <ActivityIndicator color={colors.green} style={styles.loading} />
        ) : (
          <>
            <Notice warning text={failure || 'Book details are unavailable.'} />
            {(!offline || (error !== offlineError && error !== '')) && (
              <Action
                label="Try again"
                onPress={() => setAttempt(value => value + 1)}
              />
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
function Cover({ book, offline }) {
  const [failed, setFailed] = useState(false);
  if (!book.cover || failed || offline) {
    return (
      <View
        style={styles.cover}
        accessible
        accessibilityLabel="Cover image unavailable">
        <Text style={styles.coverLetter}>B</Text>
        <Text style={styles.coverCaption}>
          {offline ? 'Cover online' : 'No cover'}
        </Text>
      </View>
    );
  }
  return (
    <Image
      accessibilityLabel={'Cover of ' + book.title}
      source={{
        uri: book.cover,
      }}
      resizeMode="contain"
      resizeMethod="resize"
      onError={() => setFailed(true)}
      style={styles.cover}
    />
  );
}
function Field({ label, value }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.body}>{value || 'None listed'}</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  content: {
    paddingHorizontal: 18,
    paddingBottom: 22,
    gap: 12,
  },
  hero: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  cover: {
    width: 128,
    height: 174,
    borderRadius: 8,
    backgroundColor: colors.softGreen,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  coverLetter: {
    color: colors.green,
    fontSize: 54,
    fontFamily: 'serif',
  },
  coverCaption: {
    color: colors.green,
    fontSize: 13,
    textAlign: 'center',
  },
  title: {
    color: colors.ink,
    fontSize: 28,
    textAlign: 'center',
    fontFamily: 'serif',
    fontWeight: '700',
  },
  author: {
    color: colors.muted,
    fontSize: 16,
    textAlign: 'center',
  },
  card: {
    padding: 14,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 12,
  },
  field: {
    gap: 3,
  },
  label: {
    color: colors.ink,
    fontWeight: '700',
  },
  body: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  sectionTitle: {
    color: colors.ink,
    fontWeight: '700',
    fontSize: 18,
  },
  loading: {
    marginVertical: 20,
  },
});
