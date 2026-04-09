# Android TV Setup for IPTV Thunder

Ten dokument opisuje jak zbudować i uruchomić aplikację IPTV Thunder na Android TV.

## Wymagania

1. **Android Studio** - do emulacji i debugowania
2. **Java Development Kit (JDK)** - wersja 17 lub nowsza
3. **Android SDK** - API Level 24+ (Android 7.0+)
4. **Rust** - zainstalowany przez `rustup`
5. **Node.js** - wersja 18+

## Konfiguracja środowiska

### 1. Zainstaluj Android SDK przez Android Studio

Otwórz Android Studio → SDK Manager i zainstaluj:
- Android SDK Platform 34 (lub nowsza)
- Android SDK Build-Tools 34
- NDK (Native Development Kit)
- CMake

### 2. Skonfiguruj zmienne środowiskowe

```powershell
# Windows PowerShell
[System.Environment]::SetEnvironmentVariable("ANDROID_HOME", "$env:LocalAppData\Android\Sdk", "User")

# Dodaj do PATH
$oldPath = [System.Environment]::GetEnvironmentVariable("PATH", "User")
$newPath = $oldPath + ";" + "$env:LocalAppData\Android\Sdk\platform-tools"
[System.Environment]::SetEnvironmentVariable("PATH", $newPath, "User")
```

### 3. Zainstaluj targety Rust dla Android

```bash
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
```

## Konfiguracja projektu

Projekt jest już wstępnie skonfigurowany dla Android. Główne ustawienia:
- `tauri.conf.json` - pole `identifier` służy jako nazwa pakietu Android (domyślnie `com.iptv.tauri`)

### Po inicjalizacji projektu Android

Po uruchomieniu `npm run android:init`, ustawienia Android znajdują się w:
- `src-tauri/gen/android/app/build.gradle.kts` - `minSdk`, `targetSdk`, `applicationId`
- `src-tauri/gen/android/app/src/main/AndroidManifest.xml` - uprawnienia i konfiguracja

## Inicjalizacja projektu Android

```bash
# Zainstaluj Tauri CLI
npm install -g @tauri-apps/cli

# Zainicjuj projekt Android (wykonaj raz)
npm run tauri android init
```

## Budowanie aplikacji

### Debug (dla testowania)

```bash
# Uruchom na podłączonym urządzeniu/emulatorze
npm run tauri android dev
```

### Release (dla dystrybucji)

```bash
# Zbuduj APK/AAB
npm run tauri android build
```

## Instalacja na Android TV

### Metoda 1: ADB (Android Debug Bridge)

```bash
# Połącz się z TV (włącz debugowanie USB w ustawieniach TV)
adb connect <ip_address_tv>:5555

# Zainstaluj APK
adb install -r .\src-tauri\gen\android\app\build\outputs\apk\release\app-release.apk

# Lub dla wersji debug
adb install -r .\src-tauri\gen\android\app\build\outputs\apk\debug\app-debug.apk
```

### Metoda 2: Sideloading przez USB

1. Włącz **Unknown Sources** w ustawieniach TV (Security & Restrictions)
2. Skopiuj APK na dysk USB
3. Użyj aplikacji file manager na TV do instalacji

### Metoda 3: Android Studio

1. Podłącz TV przez USB lub sieć (adb)
2. Otwórz projekt w `src-tauri/gen/android`
3. Kliknij "Run" w Android Studio

## Obsługa pilota TV (D-pad)

Aplikacja obsługuje nawigację za pomocą pilota Android TV:

- **Strzałki** - nawigacja między elementami
- **OK/Enter** - wybór elementu
- **Back** - powrót do poprzedniego ekranu
- **Home** - wyjście z aplikacji

Wszystkie interaktywne elementy mają wyróżniony focus (niebieska obwódka).

## Troubleshooting

### Problem: `ANDROID_HOME not set`

Rozwiązanie:
```powershell
$env:ANDROID_HOME = "$env:LocalAppData\Android\Sdk"
```

### Problem: NDK not found

Rozwiązanie:
1. Otwórz Android Studio → SDK Manager
2. Zainstaluj NDK (Side by side)
3. Ustaw `NDK_HOME` lub `ANDROID_NDK_HOME`

### Problem: Rust target not found

Rozwiązanie:
```bash
rustup target add aarch64-linux-android
```

### Problem: Błąd podczas budowania

Sprawdź czy masz zainstalowane wszystkie wymagane pakiety:
```bash
tauri info
```

## Wymagane uprawnienia (AndroidManifest)

Aplikacja automatycznie konfiguruje uprawnienia, ale możesz dostosować w:
`src-tauri/gen/android/app/src/main/AndroidManifest.xml`

Domyślne uprawnienia:
- `INTERNET` - dostęp do sieci
- `ACCESS_NETWORK_STATE` - sprawdzanie stanu sieci

## Konfiguracja TV Banner

Dla Android TV wymagany jest banner (ikona na ekranie głównym TV). 
Pliki ikon są w `src-tauri/icons/` i są automatycznie kopiowane podczas buildu.

Wymagane rozmiary:
- 320x180px (xhdpi) - główny banner TV
- 1280x720px (xxxhdpi) - dla wyższych rozdzielczości

## Testowanie na emulatorze Android TV

1. Otwórz Android Studio → Virtual Device Manager
2. Utwórz nowe urządzenie: TV → 1080p Android TV
3. Wybierz system: Android 12.0 (API 31) z Google TV
4. Uruchom emulator: `npm run tauri android dev`

## Dodatkowe informacje

- [Tauri Mobile Documentation](https://tauri.app/mobile/)
- [Android TV Guidelines](https://developer.android.com/training/tv/start/start)
- [D-pad Navigation](https://developer.android.com/training/tv/start/controllers)
