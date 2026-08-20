# Build and install Travel Empire with Termux

This guide builds the debug APK on an Android device and opens Android's package installer. The public Mapbox token is already bundled, so you do not need to create an `.env` file.

## Before you begin

- Install a current Termux release from F-Droid or the official Termux GitHub releases. The old Google Play build is unsupported.
- Allow Termux to **install unknown apps** in Android settings when prompted.
- Native Android builds require an ARM-compatible Android SDK containing Platform 35 and Build Tools 35. Termux's `android-tools` package provides tools such as `adb`, but it is not the complete build SDK. Install an on-device-compatible SDK from a source you trust before continuing; the standard desktop SDK binaries cannot execute on most ARM phones.
- Keep several gigabytes of free storage. Node modules, Gradle, the Android SDK, and build output are sizeable.

## 1. Prepare Termux

Run these commands in Termux:

```bash
pkg update && pkg upgrade
pkg install git nodejs-lts openjdk-17
npm install --global pnpm
termux-setup-storage
```

Accept Android's storage prompt. Verify the tools:

```bash
node --version
pnpm --version
java -version
```

The Android Gradle plugin used by this project requires Java 17 or newer.

## 2. Make the Android SDK available

If your SDK is already exported, check it first:

```bash
printf '%s\n' "$ANDROID_HOME"
test -f "$ANDROID_HOME/platforms/android-35/android.jar" && echo "Platform 35 found"
```

If the first command is empty, replace `/path/to/your/android-sdk` below with the root of your ARM-compatible SDK:

```bash
export ANDROID_HOME=/path/to/your/android-sdk
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin"
```

To retain these values after restarting Termux, append the same three `export` lines to `~/.bashrc`, then run `source ~/.bashrc`.

> Do not download the normal desktop Android Studio SDK into Termux. Its host executables are commonly built for desktop Linux and will not run on an ARM Android phone. Use an SDK distribution intended for on-device Android development.

## 3. Download and prepare the project

Clone the repository, replacing the URL with this repository's Git URL:

```bash
cd ~
git clone <repository-url> worldfront
cd worldfront
pnpm install --frozen-lockfile
pnpm android:prepare
```

`android:prepare` compiles the web app and copies it into the checked-in Capacitor Android project. You do **not** need to run `cap add android`, because the `android/` project is already included.

Create `android/local.properties` so Gradle can locate the SDK:

```bash
printf 'sdk.dir=%s\n' "$ANDROID_HOME" > android/local.properties
```

## 4. Build the APK

```bash
cd ~/worldfront/android
chmod +x gradlew
./gradlew assembleDebug
```

The first build downloads Gradle and Maven dependencies and therefore requires an internet connection. When it succeeds, the APK is located at:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## 5. Install on the phone

Copy the APK to Android's Downloads directory and open it:

```bash
cd ~/worldfront
cp android/app/build/outputs/apk/debug/app-debug.apk ~/storage/downloads/travel-empire-debug.apk
termux-open ~/storage/downloads/travel-empire-debug.apk
```

Choose **Install** in Android's package installer. If Android blocks the action, enable **Allow from this source** for Termux and retry the `termux-open` command.

## Rebuild after pulling an update

```bash
cd ~/worldfront
git pull
pnpm install --frozen-lockfile
pnpm android:prepare
cd android
./gradlew assembleDebug
cp app/build/outputs/apk/debug/app-debug.apk ~/storage/downloads/travel-empire-debug.apk
termux-open ~/storage/downloads/travel-empire-debug.apk
```

Installing a new debug APK over the previous debug build preserves app data as long as the application ID and signing key remain unchanged. Do not uninstall the existing app if you want to retain its local save.

## Troubleshooting

- **`SDK location not found`**: check that `$ANDROID_HOME` points to the SDK root and rerun the `printf 'sdk.dir=...'` command from step 3.
- **`failed to find target with hash string 'android-35'`**: use the SDK manager supplied with your on-device-compatible SDK to install Android Platform 35.
- **`AAPT2 ... cannot execute` or `Exec format error`**: the SDK contains desktop binaries rather than ARM-compatible Android binaries. Install an on-device-compatible SDK instead.
- **Gradle runs out of memory**: close other applications and add `org.gradle.jvmargs=-Xmx1536m` to `android/gradle.properties`; lower the value on memory-constrained phones.
- **The installer does not open**: confirm `termux-setup-storage` was completed, the APK exists in `~/storage/downloads`, and Termux is allowed to install unknown apps.
