const state = {
  devices: [],
  mdns: [],
  logCount: 0
};

// DOM references
const output = document.querySelector("#output");
const outputPanel = document.querySelector("#outputPanel");
const toggleLogsBtn = document.querySelector("#toggleLogsBtn");
const hideOutputBtn = document.querySelector("#hideOutputBtn");
const clearOutputBtn = document.querySelector("#clearOutputBtn");
const logBadge = document.querySelector("#logBadge");
const adbStatusPill = document.querySelector("#adbStatusPill");

const selectedDevice = document.querySelector("#selectedDevice");
const pairAddress = document.querySelector("#pairAddress");
const pairCode = document.querySelector("#pairCode");
const connectAddress = document.querySelector("#connectAddress");
const formStorageKey = "adb-wireless-gui-device-form";

const manualToggleBtn = document.querySelector("#manualToggleBtn");
const manualBody = document.querySelector("#manualBody");

const toastContainer = document.querySelector("#toastContainer");

// QR elements
const qrModal = document.querySelector("#qrModal");
const openQrModalBtn = document.querySelector("#openQrModalBtn");
const closeQrModalBtn = document.querySelector("#closeQrModalBtn");
const doneQrBtn = document.querySelector("#doneQrBtn");
const regenerateQrBtn = document.querySelector("#regenerateQrBtn");
const qrCodeContainer = document.querySelector("#qrCodeContainer");
const qrStatusBadge = document.querySelector("#qrStatusBadge");
const qrStatusText = document.querySelector("#qrStatusText");
const qrServiceName = document.querySelector("#qrServiceName");
const qrPassword = document.querySelector("#qrPassword");

let qrPollTimer = null;
let currentQrSessionId = null;

// Toast Notifications
function showToast(message, type = "info") {
  if (!toastContainer) return;
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px)";
    toast.style.transition = "all 0.2s ease";
    setTimeout(() => toast.remove(), 250);
  }, 3500);
}

// Activity Logging
function writeOutput(title, payload) {
  const stamp = new Date().toLocaleTimeString();
  const text = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  output.textContent = `[${stamp}] ${title}\n${text}\n\n${output.textContent}`;
  state.logCount++;
  if (logBadge) logBadge.textContent = String(state.logCount);
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const json = await response.json();
  if (!response.ok) throw json;
  return json;
}

// Device Form Persistence
function loadDeviceForm() {
  const savedForm = JSON.parse(localStorage.getItem(formStorageKey) || "{}");
  if (pairAddress) pairAddress.value = savedForm.pairAddress || "";
  if (connectAddress) connectAddress.value = savedForm.connectAddress || "";

  [pairAddress, connectAddress].forEach((input) => {
    if (input) input.addEventListener("input", saveDeviceForm);
  });
}

function saveDeviceForm() {
  localStorage.setItem(formStorageKey, JSON.stringify({
    pairAddress: pairAddress ? pairAddress.value.trim() : "",
    connectAddress: connectAddress ? connectAddress.value.trim() : ""
  }));
}

function clearDeviceForm() {
  if (pairAddress) pairAddress.value = "";
  if (pairCode) pairCode.value = "";
  if (connectAddress) connectAddress.value = "";
  saveDeviceForm();
  showToast("Manual form cleared", "info");
}

// Friendly Device Details Parser
function parseDeviceDetails(detailsStr) {
  if (!detailsStr) return { friendlyName: "Android Device", extra: "" };
  const parts = detailsStr.split(/\s+/);
  let model = "";
  let product = "";

  parts.forEach((part) => {
    if (part.startsWith("model:")) model = part.replace("model:", "").replace(/_/g, " ");
    if (part.startsWith("product:")) product = part.replace("product:", "").replace(/_/g, " ");
  });

  const friendlyName = model || product || "Android Device";
  return { friendlyName, extra: detailsStr };
}

// Render Connected Devices
function renderDevices() {
  const list = document.querySelector("#deviceList");
  const count = document.querySelector("#deviceCount");
  if (count) {
    count.textContent = `${state.devices.length} ${state.devices.length === 1 ? "device" : "devices"}`;
  }

  if (!state.devices.length) {
    list.className = "device-list empty";
    list.innerHTML = "No devices connected yet. Scan a QR code or connect above.";
  } else {
    list.className = "device-list";
    list.innerHTML = state.devices.map((device) => {
      const { friendlyName } = parseDeviceDetails(device.details);
      const isOnline = device.state === "device";

      return `
        <div class="device-card">
          <div class="device-card-header">
            <div class="device-identity">
              <div class="device-avatar">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
                  <line x1="12" y1="18" x2="12.01" y2="18"></line>
                </svg>
              </div>
              <div>
                <div class="device-name-row">
                  <strong class="device-name">${friendlyName}</strong>
                  <span class="status-badge ${isOnline ? "online" : "offline"}">
                    <span class="dot"></span> ${device.state}
                  </span>
                </div>
                <div class="device-details-text">
                  <code>${device.serial}</code>
                  ${device.details ? `<span>· ${device.details}</span>` : ""}
                </div>
              </div>
            </div>
            <div class="device-top-actions">
              <button class="btn btn-ghost-danger btn-small device-disconnect-btn" data-serial="${device.serial}" title="Disconnect Device">
                Disconnect
              </button>
            </div>
          </div>

          <!-- Primary Tools Row: Mirror, Screenshot, Battery, Specs, Type Text -->
          <div class="device-actions-row">
            <button class="btn btn-mirror btn-small inline-cmd" data-serial="${device.serial}" data-command="mirror" title="Mirror device screen with mouse & keyboard control">
              🪞 Mirror Screen
            </button>
            <button class="btn btn-action-primary btn-small inline-cmd" data-serial="${device.serial}" data-command="screenshot" title="Capture and download screenshot">
              📸 Screenshot
            </button>
            <button class="btn btn-ghost btn-small inline-cmd" data-serial="${device.serial}" data-command="battery" title="Check battery level & health">
              🔋 Battery
            </button>
            <button class="btn btn-ghost btn-small inline-cmd" data-serial="${device.serial}" data-command="device_info" title="View display resolution, Android OS version & specs">
              ℹ️ Specs
            </button>
            <button class="btn btn-ghost btn-small inline-cmd" data-serial="${device.serial}" data-command="input_text_prompt" title="Type text or URL into phone">
              ⌨️ Type Text
            </button>
          </div>

          <!-- Secondary Navigation & Power Controls -->
          <div class="device-sub-actions">
            <span class="quick-label">Remote:</span>
            <button class="btn btn-ghost btn-small inline-cmd" data-serial="${device.serial}" data-command="wake" title="Wake screen">⚡ Wake</button>
            <button class="btn btn-ghost btn-small inline-cmd" data-serial="${device.serial}" data-command="power" title="Lock / Power">🔒 Lock</button>
            <button class="btn btn-ghost btn-small inline-cmd" data-serial="${device.serial}" data-command="home" title="Go Home">🏠 Home</button>
            <button class="btn btn-ghost btn-small inline-cmd" data-serial="${device.serial}" data-command="back" title="Press Back">◀ Back</button>
            <button class="btn btn-ghost btn-small inline-cmd" data-serial="${device.serial}" data-command="recents" title="Recent Apps Switcher">🔲 Recents</button>
            <button class="btn btn-ghost btn-small inline-cmd" data-serial="${device.serial}" data-command="vol_up" title="Volume Up">🔊 Vol+</button>
            <button class="btn btn-ghost btn-small inline-cmd" data-serial="${device.serial}" data-command="vol_down" title="Volume Down">🔉 Vol-</button>
            <button class="btn btn-ghost btn-small inline-cmd" data-serial="${device.serial}" data-command="packages" title="List 3rd-party packages">📋 Apps</button>
            <button class="btn btn-ghost-danger btn-small inline-cmd" data-serial="${device.serial}" data-command="reboot" title="Reboot Device">🔄 Reboot</button>
          </div>
        </div>
      `;
    }).join("");

    // Attach inline control handlers
    list.querySelectorAll(".inline-cmd").forEach((btn) => {
      btn.addEventListener("click", () => {
        runDeviceCommand(btn.dataset.command, btn.dataset.serial);
      });
    });

    list.querySelectorAll(".device-disconnect-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        disconnect(btn.dataset.serial);
      });
    });
  }

  // Update target device select in APK box
  const current = selectedDevice.value;
  selectedDevice.innerHTML = state.devices.length
    ? state.devices.map((device) => {
        const { friendlyName } = parseDeviceDetails(device.details);
        return `<option value="${device.serial}">${friendlyName} (${device.serial})</option>`;
      }).join("")
    : "<option value=\"\">No connected device</option>";

  if (state.devices.some((device) => device.serial === current)) {
    selectedDevice.value = current;
  }
}

// Render Discovered mDNS Ports
function renderMdns() {
  const list = document.querySelector("#mdnsList");
  const countPill = document.querySelector("#mdnsCount");
  if (!list) return;

  if (countPill) {
    countPill.textContent = state.mdns.length ? `${state.mdns.length} found` : "mDNS";
  }

  if (!state.mdns.length) {
    list.className = "mdns-list empty";
    list.textContent = "No wireless ADB services found on this network.";
    return;
  }

  list.className = "mdns-list";
  list.innerHTML = state.mdns.map((item) => {
    const isConnected = state.devices.some((device) => device.serial === item.address);
    const isConnectPort = item.purpose === "connect";

    let actionButtons = "";
    if (isConnectPort) {
      if (isConnected) {
        actionButtons = `
          <span class="status-badge online"><span class="dot"></span> Connected</span>
          <button class="btn btn-ghost-danger btn-small mdns-disconnect-btn" data-address="${item.address}">Disconnect</button>
        `;
      } else {
        actionButtons = `
          <button class="btn btn-primary btn-small mdns-connect-btn" data-address="${item.address}">Connect</button>
        `;
      }
    } else {
      actionButtons = `
        <button class="btn btn-secondary btn-small mdns-pair-btn" data-address="${item.address}">Use to Pair</button>
      `;
    }

    return `
      <div class="mdns-card">
        <div class="mdns-info" data-address="${item.address}" title="Click to copy address">
          <strong>${item.address}</strong>
          <div class="mdns-meta">
            <span class="badge-tag ${item.purpose}">${item.purpose}</span>
            <span>${item.type}</span>
          </div>
        </div>
        <div class="mdns-actions">
          ${actionButtons}
          <button class="btn btn-ghost btn-small mdns-copy-btn" data-address="${item.address}" title="Copy Address">Copy</button>
        </div>
      </div>
    `;
  }).join("");

  // Copy on click
  list.querySelectorAll(".mdns-info, .mdns-copy-btn").forEach((elem) => {
    elem.addEventListener("click", (e) => {
      e.stopPropagation();
      const address = elem.dataset.address;
      if (address) {
        navigator.clipboard.writeText(address).catch(() => {});
        showToast(`Copied: ${address}`, "info");
        writeOutput("Copied address", address);
      }
    });
  });

  // Direct connect
  list.querySelectorAll(".mdns-connect-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const address = btn.dataset.address;
      btn.disabled = true;
      btn.textContent = "Connecting...";
      await connect(address);
    });
  });

  // Direct disconnect
  list.querySelectorAll(".mdns-disconnect-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const address = btn.dataset.address;
      btn.disabled = true;
      btn.textContent = "Disconnecting...";
      await disconnect(address);
    });
  });

  // Pair fill
  list.querySelectorAll(".mdns-pair-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const address = btn.dataset.address;
      if (pairAddress) pairAddress.value = address;
      saveDeviceForm();
      if (manualBody && manualBody.classList.contains("collapsed")) {
        manualBody.classList.remove("collapsed");
        manualToggleBtn.setAttribute("aria-expanded", "true");
      }
      if (pairCode) pairCode.focus();
      showToast(`Selected pairing address: ${address}`, "info");
      writeOutput("Selected pairing address", `${address} (Now enter 6-digit code)`);
    });
  });
}

// Refresh status
async function refresh() {
  try {
    const data = await request("/api/status");
    state.devices = data.devices || [];
    state.mdns = data.mdns || [];
    renderDevices();
    renderMdns();
    if (adbStatusPill) {
      adbStatusPill.className = "status-badge online";
      adbStatusPill.innerHTML = '<span class="dot"></span> Online';
    }
    writeOutput("Refreshed ADB status", {
      devices: state.devices.length,
      mdnsPorts: state.mdns.length
    });
  } catch (error) {
    if (adbStatusPill) {
      adbStatusPill.className = "status-badge offline";
      adbStatusPill.innerHTML = '<span class="dot"></span> Offline';
    }
    showToast("Failed to refresh status", "error");
    writeOutput("Refresh failed", error);
  }
}

// Manual Pair
async function pair() {
  const address = pairAddress ? pairAddress.value.trim() : "";
  const code = pairCode ? pairCode.value.trim() : "";
  if (!address || !code) {
    showToast("Please enter both Pair Address and 6-digit PIN", "error");
    return;
  }
  try {
    const data = await request("/api/pair", {
      method: "POST",
      body: JSON.stringify({ address, code })
    });
    if (pairCode) pairCode.value = "";
    saveDeviceForm();
    showToast("Device paired successfully! Now click Connect.", "success");
    writeOutput("Pair Device", data);
    await refresh();
  } catch (error) {
    const errText = error.error || error.stderr || error.message || "Pairing failed";
    showToast(errText, "error");
    writeOutput("Pair Device failed", error);
  }
}

// Connect
async function connect(targetAddress) {
  const address = (typeof targetAddress === "string" && targetAddress)
    ? targetAddress.trim()
    : (connectAddress ? connectAddress.value.trim() : "");

  if (!address) {
    showToast("Please provide a connect address (IP:PORT)", "error");
    return;
  }

  if (connectAddress) connectAddress.value = address;
  saveDeviceForm();

  try {
    const data = await request("/api/connect", {
      method: "POST",
      body: JSON.stringify({ address })
    });
    showToast(`Connected to ${address}!`, "success");
    writeOutput("Connect Device", data);
    await refresh();
  } catch (error) {
    const errText = error.error || error.stderr || error.message || "Connection failed";
    showToast(errText, "error");
    writeOutput("Connect Device failed", error);
  }
}

// Disconnect
async function disconnect(targetAddress) {
  const address = (typeof targetAddress === "string" && targetAddress)
    ? targetAddress.trim()
    : (connectAddress ? connectAddress.value.trim() : "");

  try {
    const data = await request("/api/disconnect", {
      method: "POST",
      body: JSON.stringify({ address })
    });
    showToast(`Disconnected ${address || "all devices"}`, "info");
    writeOutput("Disconnect Device", data);
    await refresh();
  } catch (error) {
    showToast("Disconnect failed", "error");
    writeOutput("Disconnect Device failed", error);
  }
}

let activeInputTextSerial = null;

// Modal references
const screenshotModal = document.querySelector("#screenshotModal");
const screenshotImg = document.querySelector("#screenshotImg");
const downloadScreenshotBtn = document.querySelector("#downloadScreenshotBtn");
const closeScreenshotModalBtn = document.querySelector("#closeScreenshotModalBtn");
const doneScreenshotBtn = document.querySelector("#doneScreenshotBtn");

const inputTextModal = document.querySelector("#inputTextModal");
const textToPhone = document.querySelector("#textToPhone");
const sendTextBtn = document.querySelector("#sendTextBtn");
const cancelTextBtn = document.querySelector("#cancelTextBtn");
const closeInputTextModalBtn = document.querySelector("#closeInputTextModalBtn");

const infoModal = document.querySelector("#infoModal");
const infoContent = document.querySelector("#infoContent");
const infoModalTitle = document.querySelector("#infoModalTitle");
const closeInfoModalBtn = document.querySelector("#closeInfoModalBtn");
const doneInfoBtn = document.querySelector("#doneInfoBtn");

// Device Commands Handler
async function runDeviceCommand(command, targetSerial) {
  const serial = targetSerial || (selectedDevice ? selectedDevice.value : "");
  if (!serial) {
    showToast("No device selected", "error");
    return;
  }

  // Handle Input Text Prompt
  if (command === "input_text_prompt") {
    activeInputTextSerial = serial;
    if (textToPhone) textToPhone.value = "";
    if (inputTextModal) inputTextModal.classList.remove("hidden");
    if (textToPhone) setTimeout(() => textToPhone.focus(), 100);
    return;
  }

  // Handle Mirror Screen
  if (command === "mirror") {
    showToast("Launching Screen Mirror (scrcpy)...", "info");
    try {
      const data = await request("/api/device-command", {
        method: "POST",
        body: JSON.stringify({ serial, command: "mirror" })
      });
      showToast("Screen mirror window active!", "success");
      writeOutput("Screen Mirror", data);
    } catch (error) {
      const msg = error.error || error.message || "Failed to launch scrcpy";
      showToast(msg, "error");
      writeOutput("Mirror Failed", error);
    }
    return;
  }

  // Handle Screenshot
  if (command === "screenshot") {
    showToast("Capturing device screenshot...", "info");
    try {
      const data = await request("/api/device-command", {
        method: "POST",
        body: JSON.stringify({ serial, command: "screenshot" })
      });
      if (data.ok && data.image) {
        if (screenshotImg) screenshotImg.src = data.image;
        if (downloadScreenshotBtn) {
          downloadScreenshotBtn.href = data.image;
          downloadScreenshotBtn.download = `screenshot_${serial.replace(/[:.]/g, "_")}_${Date.now()}.png`;
        }
        if (screenshotModal) screenshotModal.classList.remove("hidden");
        showToast("Screenshot captured!", "success");
        writeOutput("Screenshot", `Captured ${(data.sizeBytes / 1024).toFixed(1)} KB image`);
      }
    } catch (error) {
      showToast(error.error || "Failed to capture screenshot", "error");
      writeOutput("Screenshot Failed", error);
    }
    return;
  }

  // Handle Battery
  if (command === "battery") {
    showToast("Checking battery status...", "info");
    try {
      const data = await request("/api/device-command", {
        method: "POST",
        body: JSON.stringify({ serial, command: "battery" })
      });
      showToast(`Battery: ${data.level} (${data.status}) · ${data.temperature} · ${data.voltage}`, "success");
      writeOutput("Battery Status", data);
    } catch (error) {
      showToast("Failed to read battery", "error");
      writeOutput("Battery Error", error);
    }
    return;
  }

  // Handle Device Info
  if (command === "device_info") {
    showToast("Loading device specifications...", "info");
    try {
      const data = await request("/api/device-command", {
        method: "POST",
        body: JSON.stringify({ serial, command: "device_info" })
      });
      if (infoModalTitle) infoModalTitle.textContent = `${data.brand} ${data.model} Specs`;
      if (infoContent) {
        infoContent.innerHTML = `
          <div class="info-item"><span>Brand & Model</span><strong>${data.brand} ${data.model}</strong></div>
          <div class="info-item"><span>Android Version</span><strong>Android ${data.androidVersion}</strong></div>
          <div class="info-item"><span>Display Resolution</span><strong>${data.resolution}</strong></div>
          <div class="info-item"><span>Screen Density</span><strong>${data.density} dpi</strong></div>
          <div class="info-item"><span>Serial / Address</span><strong>${serial}</strong></div>
        `;
      }
      if (infoModal) infoModal.classList.remove("hidden");
      writeOutput("Device Specs", data);
    } catch (error) {
      showToast("Failed to read device specs", "error");
      writeOutput("Device Specs Error", error);
    }
    return;
  }

  // Reboot Confirmation
  if (command === "reboot") {
    if (!confirm(`Are you sure you want to reboot device ${serial}?`)) return;
  }

  // Generic key/command execution
  try {
    const data = await request("/api/device-command", {
      method: "POST",
      body: JSON.stringify({ serial, command })
    });
    showToast(`Executed: ${command}`, "success");
    writeOutput(`Command: ${command}`, data);
  } catch (error) {
    showToast(`Command ${command} failed`, "error");
    writeOutput(`Command failed: ${command}`, error);
  }
}

// Screenshot Modal Close
if (closeScreenshotModalBtn) closeScreenshotModalBtn.addEventListener("click", () => screenshotModal.classList.add("hidden"));
if (doneScreenshotBtn) doneScreenshotBtn.addEventListener("click", () => screenshotModal.classList.add("hidden"));
if (screenshotModal) screenshotModal.addEventListener("click", (e) => { if (e.target === screenshotModal) screenshotModal.classList.add("hidden"); });

// Input Text Modal Events
if (closeInputTextModalBtn) closeInputTextModalBtn.addEventListener("click", () => inputTextModal.classList.add("hidden"));
if (cancelTextBtn) cancelTextBtn.addEventListener("click", () => inputTextModal.classList.add("hidden"));
if (inputTextModal) inputTextModal.addEventListener("click", (e) => { if (e.target === inputTextModal) inputTextModal.classList.add("hidden"); });

if (sendTextBtn) {
  sendTextBtn.addEventListener("click", async () => {
    const text = textToPhone ? textToPhone.value : "";
    if (!text) {
      showToast("Please enter some text", "error");
      return;
    }
    try {
      await request("/api/device-command", {
        method: "POST",
        body: JSON.stringify({ serial: activeInputTextSerial, command: "input_text", text })
      });
      showToast("Text sent to phone!", "success");
      writeOutput("Sent Text to Device", text);
      if (inputTextModal) inputTextModal.classList.add("hidden");
    } catch (error) {
      showToast("Failed to send text", "error");
      writeOutput("Send Text Failed", error);
    }
  });
}

if (textToPhone) {
  textToPhone.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (sendTextBtn) sendTextBtn.click();
    }
  });
}

// Info Modal Close
if (closeInfoModalBtn) closeInfoModalBtn.addEventListener("click", () => infoModal.classList.add("hidden"));
if (doneInfoBtn) doneInfoBtn.addEventListener("click", () => infoModal.classList.add("hidden"));
if (infoModal) infoModal.addEventListener("click", (e) => { if (e.target === infoModal) infoModal.classList.add("hidden"); });

// APK Install
if (document.querySelector("#installBtn")) {
  document.querySelector("#installBtn").addEventListener("click", async () => {
    const serial = selectedDevice ? selectedDevice.value : "";
    const apkPath = document.querySelector("#apkPath") ? document.querySelector("#apkPath").value.trim() : "";
    if (!serial) {
      showToast("Please select a target device", "error");
      return;
    }
    if (!apkPath) {
      showToast("Please enter an APK file path", "error");
      return;
    }

    showToast("Installing APK...", "info");
    try {
      const data = await request("/api/install", {
        method: "POST",
        body: JSON.stringify({ serial, apkPath })
      });
      showToast("APK installed successfully!", "success");
      writeOutput("Install APK", data);
      await refresh();
    } catch (error) {
      showToast("APK installation failed", "error");
      writeOutput("Install APK failed", error);
    }
  });
}

// QR Code Pairing
function renderQrCode(text) {
  if (!qrCodeContainer) return;
  qrCodeContainer.innerHTML = "";
  if (typeof QRCode !== "undefined") {
    new QRCode(qrCodeContainer, {
      text,
      width: 210,
      height: 210,
      colorDark: "#0f172a",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel ? QRCode.CorrectLevel.M : 0
    });
  } else {
    const img = document.createElement("img");
    img.src = `https://api.qrserver.com/v1/create-qr-code/?size=210x210&data=${encodeURIComponent(text)}`;
    img.alt = "Pairing QR Code";
    qrCodeContainer.appendChild(img);
  }
}

async function startQrPairing() {
  if (qrPollTimer) {
    clearInterval(qrPollTimer);
    qrPollTimer = null;
  }

  qrStatusBadge.className = "status-pill waiting";
  qrStatusBadge.textContent = "Generating QR...";
  qrStatusText.textContent = "Starting pairing session...";
  qrCodeContainer.innerHTML = "<div style='color:var(--text-muted); font-size:13px;'>Generating QR code...</div>";

  try {
    const data = await request("/api/qr-pair/start", { method: "POST" });
    if (!data.ok || !data.session) throw new Error("Failed to start QR session");

    const session = data.session;
    currentQrSessionId = session.id;

    renderQrCode(session.qrString);
    if (qrServiceName) qrServiceName.textContent = session.serviceName;
    if (qrPassword) qrPassword.textContent = session.password;

    qrStatusBadge.className = "status-pill waiting";
    qrStatusBadge.textContent = "Waiting for scan";
    qrStatusText.textContent = "Scan this QR code from your phone's Wireless debugging menu.";

    writeOutput("QR Pairing Started", {
      serviceName: session.serviceName,
      code: session.password
    });

    qrPollTimer = setInterval(pollQrStatus, 1500);
  } catch (error) {
    qrStatusBadge.className = "status-pill error";
    qrStatusBadge.textContent = "Failed to start";
    qrStatusText.textContent = typeof error === "string" ? error : (error.error || error.message || "Error starting session");
    writeOutput("QR Pairing Error", error);
  }
}

async function pollQrStatus() {
  if (!currentQrSessionId) return;

  try {
    const data = await request(`/api/qr-pair/status?id=${currentQrSessionId}`);
    if (!data.ok || !data.session) return;

    const session = data.session;
    if (qrStatusText) qrStatusText.textContent = session.message;

    if (session.status === "waiting") {
      qrStatusBadge.className = "status-pill waiting";
      qrStatusBadge.textContent = "Waiting for scan";
    } else if (session.status === "pairing") {
      qrStatusBadge.className = "status-pill pairing";
      qrStatusBadge.textContent = "Pairing...";
    } else if (session.status === "paired" || session.status === "connected") {
      qrStatusBadge.className = "status-pill connected";
      qrStatusBadge.textContent = session.status === "connected" ? "Connected!" : "Paired!";
      clearInterval(qrPollTimer);
      qrPollTimer = null;

      if (session.connectAddress && connectAddress) {
        connectAddress.value = session.connectAddress;
        saveDeviceForm();
      }

      showToast("Phone paired & connected successfully!", "success");
      writeOutput("QR Pairing Success", session.message);
      await refresh();
    } else if (session.status === "error" || session.status === "timeout" || session.status === "cancelled") {
      qrStatusBadge.className = "status-pill error";
      qrStatusBadge.textContent = session.status === "timeout" ? "Timed out" : "Failed";
      clearInterval(qrPollTimer);
      qrPollTimer = null;
      writeOutput("QR Pairing Ended", session.message);
    }
  } catch {
    // transient network error
  }
}

async function closeQrModal() {
  if (qrPollTimer) {
    clearInterval(qrPollTimer);
    qrPollTimer = null;
  }
  try {
    await request("/api/qr-pair/cancel", { method: "POST" });
  } catch {}
  if (qrModal) qrModal.classList.add("hidden");
}

function openQrModal() {
  if (qrModal) {
    qrModal.classList.remove("hidden");
    startQrPairing();
  }
}

// Collapsible Accordion Setup
if (manualToggleBtn && manualBody) {
  manualToggleBtn.addEventListener("click", () => {
    const isCollapsed = manualBody.classList.contains("collapsed");
    if (isCollapsed) {
      manualBody.classList.remove("collapsed");
      manualToggleBtn.setAttribute("aria-expanded", "true");
    } else {
      manualBody.classList.add("collapsed");
      manualToggleBtn.setAttribute("aria-expanded", "false");
    }
  });
}

// Console Panel Toggle
if (toggleLogsBtn && outputPanel) {
  toggleLogsBtn.addEventListener("click", () => {
    outputPanel.classList.toggle("collapsed");
    if (!outputPanel.classList.contains("collapsed")) {
      outputPanel.scrollIntoView({ behavior: "smooth" });
    }
  });
}

if (hideOutputBtn && outputPanel) {
  hideOutputBtn.addEventListener("click", () => {
    outputPanel.classList.add("collapsed");
  });
}

if (clearOutputBtn) {
  clearOutputBtn.addEventListener("click", () => {
    output.textContent = "Ready.";
    state.logCount = 0;
    if (logBadge) logBadge.textContent = "0";
  });
}

// Top Bar Action Listeners
if (document.querySelector("#refreshBtn")) {
  document.querySelector("#refreshBtn").addEventListener("click", () => {
    refresh();
    showToast("Status refreshed", "info");
  });
}

if (document.querySelector("#restartBtn")) {
  document.querySelector("#restartBtn").addEventListener("click", async () => {
    try {
      showToast("Restarting ADB server...", "info");
      const data = await request("/api/restart", { method: "POST", body: "{}" });
      showToast("ADB server restarted", "success");
      writeOutput("Restarted ADB server", data);
      await refresh();
    } catch (error) {
      showToast("Failed to restart ADB", "error");
      writeOutput("Restart ADB failed", error);
    }
  });
}

// Manual form buttons
if (document.querySelector("#pairBtn")) {
  document.querySelector("#pairBtn").addEventListener("click", pair);
}
if (document.querySelector("#connectBtn")) {
  document.querySelector("#connectBtn").addEventListener("click", () => connect());
}
if (document.querySelector("#disconnectBtn")) {
  document.querySelector("#disconnectBtn").addEventListener("click", () => disconnect());
}
if (document.querySelector("#clearDeviceFormBtn")) {
  document.querySelector("#clearDeviceFormBtn").addEventListener("click", clearDeviceForm);
}

// QR Modal button bindings
if (openQrModalBtn) openQrModalBtn.addEventListener("click", openQrModal);
if (closeQrModalBtn) closeQrModalBtn.addEventListener("click", closeQrModal);
if (doneQrBtn) doneQrBtn.addEventListener("click", closeQrModal);
if (regenerateQrBtn) regenerateQrBtn.addEventListener("click", startQrPairing);

if (qrModal) {
  qrModal.addEventListener("click", (e) => {
    if (e.target === qrModal) closeQrModal();
  });
}

// Initialize
loadDeviceForm();
refresh();
