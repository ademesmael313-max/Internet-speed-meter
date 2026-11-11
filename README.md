# PULSE // NET-METER (Android App + Full-Stack Web Suite)

**PULSE // NET-METER** includes both a **Native Android Studio App (Kotlin + Jetpack Compose)** that compiles into an installable **Android `.apk`** and a **Full-Stack Web Speed & Telemetry Suite**.

---

## 1. Native Android App (`app/` — Android Studio & `.apk`)

Built with **Kotlin 2.0**, **Jetpack Compose (Material 3)**, **OkHttp**, and Android OS **TrafficStats** (`minSdk = 26`, `targetSdk = 35`).

### Android Features
- **Live Status-Bar & Notification Speed Meter (`SpeedMeterService`)**:
  - Samples device-wide network throughput across all apps every second via `android.net.TrafficStats`.
  - Renders a live 2-line speed indicator (`KB/s` & `MB/s`) directly inside the **Android status bar** and lock-screen notification, with a one-tap **Stop Meter** action and optional **Auto-start on boot** (`BootReceiver`).
- **7-Day Wi-Fi vs. Mobile Data Usage Ledger**:
  - Tracks session, daily, and 7-day Wi-Fi vs. cellular byte consumption locally on device.
- **Standalone Multi-Stream Speed Test (`SpeedTestEngine`)**:
  - Works out-of-the-box against **Cloudflare Global Edge** (`speed.cloudflare.com`) or any custom `PULSE // NET-METER` server URL.
  - Measures unloaded ping, RFC-3550 jitter, packet loss, multi-stream download/upload (`1x`–`8x`), loaded latency, and **Bufferbloat Grade (`A`–`F`)** with an animated radial Compose gauge.
- **Android Radio Diagnostics & 20-Packet Sweep**:
  - Inspects `ConnectivityManager`, `NetworkCapabilities`, and `LinkProperties` (Wi-Fi/Cellular/VPN transport, `wlan0`/`rmnet` interface, local IPs, DNS resolvers, link capacity, public IP/ISP) plus a 20-packet latency histogram.

### Build `.apk` in Android Studio or CLI
1. **Android Studio**: Open this repository root folder in Android Studio (Ladybug / Meerkat or newer with JDK 17), wait for Gradle sync, and select **Build → Build Bundle(s) / APK(s) → Build APK(s)** (or press **Run** on a connected phone/emulator).
2. **Command Line**:
   ```bash
   ./gradlew assembleDebug
   # Output APK: app/build/outputs/apk/debug/app-debug.apk
   ```
3. **GitHub Actions Automated APK**: Every push / PR runs `.github/workflows/android-apk.yml` and publishes `pulse-netmeter-debug-apk` (`app-debug.apk`) in the GitHub Actions run artifacts.

---

## 2. Web Application (`src/` + `server/`)

```bash
npm install
npm run dev      # Starts Express binary streaming server + Vite UI on 0.0.0.0:3000
npm test         # Runs Vitest unit & server integration tests
npm run build    # Builds production web bundle
```
