# Book Library

A two-screen React Native CLI app for browsing popular Project Gutenberg books through Gutendex. It uses plain JavaScript, React Native CLI 0.77.3, React Navigation native stack, NetInfo, and OP-SQLite. Android is the primary target.

## Run on Android

Install Node.js 22.13 or newer, JDK 17, and Android Studio. In SDK Manager install Android SDK Platform 35, Build Tools 35.0.0, platform tools, and NDK 27.1.12297006. Set up `ANDROID_HOME` and start an emulator or connect an Android phone with USB debugging.

```sh
npm ci
npm start
```

In a second terminal from the same folder:

```sh
npm run android
```

The Android project compiles with API 35, targets API 34, and supports Android 7.0 (API 24) and later, including 32-bit ARM and 64-bit ARM builds. The Android SDK setup guide is available in the [React Native documentation](https://reactnative.dev/docs/set-up-your-environment).

## Offline behavior

| State | Browse | Book Details |
| --- | --- | --- |
| Online with cached rows | Immediately shows the cached first page for the selected filters, then replaces it and updates the label after a successful refresh. | Reads saved books from SQLite first. Fetches other books by Gutenberg ID. |
| API refresh fails | Keeps cached rows visible where available and offers retry. | Shows a specific connection, server, or missing-book message. |
| Offline | Shows an offline banner and the cached first page for the current filters, when available. The **Saved books** tab remains available. | Opens saved metadata from SQLite and explains how to reconnect for an unsaved book. |

Saved records contain the title, author names, language codes, subjects, bookshelves, download count, cover URL, and format links. A placeholder appears for covers offline. Reading or downloading the ebook itself requires a connection.

## Memory and storage

- Catalog navigation retains one API page in JavaScript at a time. Gutendex returns up to 32 books per page. Saved books are queried 24 at a time, so a large saved library stays navigable.
- Browse maps the API response to lightweight rows and never mounts a grid of cover images. `FlatList` uses a small render window and memoized rows. Only Details loads a cover, with fixed display dimensions and Android downsampling.
- One SQLite connection runs async queries. The Browse cache holds up to 25 entries, one first page per language and topic pair. Saved metadata lives in a separate table, and the saved list reads only the columns it displays.
- A filter or page change cancels the previous request. Requests also have a timeout. Cached rows stay usable when a refresh fails.
- The Android build uses Hermes. The low-memory path has no background image prefetch, file downloads, or ever-growing array of Browse results.

## Verification

```sh
npm run lint
npm test -- --runInBand
```

The tests exercise cached-to-fresh startup, offline Browse, save and remove, offline Details, and pagination with filters. The tests run the production SQL against host SQLite and substitute the native binding and network. The Android production JavaScript bundle and native code generation can also be verified without an Android device.

### Validate on a low-RAM Android phone

Build a release-mode APK so Metro and debug tooling are out of the measurement. The template's release variant uses the debug signing key for local testing.

```sh
cd android
./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a
adb install -r app/build/outputs/apk/release/app-release.apk
adb shell dumpsys meminfo com.booklibrary
```

For a 32-bit ARM test device, use `armeabi-v7a` in the build command. Use the device's ABI if different.

1. Launch online, change language and topic, page through results, and save a book. Record startup time and total PSS.
2. Force-stop the app, enable airplane mode, and relaunch. Confirm cached Browse appears, saved Details opens, and unsaved Details shows a reconnect message.
3. Remove a saved book offline and reopen **Saved books**. Confirm the row is gone.
4. Disable airplane mode. Confirm Browse refreshes. Rapidly change filters, page repeatedly, and reopen Details. Check for sustained memory growth, rendering stalls, crashes, and ANRs.
5. Compare cold-start and steady-state memory with Android Studio Profiler or repeatable `adb shell dumpsys meminfo` snapshots. Record the device model, RAM, and Android version with the results.

Native installation and device-level profiling are separate from the automated checks. Use a representative physical low-RAM device to establish a performance baseline.

API contract and examples are in the [Gutendex documentation](https://gutendex.com/).
