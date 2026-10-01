# ADB Wireless GUI

A small local GUI for pairing and connecting multiple Android phones over wireless ADB.

## Quick Start (One-Click)

You don't need to open Terminal or type `npm start`:

- **Method 1 (Native Mac App):** Double-click **`ADB Wireless.app`** in this folder (you can also drag it to your **Desktop**, **Applications**, or **Dock**).
- **Method 2 (Double-click Script):** Double-click **`start.command`** in this folder.

Both automatically start the background server and open [http://localhost:5151](http://localhost:5151) in your browser.

---

## Manual Terminal Start

```bash
cd "/Users/ashpatel/Documents/adb/adb-wireless-gui"
npm start
```


## Use

### Option 1: Pair with QR Code (Recommended)
1. On your phone, enable `Developer options > Wireless debugging`.
2. In the GUI, click **"Pair with QR Code"**.
3. On your phone, tap **"Pair device with QR code"** and scan the QR code displayed on your screen.
4. The device pairs and connects automatically without typing IP addresses or PINs!

### Option 2: Discovered Wireless Ports (1-Click Connect)
- The GUI auto-detects `adb mdns services` on your local network.
- Click **"Connect"** directly next to any discovered connect port.
- Or click **"Use to Pair"** on a pairing port to auto-fill the form.

### Option 3: Manual Pair & Connect
1. On your phone, tap `Pair device with pairing code`.
2. Put the popup's `IP address & port` into `Pair address`.
3. Put the 6-digit code into `Pairing code` and click `Pair Device`.
4. After pairing, use the normal Wireless debugging `IP address & port` as `Connect address` and click `Connect`.

---

## Device Controls & Features

Once connected, each device card includes:

- **🪞 Screen Mirroring (`scrcpy`):** Low-latency, interactive screen mirroring with full mouse & keyboard touch controls (powered by `scrcpy`).
- **📸 Screenshot:** 1-click screen capture with preview popup & instant PNG download.
- **🔋 Battery Info:** Real-time battery %, charging state, temperature, and voltage.
- **ℹ️ Device Specs:** Display resolution, screen DPI, Android OS version, brand & model.
- **⌨️ Type Text:** Send text, long strings, or URLs directly into the phone's focused input.
- **📱 Remote Keys:** Wake, Power/Lock, Home, Back, Recent Apps, Volume (+/-), and Reboot.
- **📦 APK Installer:** Install local `.apk` files directly to the selected device.


