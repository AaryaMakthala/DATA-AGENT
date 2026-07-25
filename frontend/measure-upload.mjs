/**
 * Throwaway verification harness for the Upload redesign.
 *
 * Drives headless Chrome over the DevTools Protocol (raw WebSocket, no deps) to
 * measure the REAL rendered geometry of /upload at each target viewport, so the
 * "fits above the fold" claim is backed by pixel numbers instead of eyeballing.
 *
 * Run:  node measure-upload.mjs
 * Delete after use — this is not app code.
 */
import { spawn } from "node:child_process";
import http from "node:http";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const URL_UNDER_TEST = "http://localhost:3111/upload";
const PORT = 9223;

const VIEWPORTS = [
  { w: 1920, h: 1080, label: "1920x1080" },
  { w: 1536, h: 864, label: "1536x864" },
  { w: 1440, h: 900, label: "1440x900" },
  { w: 1366, h: 768, label: "1366x768" },
  { w: 768, h: 1024, label: "768x1024 (tablet)" },
  { w: 390, h: 844, label: "390x844 (mobile)" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getJSON(path) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: "127.0.0.1", port: PORT, path }, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

// Minimal CDP client over a hand-rolled WebSocket frame codec.
async function connect(wsUrl) {
  const net = await import("node:net");
  const crypto = await import("node:crypto");
  const u = new URL(wsUrl);
  const key = crypto.randomBytes(16).toString("base64");
  const sock = net.connect(Number(u.port), u.hostname);
  await new Promise((r) => sock.once("connect", r));
  sock.write(
    `GET ${u.pathname} HTTP/1.1\r\nHost: ${u.host}\r\nUpgrade: websocket\r\n` +
      `Connection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`,
  );

  let buf = Buffer.alloc(0);
  let handshakeDone = false;
  const waiters = new Map();
  let nextId = 1;

  sock.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    if (!handshakeDone) {
      const idx = buf.indexOf("\r\n\r\n");
      if (idx === -1) return;
      buf = buf.subarray(idx + 4);
      handshakeDone = true;
    }
    // Decode as many complete frames as are buffered.
    for (;;) {
      if (buf.length < 2) return;
      const len0 = buf[1] & 0x7f;
      let offset = 2;
      let len = len0;
      if (len0 === 126) {
        if (buf.length < 4) return;
        len = buf.readUInt16BE(2);
        offset = 4;
      } else if (len0 === 127) {
        if (buf.length < 10) return;
        len = Number(buf.readBigUInt64BE(2));
        offset = 10;
      }
      if (buf.length < offset + len) return;
      const payload = buf.subarray(offset, offset + len).toString();
      buf = buf.subarray(offset + len);
      try {
        const msg = JSON.parse(payload);
        if (msg.id && waiters.has(msg.id)) {
          waiters.get(msg.id)(msg);
          waiters.delete(msg.id);
        }
      } catch {
        /* ignore non-JSON / control frames */
      }
    }
  });

  function send(method, params = {}) {
    const id = nextId++;
    const json = JSON.stringify({ id, method, params });
    const data = Buffer.from(json);
    const mask = crypto.randomBytes(4);
    let header;
    if (data.length < 126) {
      header = Buffer.from([0x81, 0x80 | data.length]);
    } else if (data.length < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x81;
      header[1] = 0x80 | 126;
      header.writeUInt16BE(data.length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x81;
      header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(data.length), 2);
    }
    const masked = Buffer.from(data);
    for (let i = 0; i < masked.length; i++) masked[i] ^= mask[i % 4];
    sock.write(Buffer.concat([header, mask, masked]));
    return new Promise((resolve) => waiters.set(id, resolve));
  }

  return { send, close: () => sock.destroy() };
}

const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  "--no-first-run",
  "--no-default-browser-check",
  "--user-data-dir=C:/Users/aarya/AppData/Local/Temp/cdp-upload-measure",
  "--hide-scrollbars",
  "about:blank",
]);
chrome.on("error", (e) => console.error("chrome spawn error", e));

// Wait for the debugging endpoint to come up.
let target = null;
for (let i = 0; i < 40; i++) {
  await sleep(500);
  try {
    const list = await getJSON("/json/list");
    target = list.find((t) => t.type === "page");
    if (target?.webSocketDebuggerUrl) break;
  } catch {
    /* not ready yet */
  }
}
if (!target) {
  console.error("could not reach Chrome CDP");
  chrome.kill();
  process.exit(1);
}

const cdp = await connect(target.webSocketDebuggerUrl);
await cdp.send("Page.enable");
await cdp.send("Runtime.enable");

const MEASURE = `(() => {
  const q = (s) => document.querySelector(s);
  const surface = q('.upload-surface');
  const card = surface ? surface.closest('.card-elevated') : q('.card-elevated');
  const nav = q('header');
  const badge = q('.upload-badge');
  const btn = q('.btn-lg');
  const pills = [...document.querySelectorAll('.pill-label-ghost')];
  const vh = window.innerHeight;
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect();
    return { top: +b.top.toFixed(1), bottom: +b.bottom.toFixed(1), h: +b.height.toFixed(1) }; };
  const cardBox = r(card);
  const lastPill = pills.length ? r(pills[pills.length - 1]) : null;
  return JSON.stringify({
    vh,
    scrollH: document.documentElement.scrollHeight,
    nav: r(nav),
    card: cardBox,
    surface: r(surface),
    badge: r(badge),
    button: r(btn),
    lastPill,
    cardPctOfVh: cardBox ? +((cardBox.h / vh) * 100).toFixed(1) : null,
    cardFitsAboveFold: cardBox ? cardBox.bottom <= vh : null,
    bottomMostFoldElement: lastPill ? lastPill.bottom : null,
    allContentAboveFold: lastPill ? lastPill.bottom <= vh : null,
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    surfaceBorderStyle: surface ? getComputedStyle(surface).borderTopStyle : null,
    surfaceShadow: surface ? getComputedStyle(surface).boxShadow : null,
  });
})()`;

console.log("viewport            | card h  | %vh   | card bottom | fold | all-content | h-overflow");
console.log("--------------------|---------|-------|-------------|------|-------------|-----------");

const results = [];
for (const vp of VIEWPORTS) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: vp.w,
    height: vp.h,
    deviceScaleFactor: 1,
    mobile: vp.w < 800,
  });
  await cdp.send("Page.navigate", { url: URL_UNDER_TEST });
  await sleep(2500); // let fonts + reveal transitions settle
  const res = await cdp.send("Runtime.evaluate", {
    expression: MEASURE,
    returnByValue: true,
  });
  const m = JSON.parse(res.result.result.value);
  results.push({ vp: vp.label, ...m });
  console.log(
    `${vp.label.padEnd(19)} | ${String(m.card?.h ?? "-").padEnd(7)} | ${String(m.cardPctOfVh ?? "-").padEnd(5)} | ` +
      `${String(m.card?.bottom ?? "-").padEnd(11)} | ${m.cardFitsAboveFold ? "YES " : "NO  "} | ` +
      `${String(m.allContentAboveFold ? "YES" : "NO").padEnd(11)} | ${m.horizontalOverflow ? "YES" : "no"}`,
  );
}

console.log("\n--- detail (desktop targets) ---");
for (const r of results.slice(0, 4)) {
  console.log(
    `${r.vp}: nav=${JSON.stringify(r.nav)} badge=${r.badge?.h} btn=${r.button?.h} ` +
      `lastPillBottom=${r.lastPill?.bottom} vh=${r.vh}`,
  );
}
console.log("\nsurface border-style:", results[0].surfaceBorderStyle);
console.log("surface box-shadow  :", results[0].surfaceShadow);

cdp.close();
chrome.kill();
