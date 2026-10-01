const http = require("http");
const fs = require("fs");
const path = require("path");
const { execFile, spawn } = require("child_process");

const PORT = Number(process.env.PORT || 5151);
const PUBLIC_DIR = path.join(__dirname, "public");
const ADB = process.env.ADB_PATH || "adb";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function runAdb(args, options = {}) {
  return new Promise((resolve) => {
    execFile(ADB, args, { timeout: options.timeout || 20000 }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        code: error && typeof error.code === "number" ? error.code : 0,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        command: `adb ${args.map((arg) => (/\s/.test(arg) ? JSON.stringify(arg) : arg)).join(" ")}`
      });
    });
  });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 2_000_000) {
        req.destroy();
        reject(new Error("Request body is too large."));
      }
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload, null, 2));
}

function isHostPort(value) {
  return typeof value === "string" && /^[a-zA-Z0-9._:-]+:\d{2,5}$/.test(value.trim());
}

function isSafeSerial(value) {
  return typeof value === "string" && /^[a-zA-Z0-9._:-]+$/.test(value.trim());
}

function isSafeApkPath(value) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().endsWith(".apk");
}

function parseDevices(output) {
  return output
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [serial, state, ...details] = line.split(/\s+/);
      return { serial, state, details: details.join(" ") };
    });
}

function parseMdns(output) {
  return output
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s+/);
      return {
        name: parts[0] || "",
        type: parts[1] || "",
        address: parts[2] || "",
        purpose: (parts[1] || "").includes("pairing") ? "pairing" : "connect"
      };
    });
}

let qrPairSession = null;

function generateRandomSuffix(len = 10) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let str = "";
  for (let i = 0; i < len; i++) {
    str += chars[Math.floor(Math.random() * chars.length)];
  }
  return str;
}

function startQrPairSession() {
  if (qrPairSession) {
    qrPairSession.active = false;
  }

  const serviceName = `studio-${generateRandomSuffix(10)}`;
  const password = String(Math.floor(100000 + Math.random() * 900000));
  const qrString = `WIFI:T:ADB;S:${serviceName};P:${password};;`;

  qrPairSession = {
    id: Date.now().toString(),
    serviceName,
    password,
    qrString,
    status: "waiting",
    message: "Waiting for phone to scan QR code...",
    address: null,
    connectAddress: null,
    startTime: Date.now(),
    active: true
  };

  runQrPairPolling(qrPairSession);
  return qrPairSession;
}

async function runQrPairPolling(session) {
  const maxWaitMs = 120000;
  const intervalMs = 1200;

  while (session.active && (Date.now() - session.startTime < maxWaitMs)) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    if (!session.active) break;

    try {
      const mdnsRes = await runAdb(["mdns", "services"]);
      if (!session.active) break;

      const services = parseMdns(mdnsRes.stdout || "");
      const match = services.find(
        (s) => s.name === session.serviceName && s.purpose === "pairing" && s.address
      );

      if (match) {
        session.status = "pairing";
        session.address = match.address;
        session.message = `Phone scanned! Pairing with ${match.address}...`;

        const pairChild = execFile(ADB, ["pair", match.address.trim()], { timeout: 30000 }, async (error, stdout, stderr) => {
          const out = `${stdout || ""} ${stderr || ""}`.toLowerCase();
          const ok = !error || out.includes("successfully paired") || out.includes("already paired");

          if (!ok) {
            session.status = "error";
            session.message = `Pairing failed: ${(stderr || stdout || "Unknown error").trim()}`;
            session.active = false;
            return;
          }

          session.status = "paired";
          session.message = `Pairing successful! Connecting to device...`;

          await new Promise((r) => setTimeout(r, 1500));
          if (!session.active) return;

          const [ip] = match.address.split(":");
          const updatedMdns = await runAdb(["mdns", "services"]);
          const updatedServices = parseMdns(updatedMdns.stdout || "");
          const connectService = updatedServices.find(
            (s) => s.purpose === "connect" && s.address && s.address.startsWith(`${ip}:`)
          );

          if (connectService) {
            await runAdb(["connect", connectService.address]);
            session.status = "connected";
            session.connectAddress = connectService.address;
            session.message = `Successfully paired and connected to ${connectService.address}!`;
          } else {
            const devRes = await runAdb(["devices", "-l"]);
            const devices = parseDevices(devRes.stdout || "");
            const connectedDevice = devices.find((d) => d.serial.startsWith(`${ip}:`));
            if (connectedDevice) {
              session.status = "connected";
              session.connectAddress = connectedDevice.serial;
              session.message = `Successfully paired and connected to ${connectedDevice.serial}!`;
            } else {
              session.status = "paired";
              session.message = `Successfully paired with ${match.address}! You can now connect.`;
            }
          }
          session.active = false;
        });

        pairChild.stdin.write(`${session.password}\n`);
        pairChild.stdin.end();
        break;
      }
    } catch {
      // keep polling
    }
  }

  if (session.active && (Date.now() - session.startTime >= maxWaitMs)) {
    session.status = "timeout";
    session.message = "Pairing timed out. Please click Regenerate to try again.";
    session.active = false;
  }
}

async function handleApi(req, res) {
  try {
    if (req.method === "GET" && req.url === "/api/status") {
      const [version, devices, mdns] = await Promise.all([
        runAdb(["version"]),
        runAdb(["devices", "-l"]),
        runAdb(["mdns", "services"])
      ]);

      return sendJson(res, 200, {
        adbVersion: version.stdout || version.stderr,
        devices: parseDevices(devices.stdout),
        mdns: parseMdns(mdns.stdout),
        raw: {
          devices,
          mdns
        }
      });
    }

    if (req.method === "POST" && req.url === "/api/qr-pair/start") {
      const session = startQrPairSession();
      return sendJson(res, 200, {
        ok: true,
        session: {
          id: session.id,
          serviceName: session.serviceName,
          password: session.password,
          qrString: session.qrString,
          status: session.status,
          message: session.message
        }
      });
    }

    if (req.method === "GET" && req.url.startsWith("/api/qr-pair/status")) {
      if (!qrPairSession) {
        return sendJson(res, 200, { ok: false, status: "idle", message: "No active pairing session." });
      }
      return sendJson(res, 200, {
        ok: true,
        session: {
          id: qrPairSession.id,
          serviceName: qrPairSession.serviceName,
          password: qrPairSession.password,
          status: qrPairSession.status,
          message: qrPairSession.message,
          address: qrPairSession.address,
          connectAddress: qrPairSession.connectAddress,
          active: qrPairSession.active
        }
      });
    }

    if (req.method === "POST" && req.url === "/api/qr-pair/cancel") {
      if (qrPairSession) {
        qrPairSession.active = false;
        qrPairSession.status = "cancelled";
        qrPairSession.message = "Pairing cancelled.";
      }
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === "POST" && req.url === "/api/pair") {
      const body = await parseBody(req);
      if (!isHostPort(body.address) || !/^\d{6}$/.test(String(body.code || ""))) {
        return sendJson(res, 400, { ok: false, error: "Use address as IP:PAIRING_PORT and a 6-digit pairing code." });
      }

      const child = execFile(ADB, ["pair", body.address.trim()], { timeout: 30000 }, (error, stdout, stderr) => {
        sendJson(res, error ? 500 : 200, {
          ok: !error,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          command: `adb pair ${body.address.trim()}`
        });
      });
      child.stdin.write(`${body.code}\n`);
      child.stdin.end();
      return;
    }

    if (req.method === "POST" && req.url === "/api/connect") {
      const body = await parseBody(req);
      if (!isHostPort(body.address)) {
        return sendJson(res, 400, { ok: false, error: "Use address as IP:DEBUGGING_PORT." });
      }

      const result = await runAdb(["connect", body.address.trim()]);
      return sendJson(res, result.ok ? 200 : 500, result);
    }

    if (req.method === "POST" && req.url === "/api/disconnect") {
      const body = await parseBody(req);
      const args = body.address && isHostPort(body.address) ? ["disconnect", body.address.trim()] : ["disconnect"];
      const result = await runAdb(args);
      return sendJson(res, result.ok ? 200 : 500, result);
    }

    if (req.method === "POST" && req.url === "/api/restart") {
      const kill = await runAdb(["kill-server"]);
      const start = await runAdb(["start-server"]);
      return sendJson(res, start.ok ? 200 : 500, { ok: start.ok, kill, start });
    }

    if (req.method === "POST" && req.url === "/api/install") {
      const body = await parseBody(req);
      if (!isSafeSerial(body.serial) || !isSafeApkPath(body.apkPath)) {
        return sendJson(res, 400, { ok: false, error: "Choose a connected device and provide a full .apk file path." });
      }

      if (!fs.existsSync(body.apkPath.trim())) {
        return sendJson(res, 400, { ok: false, error: "APK file was not found at that path." });
      }

      const result = await runAdb(["-s", body.serial.trim(), "install", "-r", body.apkPath.trim()], { timeout: 120000 });
      return sendJson(res, result.ok ? 200 : 500, result);
    }

    if (req.method === "POST" && req.url === "/api/device-command") {
      const body = await parseBody(req);
      if (!isSafeSerial(body.serial)) {
        return sendJson(res, 400, { ok: false, error: "Choose a connected device first." });
      }

      const serial = body.serial.trim();

      // Screen Mirroring via scrcpy
      if (body.command === "mirror") {
        const scrcpyPaths = ["/opt/homebrew/bin/scrcpy", "/usr/local/bin/scrcpy", "scrcpy"];
        let scrcpyBin = "scrcpy";
        for (const p of scrcpyPaths) {
          if (fs.existsSync(p)) {
            scrcpyBin = p;
            break;
          }
        }

        try {
          const child = spawn(scrcpyBin, ["-s", serial, "--window-title", `ADB Mirror: ${serial}`], {
            detached: true,
            stdio: "ignore",
            env: { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || ""}` }
          });
          child.unref();
          return sendJson(res, 200, { ok: true, message: `Screen mirror opened for ${serial}` });
        } catch (err) {
          return sendJson(res, 500, {
            ok: false,
            error: `Failed to launch scrcpy: ${err.message}. Install via: brew install scrcpy`
          });
        }
      }

      // Real PNG Screenshot (Base64)
      if (body.command === "screenshot") {
        return new Promise((resolve) => {
          execFile(
            ADB,
            ["-s", serial, "exec-out", "screencap", "-p"],
            { encoding: "buffer", maxBuffer: 15 * 1024 * 1024, timeout: 15000 },
            (error, stdout, stderr) => {
              if (error || !stdout || stdout.length === 0) {
                return sendJson(res, 500, {
                  ok: false,
                  error: (stderr ? stderr.toString() : "") || "Failed to capture screenshot."
                });
              }
              const base64 = stdout.toString("base64");
              sendJson(res, 200, {
                ok: true,
                image: `data:image/png;base64,${base64}`,
                sizeBytes: stdout.length
              });
              resolve();
            }
          );
        });
      }

      // Battery Status
      if (body.command === "battery") {
        const result = await runAdb(["-s", serial, "shell", "dumpsys", "battery"]);
        if (!result.ok) {
          return sendJson(res, 500, { ok: false, error: "Failed to get battery info." });
        }
        const data = {};
        result.stdout.split(/\r?\n/).forEach((line) => {
          const parts = line.split(":");
          if (parts.length === 2) data[parts[0].trim()] = parts[1].trim();
        });
        const statusMap = { "1": "Unknown", "2": "Charging", "3": "Discharging", "4": "Not charging", "5": "Full" };
        return sendJson(res, 200, {
          ok: true,
          level: data.level ? `${data.level}%` : "N/A",
          status: statusMap[data.status] || "Discharging",
          temperature: data.temperature ? `${(Number(data.temperature) / 10).toFixed(1)}°C` : "N/A",
          voltage: data.voltage ? `${(Number(data.voltage) / 1000).toFixed(2)}V` : "N/A"
        });
      }

      // Device Specs & Display Info
      if (body.command === "device_info") {
        const [sizeRes, densRes, verRes, modelRes, brandRes] = await Promise.all([
          runAdb(["-s", serial, "shell", "wm", "size"]),
          runAdb(["-s", serial, "shell", "wm", "density"]),
          runAdb(["-s", serial, "shell", "getprop", "ro.build.version.release"]),
          runAdb(["-s", serial, "shell", "getprop", "ro.product.model"]),
          runAdb(["-s", serial, "shell", "getprop", "ro.product.brand"])
        ]);
        return sendJson(res, 200, {
          ok: true,
          resolution: sizeRes.stdout.replace("Physical size:", "").trim(),
          density: densRes.stdout.replace("Physical density:", "").trim(),
          androidVersion: verRes.stdout.trim() || "N/A",
          model: modelRes.stdout.trim() || "N/A",
          brand: brandRes.stdout.trim() || "N/A"
        });
      }

      // Send Input Text to Device
      if (body.command === "input_text") {
        const text = String(body.text || "").trim();
        if (!text) {
          return sendJson(res, 400, { ok: false, error: "Enter text to type on phone." });
        }
        const escaped = text.replace(/ /g, "%s").replace(/([&|;()<>\$`\\])/g, "\\$1");
        const result = await runAdb(["-s", serial, "shell", "input", "text", escaped]);
        return sendJson(res, result.ok ? 200 : 500, result);
      }

      // Standard Key & Navigation Commands
      const commands = {
        wake: ["shell", "input", "keyevent", "KEYCODE_WAKEUP"],
        power: ["shell", "input", "keyevent", "KEYCODE_POWER"],
        home: ["shell", "input", "keyevent", "KEYCODE_HOME"],
        back: ["shell", "input", "keyevent", "KEYCODE_BACK"],
        recents: ["shell", "input", "keyevent", "KEYCODE_APP_SWITCH"],
        vol_up: ["shell", "input", "keyevent", "KEYCODE_VOLUME_UP"],
        vol_down: ["shell", "input", "keyevent", "KEYCODE_VOLUME_DOWN"],
        mute: ["shell", "input", "keyevent", "KEYCODE_VOLUME_MUTE"],
        packages: ["shell", "pm", "list", "packages", "-3"],
        reboot: ["reboot"]
      };

      const commandArgs = commands[body.command];
      if (!commandArgs) {
        return sendJson(res, 400, { ok: false, error: "Unknown command." });
      }

      const result = await runAdb(["-s", serial, ...commandArgs], { timeout: 30000 });
      return sendJson(res, result.ok ? 200 : 500, result);
    }

    sendJson(res, 404, { ok: false, error: "API route not found." });
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message });
  }
}

function serveStatic(req, res) {
  const requestPath = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  const filePath = path.normalize(path.join(PUBLIC_DIR, requestPath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    res.writeHead(200, { "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/")) return handleApi(req, res);
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`ADB Wireless GUI running at http://localhost:${PORT}`);
});
