#!/usr/bin/env node
// libre-motion: local Artifact tool for the Motion type (built from libre-dashboard's server; do not edit by hand without testing).

import { spawn as spawn2 } from "node:child_process";
import { createHash as createHash4 } from "node:crypto";
import fs9 from "node:fs";
import http from "node:http";
import path8 from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import { createHash } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
var STATE_FILE = ".artifact-server.json";
var LOG_FILE = ".artifact-server.log";
var EXPORTS_DIR = "exports";
function readState(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, STATE_FILE), "utf8"));
  } catch {
    return null;
  }
}
function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}
async function runningServer(root, kind, probe) {
  const state = readState(root);
  if (!state || state.kind !== kind || !alive(state.pid)) return null;
  try {
    const response = await fetch(new URL(probe, state.url), { signal: AbortSignal.timeout(2e3) });
    return response.ok ? state : null;
  } catch {
    return null;
  }
}
function recordServer(state, close, signals = ["SIGINT", "SIGTERM"]) {
  const file = path.join(state.root, STATE_FILE);
  fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}
`);
  writeGitignore(state.root, state.kind);
  const shutdown = () => {
    if (readState(state.root)?.pid === process.pid) fs.rmSync(file, { force: true });
    close();
    process.exit(0);
  };
  for (const signal of signals) process.on(signal, shutdown);
}
var GITIGNORE_FILE = ".gitignore";
var gitignoreLines = (kind) => [STATE_FILE, LOG_FILE, ".sharing.json", ...kind === "docs" ? [] : ["history/"], ".*.tmp", ".DS_Store"];
function writeGitignore(root, kind) {
  const file = path.join(root, GITIGNORE_FILE);
  try {
    fs.writeFileSync(file, ["# Written by libre-artifacts when the editor first opened this folder: what only this computer's editor server needs.", ...gitignoreLines(kind), ""].join("\n"), { flag: "wx" });
  } catch {
  }
}
async function listen(server, port, host) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve());
  });
  const address = server.address();
  return typeof address === "object" && address ? address.port : port;
}
var DEFAULT_PORTS = { slides: 4710, design: 4720, "design-system": 4730, dashboard: 4740, docs: 4750, motion: 4760 };
var PORT_TRIES = 100;
var PortsTaken = class extends Error {
  code = "PORT_IN_USE";
  from;
  to;
  constructor(from, to) {
    super(`${from === to ? `Port ${from} is` : `Ports ${from} to ${to} are all`} in use; pick another --port (0 takes any free one).`);
    this.from = from;
    this.to = to;
  }
};
var isBenchmarkRange = (address) => /^198\.1[89]\./.test(address);
function isTailnet(address) {
  const m = /^100\.(\d{1,3})\./.exec(address);
  return !!m && Number(m[1]) >= 64 && Number(m[1]) <= 127;
}
function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const entry of list ?? []) {
      if (entry.family !== "IPv4" || entry.internal || entry.address.startsWith("169.254.") || isBenchmarkRange(entry.address)) continue;
      out.push(entry.address);
    }
  }
  return [...new Set(out)].sort((a, b) => Number(isTailnet(a)) - Number(isTailnet(b)));
}
function answers(host, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (taken) => {
      socket.destroy();
      resolve(taken);
    };
    socket.setTimeout(300, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", (error) => done(!["ECONNREFUSED", "EADDRNOTAVAIL", "EAFNOSUPPORT", "ENETUNREACH", "EHOSTUNREACH"].includes(error.code ?? "")));
  });
}
async function answersAnyPort(address) {
  const server = net.createServer();
  let port;
  try {
    port = await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, address, () => {
        const bound = server.address();
        resolve(typeof bound === "object" && bound ? bound.port : 0);
      });
    });
  } catch {
    return false;
  } finally {
    await new Promise((resolve) => server.close(() => resolve()));
  }
  return port > 0 && answers(address, port);
}
async function listenFree(server, from, host, first) {
  if (from === 0) return listen(server, 0, host);
  const to = Math.min(from + PORT_TRIES - 1, 65535);
  const range = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const ports = first ? [first, ...range.filter((port) => port !== first)] : range;
  const wildcard = host === "0.0.0.0" || host === "::";
  const lan = lanAddresses().filter((address) => address !== host);
  const answering = await Promise.all(lan.map(answersAnyPort));
  const probes = [.../* @__PURE__ */ new Set([...wildcard ? [] : [host], "127.0.0.1", "::1", ...lan.filter((_, i) => !answering[i])])];
  for (const port of ports) {
    if ((await Promise.all(probes.map((address) => answers(address, port)))).some(Boolean)) continue;
    try {
      return await listen(server, port, host);
    } catch (error) {
      if (error.code !== "EADDRINUSE") throw error;
    }
  }
  throw new PortsTaken(from, to);
}
function serverOrigin(host, port) {
  const shown2 = host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host.includes(":") ? `[${host}]` : host;
  return `http://${shown2}:${port}`;
}
var pagePathOf = (kind, root) => `/${kind}/${createHash("sha256").update(path.resolve(root)).digest("base64url").slice(0, 22)}/`;
function pageRoute(pathname, page) {
  if (pathname === "/" || pathname === "/index.html" || pathname === page.slice(0, -1)) return { redirect: page };
  return { path: pathname.startsWith(page) ? `/${pathname.slice(page.length)}` : pathname };
}
function sendJson(response, status, body, headers = {}) {
  const text = JSON.stringify(body);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(text),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers
  });
  response.end(text);
}
var TooLarge = class extends Error {
};
function readBody(request, limit) {
  return new Promise((resolve, reject) => {
    const declared = Number(request.headers["content-length"]);
    if (Number.isFinite(declared) && declared > limit) {
      reject(new TooLarge());
      request.resume();
      return;
    }
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new TooLarge());
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}
function sameOrigin(request) {
  const origin = request.headers.origin;
  if (origin === void 0) return true;
  const host = request.headers.host;
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
function sendFile(request, response, file, headers) {
  response.writeHead(200, headers);
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  const stream = fs.createReadStream(file);
  stream.on("error", () => response.destroy());
  response.on("close", () => stream.destroy());
  stream.pipe(response);
}

import { createHash as createHash2 } from "node:crypto";
import fs5 from "node:fs";
import os3 from "node:os";
import path5 from "node:path";

import fs3 from "node:fs";
import fsp from "node:fs/promises";
import path3 from "node:path";
import { promisify } from "node:util";
import zlib from "node:zlib";

import crypto from "node:crypto";
import fs2 from "node:fs";
import path2 from "node:path";
var GUEST_ROLES = ["editor", "commenter", "viewer"];
var isGuestRole = (value) => typeof value === "string" && GUEST_ROLES.includes(value);
var SHARING_FILE = ".sharing.json";
var MAX_GUESTS = 200;
var MAX_NAME = 40;
var token = (bytes = 18) => crypto.randomBytes(bytes).toString("base64url");
var isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
function fresh() {
  return { lan: false, links: { editor: { token: token(), on: true }, commenter: { token: token(), on: true }, viewer: { token: token(), on: true } }, guests: [] };
}
function cleanName(raw) {
  const name = typeof raw === "string" ? raw.replace(/[\u0000-\u001f\u007f@<>]/g, "").replace(/\s+/g, " ").trim() : "";
  return [...name].slice(0, MAX_NAME).join("");
}
function guestUser(guest) {
  return { id: `guest-${guest.id}`, name: guest.name, email: `${guest.name}@${guest.id}.guest` };
}
function isLoopback(address) {
  if (!address) return false;
  const a = address.startsWith("::ffff:") ? address.slice(7) : address;
  return a === "::1" || a.startsWith("127.");
}
var Sharing = class _Sharing {
  file;
  state;
  constructor(root) {
    this.file = path2.join(root, SHARING_FILE);
    this.state = _Sharing.read(this.file);
  }
  static read(file) {
    let raw;
    try {
      raw = JSON.parse(fs2.readFileSync(file, "utf8"));
    } catch {
      return fresh();
    }
    const state = fresh();
    if (!isRecord(raw)) return state;
    state.lan = raw.lan === true;
    if (typeof raw.port === "number" && Number.isInteger(raw.port) && raw.port > 0 && raw.port < 65536) state.port = raw.port;
    if (isRecord(raw.links)) {
      for (const role of GUEST_ROLES) {
        const link = raw.links[role];
        if (isRecord(link) && typeof link.token === "string" && link.token.length >= 16) state.links[role] = { token: link.token, on: link.on !== false };
      }
    }
    if (Array.isArray(raw.guests)) {
      for (const g of raw.guests) {
        if (!isRecord(g) || typeof g.id !== "string" || typeof g.secret !== "string" || !isGuestRole(g.role) || typeof g.link !== "string") continue;
        state.guests.push({
          id: g.id,
          secret: g.secret,
          name: cleanName(g.name) || "Guest",
          role: g.role,
          link: g.link,
          joined: typeof g.joined === "string" ? g.joined : (/* @__PURE__ */ new Date(0)).toISOString(),
          ...typeof g.seen === "string" ? { seen: g.seen } : {}
        });
      }
    }
    return state;
  }
  save() {
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs2.writeFileSync(tmp, `${JSON.stringify(this.state, null, 2)}
`, { mode: 384 });
    fs2.renameSync(tmp, this.file);
  }
  /** The role whose link has this token, while that link is on. */
  linkRole(tokenGiven) {
    for (const role of GUEST_ROLES) {
      const link = this.state.links[role];
      if (link.on && tokenGiven.length === link.token.length && crypto.timingSafeEqual(Buffer.from(tokenGiven), Buffer.from(link.token))) return role;
    }
    return null;
  }
  /** The guest a cookie names, if they still have access (their link on and not reset). */
  guest(secret) {
    if (!secret) return null;
    const guest = this.state.guests.find((g) => g.secret === secret);
    return guest && this.valid(guest) ? guest : null;
  }
  valid(guest) {
    const link = this.state.links[guest.role];
    return link.on && link.token === guest.link && this.state.guests.includes(guest);
  }
  join(role, name) {
    const guest = { id: token(4), secret: token(24), name: cleanName(name) || "Guest", role, link: this.state.links[role].token, joined: (/* @__PURE__ */ new Date()).toISOString() };
    this.state.guests.push(guest);
    if (this.state.guests.length > MAX_GUESTS) this.state.guests.splice(0, this.state.guests.length - MAX_GUESTS);
    this.save();
    return guest;
  }
  /** Marks a guest seen now (saved at most once a minute per guest). */
  seen(guest) {
    const now = /* @__PURE__ */ new Date();
    if (guest.seen && now.getTime() - Date.parse(guest.seen) < 6e4) return;
    guest.seen = now.toISOString();
    this.save();
  }
  setLan(on, port) {
    this.state.lan = on;
    if (on && port) this.state.port = port;
    this.save();
  }
  setLink(role, on) {
    this.state.links[role].on = on;
    this.save();
  }
  /** A new token for the link: the old link stops working and the guests who came through it are dropped. */
  resetLink(role) {
    const old = this.state.links[role].token;
    this.state.links[role] = { token: token(), on: this.state.links[role].on };
    this.state.guests = this.state.guests.filter((g) => g.link !== old);
    this.save();
  }
  /**
   * Gives a guest another role. They now hang on that role's link (turning it off or resetting it drops them), so a role
   * whose link is off would shut them out: false then, as for a guest who isn't there.
   */
  setRole(id, role) {
    const guest = this.state.guests.find((g) => g.id === id);
    if (!guest || !this.state.links[role].on) return false;
    guest.role = role;
    guest.link = this.state.links[role].token;
    this.save();
    return true;
  }
  removeGuest(id) {
    const before = this.state.guests.length;
    this.state.guests = this.state.guests.filter((g) => g.id !== id);
    if (this.state.guests.length === before) return false;
    this.save();
    return true;
  }
};

var LOCAL_FILES = /* @__PURE__ */ new Set([STATE_FILE, LOG_FILE, SHARING_FILE]);
var LOCAL_DIRS = /* @__PURE__ */ new Set([EXPORTS_DIR]);
var JUNK_FILES = /* @__PURE__ */ new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);
var isTemp = (name) => name.endsWith(".tmp") || name.startsWith(".tmp-");
var STORED = /* @__PURE__ */ new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".heic", ".mp4", ".m4v", ".mov", ".webm", ".mp3", ".m4a", ".aac", ".ogg", ".opus", ".flac", ".woff", ".woff2", ".zip", ".gz", ".br", ".zst", ".7z"]);
var MAX_ENTRIES = 65535;
var MAX_BYTES = 4294967295;
var ArchiveTooLarge = class extends Error {
  code = "TOO_LARGE";
};
async function archiveEntries(root, skip = []) {
  const folder = path3.basename(path3.resolve(root)) || "artifact";
  const skipped = new Set(skip.map((file) => path3.resolve(file)));
  const entries = [];
  const walk = async (dir, rel) => {
    let names;
    try {
      names = await fsp.readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (rel && error.code === "ENOENT") return;
      throw error;
    }
    for (const dirent of names.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      const name = dirent.name;
      if (JUNK_FILES.has(name) || isTemp(name) || !rel && (LOCAL_FILES.has(name) || LOCAL_DIRS.has(name) && dirent.isDirectory())) continue;
      const file = path3.join(dir, name);
      if (skipped.has(file)) continue;
      const inner = rel ? `${rel}/${name}` : name;
      if (dirent.isDirectory()) await walk(file, inner);
      else if (dirent.isFile()) {
        const stat = await fsp.stat(file).catch(() => null);
        if (stat?.isFile()) entries.push({ name: `${folder}/${inner}`, file, size: stat.size, mode: stat.mode & 511, mtime: stat.mtime });
      }
    }
  };
  await walk(path3.resolve(root), "");
  if (entries.length > MAX_ENTRIES) throw new ArchiveTooLarge(`The folder holds ${entries.length} files, more than a zip holds (${MAX_ENTRIES}); copy the folder itself instead.`);
  const bound = entries.reduce((sum, entry) => sum + entry.size + 2 * (46 + Buffer.byteLength(entry.name)), 22);
  if (bound > MAX_BYTES) throw new ArchiveTooLarge(`The folder holds ${(bound / 2 ** 30).toFixed(1)} GiB, more than a zip holds (4 GiB); copy the folder itself instead.`);
  return entries;
}
var CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
function crc32(bytes) {
  let crc = 4294967295;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 255] ^ crc >>> 8;
  return (crc ^ 4294967295) >>> 0;
}
function dosTime(date) {
  const year = date.getFullYear();
  if (year < 1980) return { time: 0, date: 1 << 5 | 1 };
  if (year > 2107) return { time: 23 << 11 | 59 << 5 | 29, date: 127 << 9 | 12 << 5 | 31 };
  return {
    time: date.getHours() << 11 | date.getMinutes() << 5 | date.getSeconds() >> 1,
    date: year - 1980 << 9 | date.getMonth() + 1 << 5 | date.getDate()
  };
}
var deflateRaw = promisify(zlib.deflateRaw);
var UTF8 = 1 << 11;
async function writeZip(entries, write) {
  const central = [];
  let offset = 0;
  const put = async (chunk) => {
    await write(chunk);
    offset += chunk.length;
  };
  for (const entry of entries) {
    let data;
    try {
      data = await fsp.readFile(entry.file);
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    const crc = crc32(data);
    let method = 0;
    let body = data;
    if (data.length > 0 && !STORED.has(path3.extname(entry.name).toLowerCase())) {
      const deflated = await deflateRaw(data);
      if (deflated.length < data.length) {
        method = 8;
        body = deflated;
      }
    }
    if (offset + body.length > MAX_BYTES) throw new ArchiveTooLarge("The folder grew past what a zip holds (4 GiB) while it was being zipped.");
    const name = Buffer.from(entry.name, "utf8");
    const { time, date } = dosTime(entry.mtime);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(67324752, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(UTF8, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    const header = Buffer.alloc(46);
    header.writeUInt32LE(33639248, 0);
    header.writeUInt16LE(3 << 8 | 20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(UTF8, 8);
    header.writeUInt16LE(method, 10);
    header.writeUInt16LE(time, 12);
    header.writeUInt16LE(date, 14);
    header.writeUInt32LE(crc, 16);
    header.writeUInt32LE(body.length, 20);
    header.writeUInt32LE(data.length, 24);
    header.writeUInt16LE(name.length, 28);
    header.writeUInt32LE((32768 | (entry.mode || 420) | 384) << 16 >>> 0, 38);
    header.writeUInt32LE(offset, 42);
    central.push(header, name);
    await put(Buffer.concat([local, name]));
    await put(body);
  }
  const start = offset;
  const directory = Buffer.concat(central);
  await put(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(101010256, 0);
  end.writeUInt16LE(central.length / 2, 8);
  end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(start, 16);
  await put(end);
  return offset;
}
function archiveFileName(root, now = /* @__PURE__ */ new Date()) {
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return `${path3.basename(path3.resolve(root)) || "artifact"}-${day}.zip`;
}
async function writeArchive(root, out) {
  const file = path3.resolve(out);
  const entries = await archiveEntries(root, [file]);
  const tmp = path3.join(path3.dirname(file), `.${path3.basename(file)}.${process.pid}.tmp`);
  const handle = await fsp.open(tmp, "w");
  let bytes;
  try {
    bytes = await writeZip(entries, async (chunk) => {
      await handle.write(chunk);
    });
    await handle.close();
  } catch (error) {
    await handle.close().catch(() => {
    });
    await fsp.rm(tmp, { force: true });
    throw error;
  }
  await fsp.rename(tmp, file);
  return { file, files: entries.length, bytes };
}
async function archiveCommand(root, out) {
  const where = out ? path3.resolve(out) : path3.dirname(path3.resolve(root));
  const target = fs3.statSync(where, { throwIfNoEntry: false })?.isDirectory() ? path3.join(where, archiveFileName(root)) : where;
  const { file, files, bytes } = await writeArchive(root, target);
  return { file, folder: path3.basename(path3.resolve(root)), files, bytes, leftOut: [...LOCAL_FILES] };
}
function attachment(name) {
  const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
async function sendArchive(request, response, root) {
  request.resume();
  let entries;
  try {
    entries = await archiveEntries(root);
  } catch (error) {
    const text = JSON.stringify({ code: error instanceof ArchiveTooLarge ? "too_large" : "upstream_error", message: error instanceof Error ? error.message : String(error) });
    response.writeHead(error instanceof ArchiveTooLarge ? 413 : 500, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }).end(text);
    return;
  }
  response.writeHead(200, {
    "Content-Type": "application/zip",
    "Content-Disposition": attachment(archiveFileName(root)),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  const write = (chunk) => new Promise((resolve, reject) => {
    if (response.destroyed) return reject(new Error("The download was cancelled."));
    if (response.write(chunk)) return resolve();
    const drained = () => {
      response.off("close", closed);
      resolve();
    };
    const closed = () => {
      response.off("drain", drained);
      reject(new Error("The download was cancelled."));
    };
    response.once("drain", drained);
    response.once("close", closed);
  });
  try {
    await writeZip(entries, write);
    response.end();
  } catch {
    response.destroy();
  }
}

import fs4 from "node:fs";
import fsp2 from "node:fs/promises";
import os2 from "node:os";
import path4 from "node:path";
var MAX_BYTES2 = 4294967295;
function shown(file) {
  const home = os2.homedir();
  return home && (file === home || file.startsWith(home + path4.sep)) ? `~${file.slice(home.length)}` : file;
}
function saved(file, bytes) {
  return { path: file, name: path4.basename(file), folder: path4.dirname(file), shown: shown(file), bytes };
}
function safeFileName(raw) {
  let name = (raw.replace(/\\/g, "/").split("/").pop() ?? "").replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "_").replace(/^[.\s]+|[.\s]+$/g, "");
  if (name.length > 200) {
    const ext = path4.extname(name).slice(0, 16);
    name = name.slice(0, 200 - ext.length) + ext;
  }
  return name || "download";
}
async function openFree(dir, name) {
  const ext = path4.extname(name);
  const stem = name.slice(0, name.length - ext.length);
  for (let n = 0; ; n++) {
    const file = path4.join(dir, n === 0 ? name : `${stem} (${n})${ext}`);
    try {
      return { file, handle: await fsp2.open(file, "wx") };
    } catch (error) {
      if (error.code !== "EEXIST" || n >= 999) throw error;
    }
  }
}
async function saveDownload(request, response, root) {
  const declared = Number(request.headers["content-length"]);
  if (Number.isFinite(declared) && declared > MAX_BYTES2) {
    request.resume();
    return sendJson(response, 413, { code: "too_large", message: "The file is over 4 GiB." });
  }
  const name = safeFileName(new URL(request.url ?? "/", "http://local").searchParams.get("name") ?? "");
  let file = "";
  let handle = null;
  let bytes = 0;
  try {
    const dir = path4.join(root, EXPORTS_DIR);
    await fsp2.mkdir(dir, { recursive: true });
    ({ file, handle } = await openFree(dir, name));
    for await (const chunk of request) {
      bytes += chunk.length;
      if (bytes > MAX_BYTES2) throw Object.assign(new Error("The file is over 4 GiB."), { status: 413 });
      await handle.write(chunk);
    }
    await handle.close();
    handle = null;
  } catch (error) {
    await handle?.close().catch(() => {
    });
    if (file) await fsp2.rm(file, { force: true });
    request.resume();
    const status = error.status ?? 500;
    if (!response.headersSent) sendJson(response, status, { code: status === 413 ? "too_large" : "upstream_error", message: error instanceof Error ? error.message : String(error) });
    return;
  }
  sendJson(response, 200, saved(file, bytes));
}
async function saveArchive(request, response, root) {
  request.resume();
  try {
    const { file } = await archiveCommand(root, void 0);
    sendJson(response, 200, saved(file, fs4.statSync(file).size));
  } catch (error) {
    const tooLarge = error instanceof ArchiveTooLarge;
    sendJson(response, tooLarge ? 413 : 500, { code: tooLarge ? "too_large" : "upstream_error", message: error instanceof Error ? error.message : String(error) });
  }
}

var NOUNS = {
  docs: { en: "doc", zh: "\u6587\u6863", zhThis: "\u8FD9\u7BC7\u6587\u6863" },
  slides: { en: "deck", zh: "\u6F14\u793A\u6587\u7A3F", zhThis: "\u8FD9\u4EFD\u6F14\u793A\u6587\u7A3F" },
  design: { en: "design", zh: "\u8BBE\u8BA1\u7A3F", zhThis: "\u8FD9\u4EFD\u8BBE\u8BA1\u7A3F" },
  "design-system": { en: "design system", zh: "\u8BBE\u8BA1\u7CFB\u7EDF", zhThis: "\u8FD9\u4E2A\u8BBE\u8BA1\u7CFB\u7EDF" },
  dashboard: { en: "dashboard", zh: "\u4EEA\u8868\u76D8", zhThis: "\u8FD9\u4E2A\u4EEA\u8868\u76D8" },
  motion: { en: "animation", zh: "\u52A8\u753B", zhThis: "\u8FD9\u4E2A\u52A8\u753B" }
};
var ShareError = class extends Error {
};
var canEditAs = (role) => role === "owner" || role === "editor";
function commentsViewer(viewer) {
  return {
    author: viewer.guest ? { kind: "user", name: viewer.user.name, principal: viewer.user.email } : { kind: "user", name: viewer.user.name },
    canComment: viewer.role !== "viewer",
    canSend: viewer.role === "owner",
    admin: viewer.role === "owner"
  };
}
var isRecord2 = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var esc = (text) => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
var script = (value) => JSON.stringify(value).replace(/</g, "\\u003c");
function ownHosts(host, port) {
  const named = host === "0.0.0.0" || host === "::" ? [] : [host.includes(":") ? `[${host}]:${port}` : `${host}:${port}`];
  return [.../* @__PURE__ */ new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`, ...named])];
}
function localOwner() {
  let name = "You";
  try {
    name = os3.userInfo().username.trim() || name;
  } catch {
  }
  return { id: "local", name, email: `${name}@localhost` };
}
var guestCookieName = (kind, root) => `${kind.replace(/-/g, "_")}_guest_${createHash2("sha256").update(path5.resolve(root)).digest("hex").slice(0, 12)}`;
function dbAccess(viewer, segs, adminRead = /* @__PURE__ */ new Set()) {
  const admin = canEditAs(viewer.role);
  const read = segs[0] === "data" && segs[1] === "users" && segs.length > 2 ? segs[2] === viewer.user.id : admin || !adminRead.has(segs[0] ?? "");
  return { read, write: read && admin };
}
var ShareHost = class {
  sharing;
  options;
  /** The port the server listens on (set by `listening`); the LAN listeners take the same one. */
  port = 0;
  hosts = /* @__PURE__ */ new Set();
  /** One listener per LAN address while the artifact is open to the network. */
  lanServers = /* @__PURE__ */ new Map();
  live = /* @__PURE__ */ new Set();
  constructor(options) {
    this.options = options;
    this.sharing = new Sharing(options.root);
  }
  /**
   * Starts `server` on the first free port from `port` (a shared artifact tries the port its links were given out with
   * first, so they keep working, unless the port was given), shares it on the network with `lan` (or as it was left)
   * and answers the port taken. If this throws, the caller closes what it started.
   */
  async listen(server, { port, host, lan = false, portGiven = false }) {
    const { state } = this.sharing;
    const linksPort = !portGiven && (lan || state.lan) && state.port ? state.port : void 0;
    const taken = await listenFree(server, port, host, linksPort);
    if (linksPort && taken !== linksPort) this.options.log(`port ${linksPort} (the shared links') is in use; took ${taken}: give the new links out again`);
    else if (!linksPort && port && taken !== port) this.options.log(`port ${port} is in use; took ${taken}`);
    if (lan && !this.sharing.state.lan) this.sharing.setLan(true, taken);
    await this.listening(taken, ownHosts(host, taken));
    return taken;
  }
  /** The artifact at each LAN address it is shared on ([] while it is not). */
  lanUrls() {
    return [...this.lanServers.keys()].map((a) => `http://${a}:${this.port}/`);
  }
  /** The main listener is up on `port` (answering `hosts`): open to the network now if the artifact was left shared. */
  async listening(port, hosts) {
    this.port = port;
    this.hosts = new Set(hosts);
    if (this.sharing.state.lan) await this.setLan(true);
  }
  /** Open to the local network now. */
  get shared() {
    return this.lanServers.size > 0;
  }
  /** A Host header this server answers: its own names, and while shared, its LAN addresses and machine name. */
  hostAllowed(request) {
    const host = request.headers.host ?? "";
    if (this.hosts.has(host)) return true;
    if (!this.lanServers.size) return false;
    const suffix = `:${this.port}`;
    if (!host.endsWith(suffix)) return false;
    const name = host.slice(0, -suffix.length).toLowerCase();
    const machine = os3.hostname().toLowerCase();
    return this.lanServers.has(name) || name === machine || name === `${machine.replace(/\.local$/, "")}.local`;
  }
  /**
   * Opens the artifact to the local network (a listener on each LAN address, on the server's port) or closes it.
   * Returns the addresses it listens on. Guests already in keep their place for when it opens again.
   */
  async setLan(on) {
    if (!on) {
      this.closeLan();
      for (const live of [...this.live]) if (live.viewer.guest) live.close("unshared");
      if (this.sharing.state.lan) this.sharing.setLan(false);
      return [];
    }
    for (const address of lanAddresses()) {
      if (this.lanServers.has(address)) continue;
      const server = this.options.createServer();
      try {
        await listen(server, this.port, address);
        this.lanServers.set(address, server);
      } catch (error) {
        server.close();
        this.options.log(`not listening on ${address}:${this.port}: ${error.message}`);
      }
    }
    if (!this.sharing.state.lan || this.sharing.state.port !== this.port) this.sharing.setLan(true, this.port);
    this.options.log(`shared on the local network: ${[...this.lanServers.keys()].map((a) => `http://${a}:${this.port}/`).join(", ") || "(no LAN address)"}`);
    return [...this.lanServers.keys()];
  }
  closeLan() {
    for (const server of this.lanServers.values()) {
      server.close();
      server.closeAllConnections?.();
    }
    this.lanServers.clear();
  }
  /** Stops the LAN listeners (the server closes its own). */
  close() {
    this.closeLan();
  }
  // ---- who is asking ---------------------------------------------------------------------------------------------
  cookie(request) {
    for (const part of (request.headers.cookie ?? "").split(";")) {
      const eq = part.indexOf("=");
      if (eq > 0 && part.slice(0, eq).trim() === this.options.cookieName) return part.slice(eq + 1).trim();
    }
    return void 0;
  }
  /**
   * Who a request is: the owner over loopback, a guest by their cookie (while their link is on and the artifact is
   * shared), else nobody. Loopback is always the owner, so trying a link on this computer can't lock the owner out of
   * their own artifact; a guest comes over a LAN address (this computer's own included: that is how the owner sees
   * what a role sees).
   */
  viewerOf(request) {
    if (isLoopback(request.socket.remoteAddress)) return { role: "owner", user: this.options.owner };
    const guest = this.lanServers.size ? this.sharing.guest(this.cookie(request)) : null;
    if (!guest) return null;
    this.sharing.seen(guest);
    return { role: guest.role, user: guestUser(guest), guest };
  }
  /** Keeps track of a stream or socket `viewer` holds open; call the returned function when it closes. */
  attach(viewer, close) {
    const live = { viewer, close };
    this.live.add(live);
    return () => this.live.delete(live);
  }
  /** `attach` for an HTTP stream (server-sent events): it ends when its person loses access. */
  hold(viewer, response) {
    const detach = this.attach(viewer, () => response.end());
    response.on("close", detach);
  }
  /** Still allowed in: the owner, or a guest whose link is on and who was not removed. */
  stillIn(viewer) {
    return !viewer.guest || this.shared && this.sharing.valid(viewer.guest);
  }
  /** Ends the streams of guests who lost access (a link turned off or reset, a guest removed). */
  dropRevoked() {
    for (const live of [...this.live]) if (live.viewer.guest && !this.sharing.valid(live.viewer.guest)) live.close("revoked");
  }
  me(viewer) {
    return { role: viewer.role, id: viewer.user.id, name: viewer.user.name, email: viewer.user.email };
  }
  // ---- routes ----------------------------------------------------------------------------------------------------
  /** Answers the share link and /__share paths; false for any other path. */
  async route(request, response) {
    const p = new URL(request.url ?? "/", "http://local").pathname;
    const method = request.method ?? "GET";
    const link = /^\/s\/([A-Za-z0-9_-]{16,64})$/.exec(p);
    const ours = link || p === "/__share" || p.startsWith("/__share/");
    if (!ours) return false;
    if (method === "POST" && !sameOrigin(request)) {
      request.resume();
      sendJson(response, 403, { code: "not_granted", message: "Cross-origin write refused." });
      return true;
    }
    if (link) {
      if (method === "GET" || method === "POST") await this.join(request, response, method, link[1]);
      else response.writeHead(405, { Allow: "GET, POST" }).end();
      return true;
    }
    const viewer = this.viewerOf(request);
    if (!viewer) {
      this.denied(request, response);
      return true;
    }
    if (method === "GET" && p === "/__share/me") return sendJson(response, 200, this.me(viewer)), true;
    if (method === "GET" && p === "/__share/boot.js") {
      const body = this.bootScript(viewer, new URL(request.url ?? "/", "http://local").searchParams);
      response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Content-Length": Buffer.byteLength(body), "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }).end(body);
      return true;
    }
    if (method === "GET" && p === "/__share/invite") return sendJson(response, 200, this.invites(viewer, request.headers.host ?? "")), true;
    if (method === "GET" && p === "/__share/ui.js") {
      fs5.stat(this.options.uiFile, (error, stat) => {
        if (error || !stat.isFile()) return sendJson(response, 404, { code: "not_found", message: "The Share panel is missing." });
        sendFile(request, response, this.options.uiFile, { "Content-Type": "text/javascript; charset=utf-8", "Content-Length": stat.size, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
      });
      return true;
    }
    if (viewer.role !== "owner") return sendJson(response, 403, { code: "not_granted", message: "Only the owner can do this." }), true;
    if ((method === "GET" || method === "HEAD") && p === "/__share/archive") return await sendArchive(request, response, this.options.root), true;
    if (method === "POST" && p === "/__share/archive") return await saveArchive(request, response, this.options.root), true;
    if (method === "POST" && p === "/__share/save") return await saveDownload(request, response, this.options.root), true;
    if (p === "/__share") return await this.shareApi(request, response, method), true;
    sendJson(response, 404, { code: "not_found", message: "Not found" });
    return true;
  }
  /**
   * The tags a page puts first in its <head>: the boot script and the Share panel (the owner's, or a guest's). `query`
   * ("?…") goes to the boot script, for `globals`.
   */
  headTags(_viewer, query = "") {
    let tags = `<script src="/__share/boot.js${query.replace(/[<>"']/g, "").replace(/&/g, "&amp;")}"></script>`;
    if (fs5.existsSync(this.options.uiFile)) tags += '<script type="module" src="/__share/ui.js"></script>';
    return tags;
  }
  /** `html` with the head tags first in its <head>; null when it has none. */
  injectHead(html, viewer, query = "") {
    const at = html.search(/<head(\s[^>]*)?>/i);
    if (at < 0) return null;
    const end = html.indexOf(">", at) + 1;
    return html.slice(0, end) + this.headTags(viewer, query) + html.slice(end);
  }
  /** What the page runs before anything else (see SECURE_CONTEXT_SHIM and GUEST_WATCH). */
  bootScript(viewer, query = new URLSearchParams()) {
    const share2 = { ...this.me(viewer), noun: this.options.noun, title: this.options.title(), ...this.options.reactions ? { reactions: true } : {} };
    let js = `${SECURE_CONTEXT_SHIM}window.__baoyuShare=${script(share2)};`;
    for (const [name, value] of Object.entries(this.options.globals?.(viewer, query) ?? {})) js += `window[${script(name)}]=${script(value)};`;
    if (viewer.guest) js += GUEST_WATCH;
    return js;
  }
  /** Nobody's request: a page for a browser's navigation, JSON for anything else. */
  denied(request, response) {
    request.resume();
    const navigation = (request.method === "GET" || request.method === "HEAD") && /\btext\/html\b/.test(request.headers.accept ?? "");
    if (!navigation) return sendJson(response, 403, { code: "not_granted", message: `This ${this.options.noun.en} is not shared with you.` });
    const t = this.words(request);
    this.sendPage(response, 403, t.noAccessTitle, `<h1>${esc(t.noAccessTitle)}</h1><p>${esc(t.noAccess)}</p>${this.ownerHint(request, t)}`);
  }
  /** A small page of our own (the join form, the refusal), in the reader's language. */
  sendPage(response, status, title, body, headers = {}) {
    const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${PAGE_CSS}</style></head><body><main>${body}</main></body></html>`;
    response.writeHead(status, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'",
      ...headers
    }).end(html);
  }
  /** On the computer that shares the artifact, over its LAN address: the way back to the owner's page. */
  ownerHint(request, t) {
    const from = (request.socket.remoteAddress ?? "").replace(/^::ffff:/, "");
    if (!this.lanServers.has(from)) return "";
    const url = `http://127.0.0.1:${this.port}/`;
    return `<p class="note">${esc(t.ownerHere)} <a href="${esc(url)}">${esc(url)}</a></p>`;
  }
  /** GET /s/<token>: the name form (or straight in, for a guest already in through this link); POST: join. */
  async join(request, response, method, token2) {
    const t = this.words(request);
    const role = this.sharing.linkRole(token2);
    const local = isLoopback(request.socket.remoteAddress);
    const form = method === "POST" ? await readBody(request, 8 << 10).then((body) => body.toString("utf8"), () => "") : "";
    const title = this.options.title();
    if (!role || !local && !this.lanServers.size) return this.sendPage(response, 404, t.linkGoneTitle, `<h1>${esc(t.linkGoneTitle)}</h1><p>${esc(t.linkGone)}</p>`);
    if (local) {
      const lan = [...this.lanServers.keys()][0];
      const there = lan ? `http://${lan}:${this.port}/s/${token2}` : "";
      const tryIt = there ? `<p>${esc(t.tryRole(t.roles[role]))} <a href="${esc(there)}">${esc(there)}</a></p>` : "";
      return this.sendPage(response, 200, title, `<h1>${esc(title)}</h1><p>${esc(t.youOwn)} <a href="/">${esc(t.openAsOwner)}</a></p>${tryIt}`);
    }
    const current = this.sharing.guest(this.cookie(request));
    if (method === "GET" && current && current.link === this.sharing.state.links[role].token) {
      response.writeHead(303, { Location: "/", "Cache-Control": "no-store" }).end();
      return;
    }
    if (method === "GET") {
      return this.sendPage(
        response,
        200,
        title,
        `<h1>${esc(title)}</h1><p>${esc(t.invited(t.roles[role]))}</p><form method="post"><label for="n">${esc(t.yourName)}</label><input id="n" name="name" maxlength="${MAX_NAME}" value="${esc(current?.name ?? "")}" required autofocus autocomplete="name"><button type="submit">${esc(t.open)}</button></form><p class="note">${esc(t.nameNote)}</p>`
      );
    }
    const name = new URLSearchParams(form).get("name") ?? "";
    const guest = this.sharing.join(role, name);
    this.options.log(`share: ${guest.name} joined as ${role} (${request.socket.remoteAddress})`);
    const cookie = `${this.options.cookieName}=${guest.secret}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`;
    response.writeHead(303, { Location: "/", "Set-Cookie": cookie, "Cache-Control": "no-store" }).end();
  }
  /**
   * The links this person may pass on: their own role's and the ones below it that are on (the owner: every one on), at
   * the address they came by (`host`, a Host header hostAllowed let in). A guest could forward the link they joined
   * with anyway; a lower one gives no more than that. Who joins through one shows in the owner's panel like anyone else.
   */
  invites(viewer, host) {
    const { links } = this.sharing.state;
    const from = viewer.role === "owner" ? 0 : GUEST_ROLES.indexOf(viewer.role);
    return { links: GUEST_ROLES.slice(from).filter((role) => links[role].on).map((role) => ({ role, url: `http://${host}/s/${links[role].token}` })) };
  }
  /** Links, addresses and people, for the share panel and `artifact.mjs share`. */
  shareView() {
    const addresses = [...this.lanServers.keys()].sort((a, b) => Number(isTailnet(a)) - Number(isTailnet(b)));
    const local = addresses.filter((a) => !isTailnet(a));
    const base = local.length ? `http://${local[0]}:${this.port}` : addresses.length ? `http://${addresses[0]}:${this.port}` : `http://127.0.0.1:${this.port}`;
    const tailnet = addresses.find(isTailnet);
    const online = /* @__PURE__ */ new Set();
    for (const live of this.live) if (live.viewer.guest) online.add(live.viewer.guest.id);
    const { links, guests } = this.sharing.state;
    const lan = addresses.length ? addresses : [...lanAddresses()].sort((a, b) => Number(isTailnet(a)) - Number(isTailnet(b)));
    const network = lan.length ? `http://${lan[0]}:${this.port}` : base;
    return {
      title: this.options.title(),
      lan: this.lanServers.size > 0,
      port: this.port,
      addresses,
      local: `http://127.0.0.1:${this.port}/`,
      links: Object.fromEntries(GUEST_ROLES.map((role) => [role, { on: links[role].on, url: `${base}/s/${links[role].token}`, networkUrl: `${network}/s/${links[role].token}` }])),
      ...tailnet ? { tailnet: { address: tailnet, links: Object.fromEntries(GUEST_ROLES.map((role) => [role, { on: links[role].on, url: `http://${tailnet}:${this.port}/s/${links[role].token}` }])) } } : {},
      guests: guests.filter((g) => this.sharing.valid(g) || links[g.role].token === g.link).map((g) => ({ id: g.id, name: g.name, role: g.role, joined: g.joined, ...g.seen ? { seen: g.seen } : {}, online: online.has(g.id), active: this.sharing.valid(g) }))
    };
  }
  /**
   * The owner's sharing calls: `lan` {on}, `link` {role, on}, `reset` {role} (a new link: the old one and the guests
   * who came through it stop working), `role` {guest, role} (a guest's role, while that role's link is on), `remove`
   * {guest}. Answers the view after.
   */
  async share(action) {
    const role = action.role;
    switch (action.action) {
      case "lan": {
        const addresses = await this.setLan(action.on === true);
        if (action.on === true && !addresses.length) throw new ShareError("This computer has no local network address to share on.");
        break;
      }
      case "link":
        if (!isGuestRole(role)) throw new ShareError("role: editor, commenter or viewer");
        this.sharing.setLink(role, action.on === true);
        break;
      case "reset":
        if (!isGuestRole(role)) throw new ShareError("role: editor, commenter or viewer");
        this.sharing.resetLink(role);
        break;
      case "role": {
        if (!isGuestRole(role)) throw new ShareError("role: editor, commenter or viewer");
        if (typeof action.guest !== "string" || !this.sharing.state.guests.some((g) => g.id === action.guest)) throw new ShareError("no such guest");
        if (!this.sharing.setRole(action.guest, role)) throw new ShareError(`The ${role} link is off: turn it on first.`);
        for (const live of [...this.live]) if (live.viewer.guest?.id === action.guest) live.close("revoked");
        break;
      }
      case "remove":
        if (typeof action.guest !== "string" || !this.sharing.removeGuest(action.guest)) throw new ShareError("no such guest");
        break;
      default:
        throw new ShareError("action: lan, link, reset, role or remove");
    }
    this.options.log(`share: ${JSON.stringify(action)}`);
    this.dropRevoked();
    return this.shareView();
  }
  async shareApi(request, response, method) {
    if (method === "GET") return sendJson(response, 200, this.shareView());
    if (method !== "POST") return sendJson(response, 405, { code: "method_not_allowed", message: `${method} is not allowed here.` });
    let action;
    try {
      action = JSON.parse((await readBody(request, 64 << 10)).toString("utf8"));
    } catch {
      return sendJson(response, 400, { code: "invalid_argument", message: "The call is not JSON." });
    }
    if (!isRecord2(action)) return sendJson(response, 400, { code: "invalid_argument", message: "Expected {action, ...}." });
    try {
      return sendJson(response, 200, await this.share(action));
    } catch (error) {
      if (error instanceof ShareError) return sendJson(response, 400, { code: "invalid_argument", message: error.message });
      throw error;
    }
  }
  words(request) {
    const zh = /^zh\b/i.test(request.headers["accept-language"] ?? "");
    return (zh ? ZH : EN)(this.options.noun);
  }
};
var SECURE_CONTEXT_SHIM = "if(window.crypto&&!crypto.randomUUID)crypto.randomUUID=function(){var b=crypto.getRandomValues(new Uint8Array(16)),h='',i;b[6]=b[6]&15|64;b[8]=b[8]&63|128;for(i=0;i<16;i++){h+=(b[i]+256).toString(16).slice(1);if(i==3||i==5||i==7||i==9)h+='-'}return h};";
var GUEST_WATCH = "setInterval(function(){fetch('/__share/me',{cache:'no-store'}).then(function(r){if(r.status===403)return location.reload();return r.json().then(function(m){if(m&&m.role&&m.role!==window.__baoyuShare.role)location.reload()})},function(){})},5000);";
var PAGE_CSS = `
:root { color-scheme: light dark; --bg: #f7f6f3; --card: #fff; --fg: #1f1e1d; --muted: #6b6a66; --line: #e3e1dc; --accent: #c96442; }
@media (prefers-color-scheme: dark) { :root { --bg: #1f1e1d; --card: #2a2927; --fg: #f2f1ee; --muted: #a8a6a0; --line: #3a3936; } }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--bg); color: var(--fg); font: 15px/1.5 system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; padding: 16px; }
main { width: min(420px, 100%); background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 28px; }
h1 { font-size: 20px; margin: 0 0 8px; word-break: break-word; }
p { margin: 0 0 16px; color: var(--muted); }
label { display: block; font-size: 13px; margin: 0 0 6px; color: var(--muted); }
input { width: 100%; font: inherit; padding: 9px 11px; border: 1px solid var(--line); border-radius: 8px; background: transparent; color: inherit; margin: 0 0 14px; }
button { width: 100%; font: inherit; font-weight: 600; padding: 10px; border: 0; border-radius: 8px; background: var(--accent); color: #fff; cursor: pointer; }
.note { font-size: 12px; margin: 14px 0 0; }
a { color: var(--accent); overflow-wrap: anywhere; }
`;
var EN = (noun) => ({
  noAccessTitle: "No access",
  noAccess: `This ${noun.en} is not shared with you. Ask its owner for a link.`,
  linkGoneTitle: "This link does not work",
  linkGone: `The link was turned off or replaced, or the ${noun.en} is no longer shared. Ask its owner for a new one.`,
  invited: (what) => `You were invited to ${what} this ${noun.en}.`,
  yourName: "Your name (others see it on your comments and edits)",
  open: `Open the ${noun.en}`,
  nameNote: "This browser keeps your place; the owner can remove it at any time.",
  roles: { editor: "edit", commenter: "comment on", viewer: "view" },
  youOwn: `This is your ${noun.en}: on this computer you are its owner.`,
  openAsOwner: "Open it",
  tryRole: (what) => `To see it as someone invited to ${what} it does, open the link at the network address, here or on another device:`,
  ownerHere: `You are on the computer that shares this ${noun.en}. Open it as the owner at`
});
var ZH = (noun) => ({
  noAccessTitle: "\u65E0\u6743\u8BBF\u95EE",
  noAccess: `${noun.zhThis}\u6CA1\u6709\u5206\u4EAB\u7ED9\u4F60\u3002\u8BF7\u5411\u6240\u6709\u8005\u8981\u4E00\u4E2A\u94FE\u63A5\u3002`,
  linkGoneTitle: "\u94FE\u63A5\u5DF2\u5931\u6548",
  linkGone: `\u8FD9\u4E2A\u94FE\u63A5\u5DF2\u88AB\u5173\u95ED\u6216\u91CD\u7F6E\uFF0C\u6216\u8005${noun.zhThis}\u5DF2\u505C\u6B62\u5206\u4EAB\u3002\u8BF7\u5411\u6240\u6709\u8005\u8981\u4E00\u4E2A\u65B0\u94FE\u63A5\u3002`,
  invited: (what) => `\u4F60\u88AB\u9080\u8BF7${what}${noun.zhThis}\u3002`,
  yourName: "\u4F60\u7684\u540D\u5B57\uFF08\u522B\u4EBA\u4F1A\u5728\u4F60\u7684\u8BC4\u8BBA\u548C\u7F16\u8F91\u4E0A\u770B\u5230\u5B83\uFF09",
  open: `\u6253\u5F00${noun.zh}`,
  nameNote: "\u8FD9\u4E2A\u6D4F\u89C8\u5668\u4F1A\u8BB0\u4F4F\u4F60\u7684\u8EAB\u4EFD\uFF1B\u6240\u6709\u8005\u53EF\u4EE5\u968F\u65F6\u79FB\u9664\u3002",
  roles: { editor: "\u7F16\u8F91", commenter: "\u8BC4\u8BBA", viewer: "\u67E5\u770B" },
  youOwn: `\u8FD9\u662F\u4F60\u7684${noun.zh}\uFF1A\u5728\u8FD9\u53F0\u7535\u8111\u4E0A\u4F60\u662F\u6240\u6709\u8005\u3002`,
  openAsOwner: `\u6253\u5F00${noun.zh}`,
  tryRole: (what) => `\u60F3\u770B\u770B\u53D7\u9080${what}\u7684\u4EBA\u770B\u5230\u4EC0\u4E48\uFF0C\u7528\u5C40\u57DF\u7F51\u5730\u5740\u6253\u5F00\u8FD9\u4E2A\u94FE\u63A5\uFF08\u5728\u8FD9\u53F0\u7535\u8111\u6216\u522B\u7684\u8BBE\u5907\u4E0A\u90FD\u884C\uFF09\uFF1A`,
  ownerHere: `\u4F60\u5728\u5206\u4EAB${noun.zhThis}\u7684\u7535\u8111\u4E0A\u3002\u4EE5\u6240\u6709\u8005\u8EAB\u4EFD\u6253\u5F00\uFF1A`
});

var MAX_EDIT = 2e3;
function editScript(a, b) {
  const n = a.length;
  const m = b.length;
  const limit = Math.min(n + m, MAX_EDIT);
  const offset = limit + 1;
  const v = new Int32Array(2 * limit + 3);
  const trace = [];
  let found = -1;
  for (let d = 0; d <= limit; d++) {
    trace.push(v.slice(offset - d - 1, offset + d + 2));
    for (let k = -d; k <= d; k += 2) {
      let x2 = k === -d || k !== d && v[offset + k - 1] < v[offset + k + 1] ? v[offset + k + 1] : v[offset + k - 1] + 1;
      let y2 = x2 - k;
      while (x2 < n && y2 < m && a[x2] === b[y2]) {
        x2++;
        y2++;
      }
      v[offset + k] = x2;
      if (x2 >= n && y2 >= m) {
        found = d;
        break;
      }
    }
    if (found >= 0) break;
  }
  if (found < 0) return null;
  const ops = [];
  let x = n;
  let y = m;
  for (let d = found; d > 0; d--) {
    const prev = trace[d];
    const at = (k2) => prev[k2 + d + 1];
    const k = x - y;
    const prevK = k === -d || k !== d && at(k - 1) < at(k + 1) ? k + 1 : k - 1;
    const prevX = at(prevK);
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      ops.push("=");
      x--;
      y--;
    }
    ops.push(x === prevX ? "+" : "-");
    x = prevX;
    y = prevY;
  }
  while (x > 0 && y > 0) {
    ops.push("=");
    x--;
    y--;
  }
  return ops.reverse();
}
function hunksOf(base, side, mine) {
  const ops = editScript(base, side);
  if (!ops) return null;
  const out = [];
  let open2 = null;
  let i = 0;
  let j = 0;
  for (const op of ops) {
    if (op === "=") {
      open2 = null;
      i++;
      j++;
      continue;
    }
    if (!open2) out.push(open2 = { start: i, end: i, lines: [], mine });
    if (op === "-") open2.end = ++i;
    else open2.lines.push(side[j++]);
  }
  return out.flatMap(
    (h) => h.end - h.start > 1 && h.lines.length === h.end - h.start ? h.lines.flatMap((line, k) => {
      const at = h.start + k;
      return line === base[at] ? [] : [{ start: at, end: at + 1, lines: [line], mine }];
    }) : [h]
  );
}
function applyHunks(base, start, end, hunks) {
  const out = [];
  let at = start;
  for (const h of hunks) {
    out.push(...base.slice(at, h.start), ...h.lines);
    at = h.end;
  }
  out.push(...base.slice(at, end));
  return out;
}
function mergeText(base, mine, current, at, conflicts) {
  const lines = base.split("\n");
  const ours = hunksOf(lines, mine.split("\n"), true);
  const theirs = ours && hunksOf(lines, current.split("\n"), false);
  if (!ours || !theirs) return null;
  const all = [...ours, ...theirs].sort((x, y) => x.start - y.start || x.end - y.end);
  const out = [];
  const lost = [];
  let done = 0;
  for (let i = 0; i < all.length; ) {
    const region = [all[i++]];
    const start = region[0].start;
    let end = region[0].end;
    for (; i < all.length; i++) {
      const h = all[i];
      if (!(h.start < end || h.start === h.end && start === end && h.start === start)) break;
      region.push(h);
      end = Math.max(end, h.end);
    }
    out.push(...lines.slice(done, start));
    const mineLines = applyHunks(lines, start, end, region.filter((h) => h.mine));
    if (region.every((h) => h.mine === region[0].mine)) out.push(...applyHunks(lines, start, end, region));
    else {
      const theirLines = applyHunks(lines, start, end, region.filter((h) => !h.mine));
      if (mineLines.join("\n") !== theirLines.join("\n")) lost.push(`${at}@${start + 1}`);
      out.push(...mineLines);
    }
    done = end;
  }
  out.push(...lines.slice(done));
  conflicts.push(...lost);
  return out.join("\n");
}

var isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
var canon = (v) => {
  if (v === void 0) return void 0;
  if (Array.isArray(v)) return `[${v.map((x) => canon(x) ?? "null").join(",")}]`;
  if (isObject(v)) {
    return `{${Object.keys(v).filter((k) => v[k] !== void 0).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
};
var same = (a, b) => canon(a) === canon(b);
var byId = (v) => {
  if (!Array.isArray(v)) return null;
  const out = /* @__PURE__ */ new Map();
  for (const item of v) {
    if (!isObject(item) || typeof item.id !== "string" || out.has(item.id)) return null;
    out.set(item.id, item);
  }
  return out;
};
var parseJson = (text) => {
  if (typeof text !== "string") return null;
  try {
    return { value: JSON.parse(text) };
  } catch {
    return null;
  }
};
var layoutLike = (value, like) => {
  if (!like.includes("\n")) return JSON.stringify(value);
  const indent = /\n([ \t]+)\S/.exec(like)?.[1] ?? "  ";
  return JSON.stringify(value, null, indent) + (like.endsWith("\n") ? "\n" : "");
};
function mergeDoc(base, mine, current) {
  if (current === null) return { result: mine, conflicts: [] };
  const conflicts = [];
  const result = mergeValue(base, mine, current, "", conflicts);
  return { result: isObject(result) ? result : mine, conflicts };
}
function mergeWrite(base, mine, current) {
  if (mine === null) return { result: null, conflicts: current === null || same(current, base) ? [] : ["."] };
  if (current === null) return same(mine, base) ? { result: null, conflicts: [] } : { result: mine, conflicts: ["."] };
  return mergeDoc(base, mine, current);
}
function mergeValue(base, mine, current, at, conflicts) {
  if (same(mine, base)) return current;
  if (same(current, base) || same(mine, current)) return mine;
  if (isObject(base) && isObject(mine) && isObject(current)) return mergeObject(base, mine, current, at, conflicts);
  const b = byId(base);
  const m = byId(mine);
  const c = byId(current);
  if (b && m && c) return mergeList(b, m, c, mine, current, at, conflicts);
  if (typeof base === "string" && typeof mine === "string" && typeof current === "string") {
    const text = mergeText(base, mine, current, at || ".", conflicts);
    if (text !== null) return text;
  }
  conflicts.push(at || ".");
  return mine;
}
function mergeObject(base, mine, current, at, conflicts) {
  const out = {};
  const keys = [.../* @__PURE__ */ new Set([...Object.keys(mine), ...Object.keys(current), ...Object.keys(base)])];
  const jsonText = mine.kind === "json" && current.kind === "json" && base.kind === "json";
  for (const k of keys) {
    if (k === "__proto__") continue;
    const where = at ? `${at}.${k}` : k;
    let v;
    const texts = jsonText && k === "text" ? [parseJson(base.text), parseJson(mine.text), parseJson(current.text)] : null;
    if (texts && texts[0] && texts[1] && texts[2] && !same(mine.text, base.text) && !same(current.text, base.text)) {
      const merged = mergeValue(texts[0].value, texts[1].value, texts[2].value, where, conflicts);
      v = same(merged, texts[1].value) ? mine.text : same(merged, texts[2].value) ? current.text : layoutLike(merged, mine.text);
    } else {
      v = mergeValue(base[k], mine[k], current[k], where, conflicts);
    }
    if (v !== void 0) out[k] = v;
  }
  return out;
}
function mergeList(base, mine, current, mineList, currentList, at, conflicts) {
  const merged = /* @__PURE__ */ new Map();
  for (const id of /* @__PURE__ */ new Set([...mine.keys(), ...current.keys(), ...base.keys()])) {
    const v = mergeValue(base.get(id), mine.get(id), current.get(id), `${at}[${id}]`, conflicts);
    if (v !== void 0) merged.set(id, v);
  }
  const order = mineList.map((item) => item.id).filter((id) => merged.has(id));
  currentList.forEach((item, i) => {
    const id = item.id;
    if (!merged.has(id) || order.includes(id)) return;
    let after = -1;
    for (let j = i - 1; j >= 0 && after < 0; j--) after = order.indexOf(currentList[j].id);
    order.splice(after + 1, 0, id);
  });
  return order.map((id) => merged.get(id));
}
var utf8 = new TextDecoder("utf-8", { fatal: true });

import { createHash as createHash3, randomBytes } from "node:crypto";
import fs6 from "node:fs";
import path6 from "node:path";
var HISTORY_DIR = "history";
var INDEX = "index.json";
var OBJECTS = "objects";
var IDLE_MS = 3e4;
var SPAN_MS = 5 * 6e4;
var MAX_VERSIONS = 500;
var MAX_NOTICES = 50;
var NOTICE_DAYS = 7;
var AGENT = { by: "agent", user: { id: "agent", name: "Agent" } };
var SYSTEM = { by: "system", user: { id: "system", name: "" } };
var sha256 = (bytes) => createHash3("sha256").update(bytes).digest("hex");
var SHA = /^[0-9a-f]{64}$/;
var isRecord3 = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
function writeAtomic(file, data) {
  fs6.mkdirSync(path6.dirname(file), { recursive: true });
  const tmp = path6.join(path6.dirname(file), `.${path6.basename(file)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
  try {
    fs6.writeFileSync(tmp, data);
    fs6.renameSync(tmp, file);
  } catch (error) {
    fs6.rmSync(tmp, { force: true });
    throw error;
  }
}
var emptyIndex = () => ({ format: 1, next: 1, base: {}, versions: [], notices: [] });
function readUser(value) {
  return isRecord3(value) && typeof value.id === "string" && typeof value.name === "string" ? { id: value.id, name: value.name } : null;
}
var isAuthor = (value) => value === "human" || value === "agent" || value === "system";
function parseIndex(raw) {
  const index = emptyIndex();
  if (!isRecord3(raw)) return index;
  if (isRecord3(raw.base)) {
    for (const [p, s] of Object.entries(raw.base)) if (typeof s === "string" && SHA.test(s)) index.base[p] = s;
  }
  if (Array.isArray(raw.versions)) {
    for (const v of raw.versions) {
      if (!isRecord3(v) || typeof v.n !== "number" || !isAuthor(v.by) || typeof v.at !== "string" || !isRecord3(v.changes)) continue;
      const user = readUser(v.user);
      if (!user) continue;
      const changes = {};
      for (const [p, s] of Object.entries(v.changes)) if (s === null || typeof s === "string" && SHA.test(s)) changes[p] = s;
      const version = { n: v.n, first: typeof v.first === "string" ? v.first : v.at, at: v.at, by: v.by, user, changes };
      if (typeof v.role === "string") version.role = v.role;
      if (typeof v.restoredFrom === "number") version.restoredFrom = v.restoredFrom;
      if (version.restoredFrom !== void 0 && v.restoredPart === true) version.restoredPart = true;
      if (Array.isArray(v.overwrote)) {
        const list = [];
        for (const o of v.overwrote) {
          const who = isRecord3(o) ? readUser(o.user) : null;
          if (!isRecord3(o) || !who || typeof o.path !== "string" || o.lost !== null && typeof o.lost !== "string" || typeof o.n !== "number" || !isAuthor(o.by)) continue;
          list.push({
            path: o.path,
            lost: o.lost,
            n: o.n,
            by: o.by,
            user: who,
            ...o.soft === true ? { soft: true } : {},
            ...o.chosen === true ? { chosen: true } : {},
            ...typeof o.base === "string" && SHA.test(o.base) ? { base: o.base } : {}
          });
        }
        if (list.length) version.overwrote = list;
      }
      index.versions.push(version);
    }
  }
  index.versions.sort((a, b) => a.n - b.n);
  const last = index.versions.at(-1);
  index.next = Math.max(typeof raw.next === "number" ? raw.next : 1, (last?.n ?? 0) + 1);
  if (Array.isArray(raw.notices)) {
    for (const n of raw.notices) {
      if (!isRecord3(n) || typeof n.id !== "string" || typeof n.to !== "string" || typeof n.path !== "string" || typeof n.n !== "number") continue;
      if (n.kind !== "overwritten" && n.kind !== "overwrote") continue;
      const by = readUser(n.by);
      const lost = isRecord3(n.lost) ? n.lost : null;
      const lostUser = lost ? readUser(lost.user) : null;
      if (!by || !lost || !lostUser || lost.sha !== null && typeof lost.sha !== "string" || typeof lost.n !== "number" || !isAuthor(lost.by)) continue;
      index.notices.push({
        id: n.id,
        to: n.to,
        at: typeof n.at === "string" ? n.at : (/* @__PURE__ */ new Date(0)).toISOString(),
        kind: n.kind,
        path: n.path,
        n: n.n,
        by,
        byAuthor: isAuthor(n.byAuthor) ? n.byAuthor : "human",
        lost: { sha: lost.sha, n: lost.n, by: lost.by, user: lostUser },
        ...n.soft === true ? { soft: true } : {},
        ...typeof n.base === "string" && SHA.test(n.base) ? { base: n.base } : {}
      });
    }
  }
  return index;
}
var History = class {
  dir;
  index;
  /** path → sha: what the files hold after the newest version. */
  headState;
  constructor(root) {
    this.dir = path6.join(root, HISTORY_DIR);
    let raw = null;
    try {
      raw = JSON.parse(fs6.readFileSync(path6.join(this.dir, INDEX), "utf8"));
    } catch {
    }
    this.index = parseIndex(raw);
    this.headState = this.fold(Infinity);
    this.index.notices = this.index.notices.filter((n) => (this.headState.get(n.path) ?? null) !== n.lost.sha);
  }
  get empty() {
    return this.index.versions.length === 0 && Object.keys(this.index.base).length === 0;
  }
  /** What the files hold now, as far as the history knows (path → sha). */
  head() {
    return this.headState;
  }
  versions() {
    return this.index.versions;
  }
  version(n) {
    return this.index.versions.find((v) => v.n === n);
  }
  /** The files after the versions numbered up to `upto` (the base and every version at or below it). */
  fold(upto) {
    const state = new Map(Object.entries(this.index.base));
    for (const version of this.index.versions) {
      if (version.n > upto) break;
      for (const [p, s] of Object.entries(version.changes)) {
        if (s === null) state.delete(p);
        else state.set(p, s);
      }
    }
    return state;
  }
  /** The files right after version `n`; null when it is not kept. */
  stateAt(n) {
    return this.version(n) ? this.fold(n) : null;
  }
  /** The files right before version `n`. */
  stateBefore(n) {
    return this.fold(n - 1);
  }
  /** The content with this sha, from the objects. */
  read(sha) {
    if (!SHA.test(sha)) return null;
    try {
      return fs6.readFileSync(path6.join(this.dir, OBJECTS, sha));
    } catch {
      return null;
    }
  }
  /** Keeps a content that no version holds (an overwrite's `base`); its sha. */
  put(bytes) {
    const sha = sha256(bytes);
    this.putObject(sha, bytes);
    return sha;
  }
  size(sha) {
    if (!SHA.test(sha)) return null;
    try {
      return fs6.statSync(path6.join(this.dir, OBJECTS, sha)).size;
    } catch {
      return null;
    }
  }
  /** The newest version that changed `path`, with what it left there. */
  lastChange(p) {
    for (let i = this.index.versions.length - 1; i >= 0; i--) {
      const version = this.index.versions[i];
      if (p in version.changes) return { version, sha: version.changes[p] };
    }
    return null;
  }
  /**
   * Records changes: path → its content now (null: deleted). Those equal to the head are left out; nothing left, no
   * version (null). The rest join the open version of the same person, or start a new one.
   */
  record(changes, who, extra = {}, now = /* @__PURE__ */ new Date()) {
    const changed = {};
    for (const [p, bytes] of changes) {
      const sha = bytes === null ? null : sha256(bytes);
      if ((this.headState.get(p) ?? null) === sha) continue;
      if (bytes !== null && sha !== null) this.putObject(sha, bytes);
      changed[p] = sha;
    }
    if (Object.keys(changed).length === 0) return null;
    const iso = now.toISOString();
    const last = this.index.versions.at(-1);
    const joins = !!last && who.by !== "system" && last.by === who.by && last.user.id === who.user.id && last.restoredFrom === void 0 && extra.restoredFrom === void 0 && now.getTime() - Date.parse(last.at) < IDLE_MS && now.getTime() - Date.parse(last.first) < SPAN_MS;
    let version;
    if (joins) {
      version = last;
      version.at = iso;
      Object.assign(version.changes, changed);
      if (who.user.name) version.user = { ...who.user };
    } else {
      version = { n: this.index.next++, first: iso, at: iso, by: who.by, user: { ...who.user }, changes: changed };
      if (who.role) version.role = who.role;
      if (extra.restoredFrom !== void 0) version.restoredFrom = extra.restoredFrom;
      if (extra.restoredFrom !== void 0 && extra.restoredPart) version.restoredPart = true;
      this.index.versions.push(version);
    }
    for (const [p, s] of Object.entries(changed)) {
      if (s === null) this.headState.delete(p);
      else this.headState.set(p, s);
    }
    this.index.notices = this.index.notices.filter(
      (n) => !(n.path in changed && (changed[n.path] === n.lost.sha || extra.restoredFrom !== void 0 && n.to === who.user.id))
    );
    if (extra.overwrote?.length) {
      version.overwrote = [...(version.overwrote ?? []).filter((o) => !extra.overwrote.some((x) => x.path === o.path)), ...extra.overwrote];
      this.notify(version, who, extra.overwrote, now);
    }
    this.prune(now);
    this.save();
    return version;
  }
  /** Notices for an overwrite: to whoever lost their change (the agent's go to the owner), and a hard one's saver unless they chose it. */
  notify(version, who, overwrote, now) {
    const at = now.toISOString();
    for (const o of overwrote) {
      const lost = { sha: o.lost, n: o.n, by: o.by, user: o.user };
      const victim = o.by === "agent" ? "local" : o.user.id;
      const fields = {
        at,
        path: o.path,
        n: version.n,
        by: { ...who.user },
        byAuthor: who.by,
        lost,
        ...o.soft ? { soft: true } : {},
        ...o.base ? { base: o.base } : {}
      };
      const same3 = (n) => n.path === o.path && n.n === version.n;
      this.index.notices = this.index.notices.filter((n) => !same3(n));
      if (victim !== who.user.id) this.index.notices.push({ id: randomBytes(6).toString("hex"), to: victim, kind: "overwritten", ...fields });
      if (!o.soft && !o.chosen) this.index.notices.push({ id: randomBytes(6).toString("hex"), to: who.user.id, kind: "overwrote", ...fields });
    }
  }
  /** The notices for this person, newest first. */
  noticesFor(userId) {
    return this.index.notices.filter((n) => n.to === userId).reverse();
  }
  notice(id) {
    return this.index.notices.find((n) => n.id === id);
  }
  /** Dismisses one of this person's notices; false when they have none by that id. */
  dismiss(userId, id) {
    const before = this.index.notices.length;
    this.index.notices = this.index.notices.filter((n) => !(n.id === id && n.to === userId));
    if (this.index.notices.length === before) return false;
    this.save();
    return true;
  }
  /**
   * What to write to bring version `n` back: path → content (null: delete), for `paths` (default: every file it or the
   * head holds), only where the head differs. null when the version is not kept or a content is missing.
   */
  restoreTo(n, paths, tracked = () => true) {
    const target = this.stateAt(n);
    if (!target) return null;
    const out = /* @__PURE__ */ new Map();
    const all = paths ?? [.../* @__PURE__ */ new Set([...target.keys(), ...this.headState.keys()])];
    for (const p of all) {
      if (!tracked(p)) continue;
      const want = target.get(p) ?? null;
      if ((this.headState.get(p) ?? null) === want) continue;
      if (want === null) {
        out.set(p, null);
        continue;
      }
      const bytes = this.read(want);
      if (!bytes) return null;
      out.set(p, bytes);
    }
    return out;
  }
  /** Each version's changes as added, edited or deleted (what the file held before it decides). */
  fileChanges() {
    const out = /* @__PURE__ */ new Map();
    const state = new Map(Object.entries(this.index.base));
    for (const version of this.index.versions) {
      const list = [];
      for (const [p, s] of Object.entries(version.changes)) {
        const had = state.has(p);
        list.push({ path: p, op: s === null ? "deleted" : had ? "edited" : "added" });
        if (s === null) state.delete(p);
        else state.set(p, s);
      }
      out.set(version.n, list);
    }
    return out;
  }
  putObject(sha, bytes) {
    const file = path6.join(this.dir, OBJECTS, sha);
    if (fs6.existsSync(file)) return;
    writeAtomic(file, bytes);
  }
  /** Past MAX_VERSIONS the oldest fold into the base; old notices go; contents no one holds are removed. */
  prune(now) {
    let folded = false;
    while (this.index.versions.length > MAX_VERSIONS) {
      const old = this.index.versions.shift();
      for (const [p, s] of Object.entries(old.changes)) {
        if (s === null) delete this.index.base[p];
        else this.index.base[p] = s;
      }
      folded = true;
    }
    const oldest = now.getTime() - NOTICE_DAYS * 864e5;
    const kept = this.index.versions[0]?.n ?? Infinity;
    const perPerson = /* @__PURE__ */ new Map();
    this.index.notices = this.index.notices.filter((n) => Date.parse(n.at) >= oldest && n.lost.n >= kept).reverse().filter((n) => {
      const count = (perPerson.get(n.to) ?? 0) + 1;
      perPerson.set(n.to, count);
      return count <= MAX_NOTICES;
    }).reverse();
    if (folded) this.collect();
  }
  /** Removes the objects that neither the base, a version nor a notice holds (with the base an overwrite was made on). */
  collect() {
    const keep = new Set(Object.values(this.index.base));
    for (const version of this.index.versions) {
      for (const s of Object.values(version.changes)) if (s) keep.add(s);
      for (const o of version.overwrote ?? []) if (o.base) keep.add(o.base);
    }
    for (const notice of this.index.notices) {
      if (notice.lost.sha) keep.add(notice.lost.sha);
      if (notice.base) keep.add(notice.base);
    }
    let names;
    try {
      names = fs6.readdirSync(path6.join(this.dir, OBJECTS));
    } catch {
      return;
    }
    for (const name of names) if (SHA.test(name) && !keep.has(name)) fs6.rmSync(path6.join(this.dir, OBJECTS, name), { force: true });
  }
  save() {
    writeAtomic(path6.join(this.dir, INDEX), `${JSON.stringify(this.index)}
`);
  }
};
var MAX_DIFF_BYTES = 1024 * 1024;
var CONTEXT = 3;
var MAX_DIFF_LINES = 3e3;
var MAX_LINE = 2e3;
var decoder = new TextDecoder("utf-8", { fatal: true });
function textOf(bytes) {
  if (bytes === null) return null;
  if (bytes.includes(0)) return void 0;
  try {
    return decoder.decode(bytes);
  } catch {
    return void 0;
  }
}
var splitLines = (text) => text === null || text === "" ? [] : text.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n");
function diffContents(before, after) {
  if ((before?.length ?? 0) > MAX_DIFF_BYTES || (after?.length ?? 0) > MAX_DIFF_BYTES) return { tooLarge: true, added: 0, removed: 0, lines: [] };
  const a = textOf(before);
  const b = textOf(after);
  if (a === void 0 || b === void 0) return { binary: true, added: 0, removed: 0, lines: [] };
  const left = splitLines(a);
  const right = splitLines(b);
  let head = 0;
  while (head < left.length && head < right.length && left[head] === right[head]) head++;
  let tail = 0;
  while (tail < left.length - head && tail < right.length - head && left[left.length - 1 - tail] === right[right.length - 1 - tail]) tail++;
  const middle = editScript(left.slice(head, left.length - tail), right.slice(head, right.length - tail));
  if (!middle) return { tooLarge: true, added: 0, removed: 0, lines: [] };
  const ops = [...Array(head).fill("="), ...middle, ...Array(tail).fill("=")];
  const all = [];
  let i = 0;
  let j = 0;
  let added = 0;
  let removed = 0;
  const cut = (s) => s.length > MAX_LINE ? `${s.slice(0, MAX_LINE)}\u2026` : s;
  for (const op of ops) {
    if (op === "=") all.push([" ", cut(right[j++])]), i++;
    else if (op === "-") all.push(["-", cut(left[i++])]), removed++;
    else all.push(["+", cut(right[j++])]), added++;
  }
  const keep = new Uint8Array(all.length);
  all.forEach(([kind], at) => {
    if (kind === " ") return;
    for (let x = Math.max(0, at - CONTEXT); x <= Math.min(all.length - 1, at + CONTEXT); x++) keep[x] = 1;
  });
  const lines = [];
  let skipped = 0;
  let truncated = false;
  for (let at = 0; at < all.length; at++) {
    if (!keep[at]) {
      skipped++;
      continue;
    }
    if (skipped) lines.push(["~", String(skipped)]);
    skipped = 0;
    if (lines.length >= MAX_DIFF_LINES) {
      truncated = true;
      break;
    }
    lines.push(all[at]);
  }
  if (skipped && !truncated) lines.push(["~", String(skipped)]);
  return { added, removed, lines, ...truncated ? { truncated: true } : {} };
}

var whoOf = (viewer) => ({ by: "human", user: { id: viewer.user.id, name: viewer.user.name }, role: viewer.role });
var MAX_BODY = 64 << 10;
var HistoryHost = class {
  history;
  options;
  constructor(options) {
    this.options = options;
    this.history = options.history;
  }
  /** What the page's boot script tells the panel (window.__baoyuHistory); `preview` on a version's preview page. */
  bootGlobal(viewer, preview) {
    const global = { base: this.options.base, canRestore: canEditAs(viewer.role), me: viewer.user.id };
    const version = preview === void 0 ? void 0 : this.history.version(preview);
    if (version) {
      const newest = this.history.versions().at(-1);
      global.preview = { n: version.n, at: version.at, by: version.by, name: version.user.name, current: version === newest, current_url: this.options.base };
    }
    return global;
  }
  notices(viewer, label) {
    const head = this.history.head();
    const gone = (n) => !head.has(n.path) && this.history.version(n.n)?.changes[n.path] === null;
    return this.history.noticesFor(viewer.user.id).map((n) => noticeView(n, label, this.history.version(n.lost.n)?.at, gone(n)));
  }
  list(viewer) {
    const label = this.options.labels();
    const versions = this.history.versions();
    const changes = this.history.fileChanges();
    const newest = versions.at(-1);
    const rows = [...versions].reverse().map((v) => ({
      n: v.n,
      first: v.first,
      at: v.at,
      by: v.by,
      name: v.user.name,
      userId: v.user.id,
      ...v.role ? { role: v.role } : {},
      ...v.restoredFrom !== void 0 ? { restoredFrom: v.restoredFrom } : {},
      ...v.restoredPart ? { restoredPart: true } : {},
      ...v === newest ? { current: true } : {},
      preview: this.options.previewUrl(v.n),
      files: (changes.get(v.n) ?? []).map((c) => ({ path: c.path, op: c.op, label: label(c.path) })),
      ...v.overwrote?.length ? { overwrote: v.overwrote.map((o) => ({ path: o.path, label: label(o.path), name: o.user.name, by: o.by, n: o.n, ...o.soft ? { soft: true } : {} })) } : {}
    }));
    return { me: viewer.user.id, canRestore: canEditAs(viewer.role), rows, notices: this.notices(viewer, label) };
  }
  /** Answers `__history…` (`sub` is what follows it); false for a path it doesn't know. */
  async handle(request, response, sub, viewer) {
    const method = request.method ?? "GET";
    const url = new URL(request.url ?? "/", "http://local");
    if (method === "POST" && !sameOrigin(request)) {
      request.resume();
      sendJson(response, 403, { code: "not_granted", message: "Cross-origin write refused." });
      return true;
    }
    if (method === "GET" && (sub === "" || sub === "/")) return sendJson(response, 200, this.list(viewer)), true;
    if (sub === "/notices") {
      if (method === "GET") return sendJson(response, 200, { notices: this.notices(viewer, this.options.labels()) }), true;
      if (method !== "POST") return sendJson(response, 405, { code: "method_not_allowed", message: "GET or POST" }), true;
      const body = await this.body(request, response);
      if (!body) return true;
      if (typeof body.dismiss !== "string") return sendJson(response, 400, { code: "invalid_argument", message: "Expected {dismiss: id}." }), true;
      this.history.dismiss(viewer.user.id, body.dismiss);
      return sendJson(response, 200, { notices: this.notices(viewer, this.options.labels()) }), true;
    }
    const versionRoute = /^\/(\d+)\/(diff|restore)$/.exec(sub);
    if (versionRoute) {
      const n = Number(versionRoute[1]);
      const version = this.history.version(n);
      if (!version) return sendJson(response, 404, { code: "not_found", message: `There is no version ${n} (it may be too old to keep).` }), true;
      if (versionRoute[2] === "diff") {
        if (method !== "GET") return sendJson(response, 405, { code: "method_not_allowed", message: "GET" }), true;
        const p = url.searchParams.get("path") ?? "";
        if (!(p in version.changes)) return sendJson(response, 404, { code: "not_found", message: `Version ${n} did not change ${p}.` }), true;
        const before = this.history.stateBefore(n).get(p) ?? null;
        const after = version.changes[p] ?? null;
        return sendJson(response, 200, this.diff(p, before, after)), true;
      }
      if (method !== "POST") return sendJson(response, 405, { code: "method_not_allowed", message: "POST" }), true;
      if (!canEditAs(viewer.role)) return sendJson(response, 403, { code: "not_writer", message: "Only the owner and editors can bring a version back." }), true;
      const body = await this.body(request, response);
      if (!body) return true;
      const paths = Array.isArray(body.paths) ? body.paths.filter((p) => typeof p === "string") : void 0;
      const changes = this.history.restoreTo(n, paths, this.options.tracked);
      if (!changes) return sendJson(response, 409, { code: "unavailable", message: `Version ${n} can't be brought back: a file it holds is missing from the history.` }), true;
      const made = await this.options.apply(changes, whoOf(viewer), { restoredFrom: n });
      this.options.log(`history: ${viewer.user.name} brought back version ${n}${paths ? ` (${paths.join(", ")})` : ""}${made ? ` as version ${made.n}` : " (nothing to change)"}`);
      return sendJson(response, 200, { version: made?.n ?? null, changed: [...changes.keys()] }), true;
    }
    const noticeRoute = /^\/notice\/([0-9a-f]{6,32})\/(diff|recover)$/.exec(sub);
    if (noticeRoute) {
      const notice = this.history.notice(noticeRoute[1]);
      if (!notice || notice.to !== viewer.user.id) return sendJson(response, 404, { code: "not_found", message: "No such notice." }), true;
      if (noticeRoute[2] === "diff") {
        if (method !== "GET") return sendJson(response, 405, { code: "method_not_allowed", message: "GET" }), true;
        const now2 = this.history.head().get(notice.path) ?? null;
        const nowBytes = now2 === null ? null : this.history.read(now2);
        const back2 = this.recovered(notice, nowBytes);
        if (now2 && !nowBytes || !back2) return sendJson(response, 200, { path: notice.path, label: this.options.labels()(notice.path), missing: true, added: 0, removed: 0, lines: [], now: now2 }), true;
        return sendJson(response, 200, { ...this.diffBytes(notice.path, nowBytes, back2.bytes), now: now2 }), true;
      }
      if (method !== "POST") return sendJson(response, 405, { code: "method_not_allowed", message: "POST" }), true;
      if (!canEditAs(viewer.role)) return request.resume(), sendJson(response, 403, { code: "not_writer", message: "Only the owner and editors can change the files." }), true;
      const body = await this.body(request, response);
      if (!body) return true;
      const now = this.history.head().get(notice.path) ?? null;
      if ("now" in body && body.now !== now) {
        return sendJson(response, 409, { code: "changed", message: "This changed while you were looking. Compare again." }), true;
      }
      const back = this.recovered(notice, now === null ? null : this.history.read(now));
      if (!back) return sendJson(response, 409, { code: "unavailable", message: "That content is no longer in the history." }), true;
      const made = await this.options.apply(/* @__PURE__ */ new Map([[notice.path, back.bytes]]), whoOf(viewer), { restoredFrom: notice.lost.n, ...back.part ? { restoredPart: true } : {} });
      this.history.dismiss(viewer.user.id, notice.id);
      this.options.log(`history: ${viewer.user.name} brought back ${notice.lost.user.name}'s ${back.bytes === null ? "deletion of " : ""}${notice.path} (version ${notice.lost.n}${back.part ? ", what was replaced" : ""})`);
      return sendJson(response, 200, { version: made?.n ?? null }), true;
    }
    return false;
  }
  /** Before → after of one file, with the versions' names for the panel's header. */
  diff(p, before, after) {
    const read = (sha) => sha === null ? null : this.history.read(sha);
    const a = read(before);
    const b = read(after);
    if (before && !a || after && !b) return { path: p, label: this.options.labels()(p), missing: true, added: 0, removed: 0, lines: [] };
    return this.diffBytes(p, a, b);
  }
  diffBytes(p, a, b) {
    const [x, y] = this.options.diffSides ? this.options.diffSides(p, a, b) : [a, b];
    return { path: p, label: this.options.labels()(p), ...diffContents(x, y) };
  }
  /**
   * What bringing a notice's lost content back writes to its file (`now`: what the file holds): the lost content merged
   * into it when the notice has a base and the server can merge (`part` when that is not the whole lost content), else
   * the whole lost content; a deletion deletes it again (bytes null). null: not in the history.
   */
  recovered(notice, now) {
    if (notice.lost.sha === null) return { bytes: null, part: false };
    const lost = this.history.read(notice.lost.sha);
    if (!lost) return null;
    const base = notice.base ? this.history.read(notice.base) : null;
    const merged = base && this.options.recover ? this.options.recover(notice.path, base, lost, now) : null;
    return merged ? { bytes: merged, part: !merged.equals(lost) } : { bytes: lost, part: false };
  }
  async body(request, response) {
    try {
      const raw = (await readBody(request, MAX_BODY)).toString("utf8");
      const body = raw.trim() ? JSON.parse(raw) : {};
      if (typeof body === "object" && body !== null && !Array.isArray(body)) return body;
    } catch {
    }
    sendJson(response, 400, { code: "invalid_argument", message: "Expected a JSON object." });
    return null;
  }
};
function noticeView(n, label, lostAt, gone) {
  return {
    ...lostAt ? { lostAt } : {},
    id: n.id,
    kind: n.kind,
    at: n.at,
    path: n.path,
    label: label(n.path),
    n: n.n,
    name: n.by.name,
    by: n.byAuthor,
    lostName: n.lost.user.name,
    lostBy: n.lost.by,
    lostN: n.lost.n,
    ...n.soft ? { soft: true } : {},
    // Bringing it back puts back only what was replaced (a write with a base); into a deleted file, all of it.
    ...n.base && !gone ? { part: true } : {},
    ...gone ? { removed: true } : {},
    // What was replaced is a deletion: bringing it back deletes the file again.
    ...n.lost.sha === null ? { deleted: true } : {}
  };
}
var plain = (text) => ({ en: text, zh: text });

var OVERLAP_MS = 6e4;
var docBytes = (data) => Buffer.from(`${JSON.stringify(data, null, 2)}
`);
var parse = (bytes) => {
  if (bytes === null) return null;
  try {
    const value = JSON.parse(bytes.toString("utf8"));
    return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
};
var same2 = (a, b) => JSON.stringify(a) === JSON.stringify(b);
var DbHistory = class {
  history;
  host;
  options;
  /**
   * Document → who is writing it from the page, and what the write is (a restore; a merged write: the document it was
   * made on and the values in it that replaced someone else's), until the rescan after it.
   */
  pending;
  /** The first rescan also looks for documents deleted while no server ran. */
  first;
  constructor(options) {
    this.options = options;
    this.history = new History(options.root);
    this.pending = /* @__PURE__ */ new Map();
    this.first = true;
    this.host = new HistoryHost({
      history: this.history,
      labels: () => {
        const named = options.labels();
        return (p) => named(p) ?? plain(p);
      },
      base: options.base,
      previewUrl: (n) => `${options.base}?at=${n}`,
      apply: async (changes, who, extra) => this.apply(changes, who, extra),
      tracked: options.tracked,
      diffSides: textSides,
      recover: (_path, base, lost, now) => {
        const b = parse(base);
        const l = parse(lost);
        const n = parse(now);
        if (!b || !l) return null;
        return n ? docBytes(mergeDoc(b, l, n).result) : lost;
      },
      log: options.log
    });
  }
  /**
   * A page's write of `path` by `who`, until `settle`: the rescan in between records it as theirs. `merge`: the write was
   * merged (mergeDoc) from this base, and these are the values in it that replaced someone else's (empty: nothing lost).
   */
  attribute(path9, who, merge) {
    this.pending.set(path9, { who, ...merge ? { merge } : {} });
  }
  /** After the page's write and its rescan (the write may have changed nothing, or failed). */
  settle(path9) {
    this.pending.delete(path9);
  }
  /** Records the rescan's changes; `present` says which documents are on disk now (for the first rescan). */
  record(changes, present) {
    const groups = /* @__PURE__ */ new Map();
    const fallback = this.history.empty ? SYSTEM : AGENT;
    const add = (who, restore, p, bytes, merge) => {
      const key = `${who.by}\0${who.user.id}\0${restore.restoredFrom ?? ""}\0${restore.restoredPart ? "part" : ""}`;
      let group = groups.get(key);
      if (!group) groups.set(key, group = { who, restore, files: /* @__PURE__ */ new Map(), merged: /* @__PURE__ */ new Map() });
      group.files.set(p, bytes);
      if (merge) group.merged.set(p, merge);
    };
    for (const c of changes) {
      if (!this.options.tracked(c.path)) continue;
      const by = this.pending.get(c.path);
      const restore = by?.restoredFrom !== void 0 ? { restoredFrom: by.restoredFrom, ...by.restoredPart ? { restoredPart: true } : {} } : {};
      add(by?.who ?? fallback, restore, c.path, c.data === null ? null : docBytes(c.data), by?.merge);
    }
    if (this.first) {
      this.first = false;
      for (const p of this.history.head().keys()) if (this.options.tracked(p) && !present(p) && !changes.some((c) => c.path === p)) add(fallback, {}, p, null);
    }
    const made = [];
    for (const group of groups.values()) {
      const overwrote = group.who.by !== "system" && group.restore.restoredFrom === void 0 ? this.overlaps(group.files, group.who, group.merged) : [];
      const version = this.history.record(group.files, group.who, { ...group.restore, ...overwrote.length ? { overwrote } : {} });
      if (!version) continue;
      made.push(version);
      if (group.who.by !== "human") {
        const what = group.who.by === "agent" ? "changed outside the page" : "the documents as they were";
        this.options.log(`history: version ${version.n} (${what}): ${[...group.files.keys()].join(", ")}`);
      }
    }
    return made;
  }
  /**
   * Whose values on these documents this change replaced. A merged write says (`merged`: path → its base and the values
   * it replaced; the notice goes to the person behind the document's last version, when that is someone else, and keeps
   * the base so bringing the lost values back leaves the rest; chosen when its person saw that version and saved over
   * it). Otherwise a guess, for a change another person made in
   * the last minute: part of it is gone when merging it (the document before it → theirs) into this one changes this
   * one. The document before it is the notice's base. Their change a deletion: it is gone when the document is back.
   */
  overlaps(files, who, merged) {
    const now = Date.now();
    const out = [];
    for (const [p, bytes] of files) {
      const last = this.history.lastChange(p);
      if (!last) continue;
      const v = last.version;
      if (v.by !== "human" || v.user.id === who.user.id || v.restoredFrom !== void 0) continue;
      if ((this.history.head().get(p) ?? null) !== last.sha) continue;
      const lost = { path: p, lost: last.sha, n: v.n, by: "human", user: { ...v.user }, soft: true };
      const merge = merged.get(p);
      if (merge) {
        if (!merge.conflicts.length) continue;
        const { soft: _soft, ...hard } = lost;
        const over = merge.chosen ? { ...hard, chosen: true } : lost;
        out.push(last.sha === null ? over : { ...over, base: this.history.put(docBytes(merge.base)) });
        continue;
      }
      if (now - Date.parse(v.at) > OVERLAP_MS) continue;
      if (last.sha === null) {
        if (bytes !== null) out.push(lost);
        continue;
      }
      const theirs = parse(this.history.read(last.sha));
      const was = parse(this.history.read(this.history.stateBefore(v.n).get(p) ?? "") ?? null) ?? {};
      const next = parse(bytes) ?? {};
      if (!theirs || same(mergeDoc(was, theirs, next).result, next)) continue;
      out.push({ ...lost, base: this.history.stateBefore(v.n).get(p) ?? this.history.put(docBytes({})) });
    }
    return out;
  }
  /** A restore (or a recovered notice): writes the documents as `who`'s; the rescan after records them. */
  apply(changes, who, extra) {
    const paths = [];
    try {
      for (const [p, bytes] of changes) {
        const data = bytes === null ? null : parse(bytes);
        if (bytes !== null && data === null) continue;
        this.pending.set(p, { who, ...extra.restoredFrom !== void 0 ? { restoredFrom: extra.restoredFrom, ...extra.restoredPart ? { restoredPart: true } : {} } : {} });
        paths.push(p);
        this.options.write(p, data);
      }
      this.options.rescan();
      const versions = this.history.versions();
      const newest = versions.at(-1);
      return newest && newest.user.id === who.user.id && newest.restoredFrom === extra.restoredFrom && paths.some((p) => p in newest.changes) ? newest : null;
    } finally {
      for (const p of paths) this.pending.delete(p);
    }
  }
  /**
   * On a version's page (?at=n): the documents as that version left them in place of the kept ones now, the page's
   * own as they are. null: there is no such version.
   */
  docsAt(n, current) {
    const state = this.history.stateAt(n);
    if (!state) return null;
    const out = /* @__PURE__ */ new Map();
    for (const [p, data] of current) if (!this.options.tracked(p)) out.set(p, data);
    for (const [p, sha] of state) {
      if (!this.options.tracked(p)) continue;
      const data = parse(this.history.read(sha));
      if (data) out.set(p, data);
    }
    return out;
  }
  /** window.__baoyuHistory for this person; `query` is the page's (?at=n on a version's page). */
  bootGlobal(viewer, query) {
    return this.host.bootGlobal(viewer, previewOf(query));
  }
};
function previewOf(query) {
  const at = query.get("at");
  return at !== null && /^\d{1,9}$/.test(at) ? Number(at) : void 0;
}
function textSides(_path, before, after) {
  const a = parse(before);
  const b = parse(after);
  const textOf2 = (d) => d && typeof d.text === "string" ? d.text : null;
  const rest = (d) => {
    if (!d) return null;
    const { text: _text, ...others } = d;
    return others;
  };
  const ta = textOf2(a);
  const tb = textOf2(b);
  if ((ta !== null || a === null) && (tb !== null || b === null) && (a === null || b === null || same2(rest(a), rest(b)))) {
    return [ta === null ? null : Buffer.from(ta), tb === null ? null : Buffer.from(tb)];
  }
  return [before, after];
}

var PEER_ID = /^[A-Za-z0-9_-]{8,64}$/;
function agentWhere(main2, count, label) {
  const where = main2 ? label(main2) : null;
  if (!where || count <= 1) return where;
  return { en: `${where.en} and ${count - 1} more`, zh: `${where.zh} \u7B49 ${count} \u5904` };
}
var AGENT_COLOR = "#d25f25";
var MAX_PEERS = 64;
var MAX_PATCH_BYTES = 16 << 10;
var MAX_FIELDS = 12;
var MAX_PRESENCE_BYTES = 6 << 10;
var BROADCAST_MS = 50;
var LEAVE_GRACE_MS = 4e3;
var AGENT_LINGER_MS = 2e4;
var AGENT_PEER = "agent-claude";
var PresenceHub = class {
  peers = /* @__PURE__ */ new Map();
  listeners = /* @__PURE__ */ new Set();
  agent = null;
  timer = null;
  /** Adds a page's stream; `send` writes one SSE frame to it. Returns what to call when the stream closes. */
  join(peer, viewer, send) {
    let entry = this.peers.get(peer);
    if (entry && entry.viewer.user.id !== viewer.user.id) {
      entry = void 0;
      peer = "";
    }
    if (peer && !entry && this.peers.size < MAX_PEERS) {
      entry = { viewer, presence: {}, updatedAt: Date.now(), streams: 0 };
      this.peers.set(peer, entry);
    }
    if (entry) {
      entry.streams += 1;
      if (entry.leaving) clearTimeout(entry.leaving);
      entry.leaving = void 0;
    }
    this.listeners.add(send);
    send(this.frame());
    this.schedule();
    let open2 = true;
    return () => {
      if (!open2) return;
      open2 = false;
      this.listeners.delete(send);
      if (!entry) return;
      entry.streams -= 1;
      if (entry.streams > 0) return;
      const leaving = entry;
      leaving.leaving = setTimeout(() => {
        if (this.peers.get(peer) === leaving && leaving.streams === 0) {
          this.peers.delete(peer);
          this.schedule();
        }
      }, LEAVE_GRACE_MS);
      leaving.leaving.unref?.();
    };
  }
  /** Merges a page's patch into its presence; false when the peer isn't this person's open page or the patch is bad. */
  update(peer, viewer, patch) {
    const entry = this.peers.get(peer);
    if (!entry || entry.viewer.user.id !== viewer.user.id) return false;
    if (typeof patch !== "object" || patch === null || Array.isArray(patch)) return false;
    const next = { ...entry.presence };
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === void 0) delete next[key];
      else next[key] = value;
    }
    if (Object.keys(next).length > MAX_FIELDS || Buffer.byteLength(JSON.stringify(next)) > MAX_PRESENCE_BYTES) return false;
    entry.presence = next;
    entry.updatedAt = Date.now();
    this.schedule();
    return true;
  }
  /** The agent changed the artifact: it shows on the list (with `context`, where it worked) for a while. */
  agentActive(agent = {}) {
    if (this.agent) clearTimeout(this.agent.timer);
    const presence = { who: { n: agent.name ?? "Agent", c: AGENT_COLOR } };
    if (agent.context) presence.context = agent.context;
    if (agent.where) presence.where = agent.where;
    const timer = setTimeout(() => {
      this.agent = null;
      this.schedule();
    }, AGENT_LINGER_MS);
    timer.unref?.();
    this.agent = { presence, updatedAt: Date.now(), timer };
    this.schedule();
  }
  /** Everyone on the list now. */
  list() {
    const views = [];
    for (const [peer, entry] of this.peers) {
      const who = entry.presence.who;
      const presence = { ...entry.presence, who: { ...typeof who === "object" && who !== null && !Array.isArray(who) ? who : {}, n: entry.viewer.user.name } };
      views.push({ peer, by: entry.viewer.user.id, name: entry.viewer.user.name, role: entry.viewer.role, presence, updatedAt: entry.updatedAt });
    }
    if (this.agent) {
      const name = String(this.agent.presence.who.n ?? "Agent");
      views.push({ peer: AGENT_PEER, by: "agent", name, kind: "agent", presence: this.agent.presence, updatedAt: this.agent.updatedAt });
    }
    return views;
  }
  /** Answers POST `__presence` ({peer, patch}); GET gives the list. */
  async handle(request, response, viewer) {
    const method = request.method ?? "GET";
    if (method === "GET") return sendJson(response, 200, { peers: this.list() });
    if (method !== "POST") {
      request.resume();
      return sendJson(response, 405, { code: "method_not_allowed", message: "GET or POST" });
    }
    if (!sameOrigin(request)) {
      request.resume();
      return sendJson(response, 403, { code: "not_granted", message: "Cross-origin write refused." });
    }
    let body;
    try {
      body = JSON.parse((await readBody(request, MAX_PATCH_BYTES)).toString("utf8"));
    } catch {
      return sendJson(response, 400, { code: "invalid_argument", message: `Expected {peer, patch} under ${MAX_PATCH_BYTES} bytes.` });
    }
    const { peer, patch } = typeof body === "object" && body !== null ? body : {};
    if (typeof peer !== "string" || !PEER_ID.test(peer)) return sendJson(response, 400, { code: "invalid_argument", message: "Expected {peer, patch}." });
    if (!this.update(peer, viewer, patch)) return sendJson(response, 409, { code: "not_joined", message: "That page is not open here (its event stream is closed)." });
    response.writeHead(204, { "Cache-Control": "no-store" }).end();
  }
  /** Ends the timers (the server is closing). */
  close() {
    if (this.timer) clearTimeout(this.timer);
    if (this.agent) clearTimeout(this.agent.timer);
    for (const entry of this.peers.values()) if (entry.leaving) clearTimeout(entry.leaving);
    this.peers.clear();
    this.listeners.clear();
  }
  frame() {
    return `event: peers
data: ${JSON.stringify({ peers: this.list() })}

`;
  }
  schedule() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      const frame = this.frame();
      for (const send of this.listeners) send(frame);
    }, BROADCAST_MS);
    this.timer.unref?.();
  }
};

async function shareCall(url, action, fail2) {
  const response = await fetch(new URL("/__share", url), action ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) } : {});
  const body = await response.json().catch(() => ({}));
  if (!response.ok) fail2("SHARE_REFUSED", String(body.message ?? `the server answered ${response.status}`));
  return body;
}
function rolesOf(flags, key, fail2) {
  const given = flags.get(key);
  if (given === void 0) return [];
  const roles = given === "all" || given === "true" ? [...GUEST_ROLES] : given.split(",").map((r) => r.trim());
  for (const role of roles) if (!isGuestRole(role)) fail2("INVALID_ROLE", `--${key}: editor, commenter, viewer or all (got ${role}).`);
  return roles;
}
function guestRoles(flags, fail2) {
  const given = flags.get("role");
  if (given === void 0) return [];
  return given.split(",").map((pair) => {
    const [guest = "", role = ""] = pair.split("=").map((part) => part.trim());
    if (!guest || !isGuestRole(role)) fail2("INVALID_ROLE", `--role: <guest id>=editor|commenter|viewer, comma separated (got ${pair}).`);
    return { action: "role", guest, role };
  });
}
async function shareCommand(o) {
  const off = o.flags.has("off");
  const changes = [
    ...rolesOf(o.flags, "reset", o.fail).map((role) => ({ action: "reset", role })),
    ...rolesOf(o.flags, "enable", o.fail).map((role) => ({ action: "link", role, on: true })),
    ...rolesOf(o.flags, "disable", o.fail).map((role) => ({ action: "link", role, on: false })),
    ...guestRoles(o.flags, o.fail)
  ];
  let server = await o.running();
  if (!server) {
    const sharing = new Sharing(o.root);
    for (const change of changes) {
      if (change.action === "reset") sharing.resetLink(change.role);
      else if (change.action === "role") {
        if (!sharing.setRole(String(change.guest), change.role)) o.fail("SHARE_REFUSED", `No guest ${String(change.guest)}, or the ${String(change.role)} link is off.`);
      } else sharing.setLink(change.role, change.on === true);
    }
    if (off) {
      sharing.setLan(false);
      return { lan: false, message: "Not shared on the local network. Guests already in get their place back when it is shared again (unless their link was reset)." };
    }
    server = await o.startShared();
    if (!server) o.fail("SERVER_FAILED", `The server did not start. Run ${o.serveCommand} in the foreground to see why.`);
  }
  let view = await shareCall(server.url, null, o.fail);
  for (const change of changes) view = await shareCall(server.url, change, o.fail);
  if (off || !view.lan) view = await shareCall(server.url, { action: "lan", on: !off }, o.fail);
  const links = view.links;
  const shown2 = (list) => Object.fromEntries(Object.entries(list).map(([role, link]) => [role, link.on ? link.url : "off"]));
  const tailnet = view.lan ? view.tailnet : void 0;
  return {
    lan: view.lan,
    ...view.lan ? { addresses: lanUrls(view) } : {},
    links: shown2(links),
    ...tailnet ? {
      tailscale: shown2(tailnet.links),
      tailscaleNote: `This computer has a Tailscale address (${tailnet.address}): the tailscale links open the same roles for people on your tailnet, from any network. Use the links above for people on this Wi-Fi or LAN.`
    } : {},
    guests: view.guests,
    ...view.lan ? {
      note: "Send the link for the role you want to give: editor edits, commenter comments, viewer reads. Anyone on this network with a link joins under a name they type. The owner (this computer) shares from the Share button too.",
      security: "It is plain http: others on the network can read what passes. A link is the permission: whoever has it gets its role, so send it only to the people meant to have it, and reset a role's link if it went further.",
      stop: o.offCommand
    } : { note: "Not shared on the network: the links work on this computer only." }
  };
}
var lanUrls = (view) => (Array.isArray(view.addresses) ? view.addresses : []).map((a) => `http://${String(a)}:${String(view.port)}/`);
async function lanOn(url, flags, fail2) {
  if (!flags.has("lan")) return {};
  return { lan: lanUrls(await shareCall(url, { action: "lan", on: true }, fail2)) };
}

var SCRIPT = fileURLToPath(import.meta.url);
var SKILL_DIR = path8.dirname(path8.dirname(SCRIPT));
var EDITOR_DIR = path8.join(path8.dirname(SCRIPT), "editor");
var LOCAL_USER_ID = "local";
var MAX_DOC_BYTES = 256 * 1024;
var MAX_TEXT_BYTES = 200 * 1024;
var MAX_MODULES = 48;
var MAX_MODULES_BYTES = 2 * 1024 * 1024;
var MAX_ASSETS = 96;
var MAX_DATA_BYTES = 64 * 1024 * 1024;
var MAX_FILM_SECONDS = 300;
var MAX_BATCH_WRITES = 50;
var MAX_BATCH_BYTES = 1024 * 1024;
var SEGMENT = /^(?!\.\.?$)[A-Za-z0-9_\-.~:@+]{1,200}$/;
var DOC_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}(?:~[0-9]{1,2})?$/;
var SCENE_ID = /^[a-z][a-z0-9-]{0,31}$/;
var MODULE_KINDS = /* @__PURE__ */ new Set(["css", "html", "js", "json", "text"]);
var ASSET_MIMES = /* @__PURE__ */ new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml", "font/woff2", "font/woff", "font/ttf", "font/otf", "video/mp4", "video/webm"]);
var RESERVED = /* @__PURE__ */ new Set(["__proto__", "constructor", "prototype"]);
var BLOB_URL = /^\/?_blob\/([0-9a-f]{32})$/;
var BLOB_ID = /^[0-9a-f]{32}$/;
var CONTENT_TYPES = {
  csv: "text/csv; charset=utf-8",
  tsv: "text/tab-separated-values; charset=utf-8",
  tab: "text/tab-separated-values; charset=utf-8",
  json: "application/json; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  html: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  woff2: "font/woff2",
  woff: "font/woff",
  ttf: "font/ttf",
  otf: "font/otf",
  mp4: "video/mp4",
  webm: "video/webm",
  pdf: "application/pdf"
};
var CliError = class extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
};
var isObject2 = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
var bytesOf = (value) => Buffer.byteLength(JSON.stringify(value), "utf8");
var kb = (n) => n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`;
var extOf = (name) => path8.extname(name).slice(1).toLowerCase();
var contentTypeOf = (name) => CONTENT_TYPES[extOf(name)] ?? "application/octet-stream";
var quote = (s) => /^[A-Za-z0-9_./:@%+=-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`;
var cmd = (name, ...args) => ["node", quote(SCRIPT), name, ...args.map(quote)].join(" ");
function print(value, compact = false) {
  process.stdout.write(`${compact ? JSON.stringify(value) : JSON.stringify(value, null, 2)}
`);
}
var SWITCHES = /* @__PURE__ */ new Set(["text", "json", "lan", "off"]);
function parseArgs(argv) {
  const positional = [];
  const flags = /* @__PURE__ */ new Map();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      if (eq > 0) flags.set(arg.slice(2, eq), arg.slice(eq + 1));
      else if (i + 1 < argv.length && !argv[i + 1].startsWith("--") && !SWITCHES.has(arg.slice(2))) flags.set(arg.slice(2), argv[++i]);
      else flags.set(arg.slice(2), "true");
    } else positional.push(arg);
  }
  return { positional, flags };
}
function writeFileAtomic(file, data) {
  fs9.mkdirSync(path8.dirname(file), { recursive: true });
  const tmp = path8.join(path8.dirname(file), `.tmp-${process.pid}-${Date.now()}-${path8.basename(file)}`);
  fs9.writeFileSync(tmp, data);
  fs9.renameSync(tmp, file);
}
function resolveRoot(given, { create = false } = {}) {
  if (!given) throw new CliError("MISSING_ROOT", "Give the film folder (for example designs/<slug>).");
  const root = path8.resolve(given);
  const stat = fs9.statSync(root, { throwIfNoEntry: false });
  if (stat && !stat.isDirectory()) throw new CliError("NOT_A_FOLDER", `${given} is a file; the film is a folder.`);
  if (!stat) {
    if (!create) throw new CliError("NOT_FOUND", `${root} does not exist. Write the film first: ${cmd("write-db", given, "batch.json")}.`);
    fs9.mkdirSync(root, { recursive: true });
  }
  return root;
}
function splitPath(p, what) {
  const clean = String(p ?? "").replace(/^\/+|\/+$/g, "");
  const segs = clean === "" ? [] : clean.split("/");
  if (segs.length === 0 || segs.length > 16 || !segs.every((s) => SEGMENT.test(s))) {
    throw new CliError("INVALID_PATH", `${JSON.stringify(p)} is not a ${what} path: "/"-separated segments of letters, digits and _ - . ~ : @ +.`);
  }
  if (segs[0] === "data" && segs[1] === "users" && segs[2] === "me") segs[2] = LOCAL_USER_ID;
  return segs;
}
function docSegments(p) {
  const segs = splitPath(p, "document");
  if (segs.length % 2 !== 0) throw new CliError("INVALID_PATH", `${p} names a collection; a document path is collection/doc_id (for example modules/scenes.json).`);
  return segs;
}
var docFile = (root, segs) => path8.join(root, "db", ...segs.slice(0, -1), `${segs.at(-1)}.json`);
function listDocFiles(root) {
  const out = /* @__PURE__ */ new Map();
  const base = path8.join(root, "db");
  const walk = (dir, rel) => {
    let entries;
    try {
      entries = fs9.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      const full = path8.join(dir, e.name);
      if (e.isDirectory()) walk(full, [...rel, e.name]);
      else if (e.isFile() && e.name.endsWith(".json")) {
        const segs = [...rel, e.name.slice(0, -5)];
        if (segs.length % 2 !== 0 || !segs.every((s) => SEGMENT.test(s))) continue;
        out.set(segs.join("/"), { file: full });
      }
    }
  };
  walk(base, []);
  return out;
}
function readDoc(root, p) {
  const segs = docSegments(p);
  const file = docFile(root, segs);
  let text;
  try {
    text = fs9.readFileSync(file, "utf8");
  } catch {
    return { path: segs.join("/"), exists: false, file };
  }
  try {
    const data = JSON.parse(text);
    if (!isObject2(data)) throw new Error("not an object");
    return { path: segs.join("/"), exists: true, data, file, bytes: Buffer.byteLength(text) };
  } catch (error) {
    throw new CliError("DAMAGED_DOCUMENT", `${file} is not a JSON object (${error.message}). Rewrite it with set.`);
  }
}
function readAllDocs(root) {
  const docs = /* @__PURE__ */ new Map();
  const damaged = [];
  for (const [p, { file }] of listDocFiles(root)) {
    try {
      const data = JSON.parse(fs9.readFileSync(file, "utf8"));
      if (isObject2(data)) docs.set(p, data);
      else damaged.push(p);
    } catch {
      damaged.push(p);
    }
  }
  return { docs, damaged };
}
var isDeleteMarker = (v) => v === null || isObject2(v) && v.__delete__ === true && Object.keys(v).length === 1;
function mergePatch(target, patch) {
  const out = isObject2(target) ? { ...target } : {};
  for (const [k, v] of Object.entries(patch)) {
    if (k === "__proto__") continue;
    if (isDeleteMarker(v)) delete out[k];
    else if (isObject2(v)) out[k] = mergePatch(out[k], v);
    else out[k] = v;
  }
  return out;
}
function hasDeleteMarker(v) {
  if (Array.isArray(v)) return v.some(hasDeleteMarker);
  if (!isObject2(v)) return false;
  if (v.__delete__ === true) return true;
  return Object.values(v).some(hasDeleteMarker);
}
function documentProblem(segs, data) {
  const p = segs.join("/");
  const bytes = bytesOf(data);
  if (bytes > MAX_DOC_BYTES) return `${p} would be ${kb(bytes)}; the store refuses any document over 256 KB.`;
  if (segs.length !== 2) return null;
  const [collection, id] = segs;
  if (["modules", "assets"].includes(collection) && (!DOC_NAME.test(id) || RESERVED.has(id))) {
    return `${p}: a name is a letter or digit, then letters, digits, _ . - (64 at most).`;
  }
  if (collection === "film" && id === "meta" && (typeof data.title !== "string" || data.title.trim() === "")) return "film/meta needs {v: 1, title, updatedAt}: the film's name in title.";
  if (collection === "film" && id === "script") {
    if (typeof data.code !== "string") return 'film/script needs {code}: the cut, "window.CUT = kit.scenes();".';
    if (Buffer.byteLength(data.code) > MAX_TEXT_BYTES) return "film/script is over 200 KiB; move code into modules.";
  }
  if (collection === "modules") {
    if (!MODULE_KINDS.has(data.kind)) return `${p} needs kind: css, html, js, json or text.`;
    if (typeof data.text !== "string") return `${p} needs {kind, text}: the whole module as a string in text.`;
    if (Buffer.byteLength(data.text) > MAX_TEXT_BYTES) return `${p} is over 200 KiB; split it (film-api.md \u00a71).`;
  }
  if (collection === "assets") {
    if (typeof data.ref !== "string" || !(BLOB_URL.test(data.ref) || data.ref.startsWith("data:"))) return `${p} needs ref: the upload's /_blob/<id> (or a small data: URI).`;
    if (!ASSET_MIMES.has(data.mime)) return `${p} needs mime, exactly one of ${[...ASSET_MIMES].join(", ")} (the player drops any other).`;
  }
  return null;
}
function resolveFileRefs(value, where) {
  if (Array.isArray(value)) return value.map((v, i) => resolveFileRefs(v, `${where}[${i}]`));
  if (!isObject2(value)) return value;
  const keys = Object.keys(value);
  if (keys.length === 1 && keys[0] === "$file") {
    const file = path8.resolve(String(value.$file));
    try {
      return fs9.readFileSync(file, "utf8");
    } catch {
      throw new CliError("FILE_NOT_FOUND", `${where}: {"$file": ${JSON.stringify(value.$file)}} \u2014 no such file (paths are relative to ${process.cwd()}).`);
    }
  }
  return Object.fromEntries(keys.map((k) => [k, resolveFileRefs(value[k], `${where}.${k}`)]));
}
function applyWrites(root, writes, { agent = true } = {}) {
  if (!Array.isArray(writes) || writes.length === 0) throw new CliError("EMPTY_BATCH", "The batch has no writes.");
  if (writes.length > MAX_BATCH_WRITES) throw new CliError("BATCH_TOO_LARGE", `${writes.length} writes; a batch is at most ${MAX_BATCH_WRITES}. Split it.`);
  const planned = [];
  const seen = /* @__PURE__ */ new Set();
  let total = 0;
  writes.forEach((w, i) => {
    const where = `writes[${i}]`;
    if (!isObject2(w)) throw new CliError("INVALID_WRITE", `${where} is not an object.`);
    const op = w.op;
    if (!["set", "update", "delete"].includes(op)) throw new CliError("INVALID_WRITE", `${where}.op is ${JSON.stringify(op)}; use set, update or delete.`);
    const given = w.path ?? (w.collection !== void 0 && w.doc_id !== void 0 ? `${w.collection}/${w.doc_id}` : void 0);
    if (given === void 0) throw new CliError("INVALID_WRITE", `${where} names no document: give "path": "collection/doc_id" (or "collection" and "doc_id").`);
    let segs;
    try {
      segs = docSegments(given);
    } catch (error) {
      throw new CliError(error.code, `${where}: ${error.message}`);
    }
    const p = segs.join("/");
    if (agent && segs[0] === "data" && segs[1] === "users") throw new CliError("READ_ONLY_PATH", `${where}: ${p} is written by the open page; you only read it.`);
    if (seen.has(p)) throw new CliError("DUPLICATE_DOCUMENT", `${where}: ${p} appears twice; address each document once per batch.`);
    seen.add(p);
    let data;
    if (op !== "delete") {
      if (w.data === void 0 === (w.file_path === void 0)) throw new CliError("INVALID_WRITE", `${where} (${op}) needs exactly one of "data" or "file_path".`);
      if (w.file_path !== void 0) {
        try {
          data = JSON.parse(fs9.readFileSync(path8.resolve(String(w.file_path)), "utf8"));
        } catch (error) {
          throw new CliError("INVALID_WRITE", `${where}.file_path ${JSON.stringify(w.file_path)}: ${error.code === "ENOENT" ? "no such file" : `not JSON (${error.message})`}.`);
        }
      } else data = w.data;
      if (!isObject2(data)) throw new CliError("INVALID_WRITE", `${where}.data must be a JSON object (the document's fields).`);
      data = agent ? resolveFileRefs(data, `${where}.data`) : data;
      if (op === "set" && hasDeleteMarker(data)) throw new CliError("INVALID_WRITE", `${where}: {"__delete__": true} works only in an update; set writes the whole document.`);
    }
    const file = docFile(root, segs);
    const existing = fs9.existsSync(file) ? readDoc(root, p) : { exists: false };
    let next = null;
    if (op === "set") next = data;
    else if (op === "update") next = mergePatch(existing.exists ? existing.data : {}, data);
    if (next !== null) {
      const problem = documentProblem(segs, next);
      if (problem) throw new CliError("REFUSED", `${where}: ${problem}`);
      total += bytesOf(next);
    }
    planned.push({ op, path: p, file, next, created: !existing.exists && op !== "delete", existed: existing.exists });
  });
  if (total > MAX_BATCH_BYTES) throw new CliError("BATCH_TOO_LARGE", `The batch writes ${kb(total)}; a batch is at most 1 MB. Split it.`);
  for (const w of planned) {
    if (w.op === "delete") fs9.rmSync(w.file, { force: true });
    else writeFileAtomic(w.file, `${JSON.stringify(w.next, null, 2)}
`);
  }
  return planned.map((w) => ({
    op: w.op,
    path: w.path,
    ...w.next !== null ? { bytes: bytesOf(w.next) } : {},
    ...w.created ? { created: true } : {},
    ...w.op === "delete" && !w.existed ? { note: "there was no such document" } : {}
  }));
}
var blobFile = (root, id) => path8.join(root, "_blobs", id);
function readBlobMeta(root, id) {
  try {
    return JSON.parse(fs9.readFileSync(`${blobFile(root, id)}.json`, "utf8"));
  } catch {
    return null;
  }
}
function putBlob(root, bytes, name, contentType) {
  const id = createHash("sha256").update(bytes).digest("hex").slice(0, 32);
  const file = blobFile(root, id);
  if (!fs9.existsSync(file)) writeFileAtomic(file, bytes);
  const meta = { name, contentType, bytes: bytes.length, uploadedAt: (/* @__PURE__ */ new Date()).toISOString() };
  writeFileAtomic(`${file}.json`, `${JSON.stringify(meta, null, 2)}
`);
  return { url: `/_blob/${id}`, id, name, bytes: bytes.length, contentType };
}
function upload(root, given, flags) {
  if (!given) throw new CliError("MISSING_FILE", "Give the file to upload (an image, font or video clip).");
  const file = path8.resolve(given);
  const stat = fs9.statSync(file, { throwIfNoEntry: false });
  if (!stat) throw new CliError("FILE_NOT_FOUND", `No such file: ${given}`);
  if (!stat.isFile()) throw new CliError("NOT_A_FILE", `${given} is not a regular file.`);
  if (stat.size > MAX_DATA_BYTES) {
    throw new CliError("FILE_TOO_LARGE", `${given} is ${kb(stat.size)}; an upload over 64 MB is refused. Trim or compress it first.`);
  }
  const name = flags.get("name") ?? path8.basename(file);
  const type = flags.get("type") ?? contentTypeOf(name);
  const result = putBlob(root, fs9.readFileSync(file), name, type);
  const mime = result.contentType;
  const asset = name.replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^[^A-Za-z0-9]+/, "").slice(0, 64) || "asset";
  return {
    ...result,
    next: ASSET_MIMES.has(mime) ? `Write assets/${asset} {"ref": ${JSON.stringify(result.url)}, "mime": ${JSON.stringify(mime)}} (w and h optional) with write-db; the cut reads it as kit.assets.url(${JSON.stringify(asset)}).` : `${mime} is not a type the player shows (${[...ASSET_MIMES].join(", ")}): convert it (to png, webp or woff2) and upload that instead.`
  };
}
function referencesTo(root, id) {
  const { docs } = readAllDocs(root);
  const users = [];
  for (const [p, data] of docs) {
    if (p.startsWith("data/")) continue;
    if (JSON.stringify(data).includes(id)) users.push(p);
  }
  return users;
}
function deleteAsset(root, given) {
  const id = BLOB_URL.exec(String(given ?? ""))?.[1] ?? (BLOB_ID.test(String(given ?? "")) ? given : null);
  if (!id) throw new CliError("INVALID_ASSET", "Give the attached file as its url (/_blob/<id>) or id (32 hex).");
  if (!fs9.existsSync(blobFile(root, id))) throw new CliError("NOT_FOUND", `No attached file ${id} in ${root}/_blobs.`);
  const users = referencesTo(root, id);
  if (users.length > 0) throw new CliError("IN_USE", `${id} is still named by ${users.join(", ")}; change or delete those first.`);
  fs9.rmSync(blobFile(root, id), { force: true });
  fs9.rmSync(`${blobFile(root, id)}.json`, { force: true });
  return { deleted: `/_blob/${id}` };
}
function readDb(root, given, flags) {
  if (!given) {
    const files = listDocFiles(root);
    return {
      root,
      documents: [...files.keys()].sort().map((p) => ({ path: p, bytes: fs9.statSync(files.get(p).file).size }))
    };
  }
  const segs = splitPath(given, "collection or document");
  if (segs.length % 2 === 1) {
    const prefix = `${segs.join("/")}/`;
    const docs = [];
    for (const p of [...listDocFiles(root).keys()].sort()) {
      if (!p.startsWith(prefix) || p.slice(prefix.length).includes("/")) continue;
      docs.push({ id: p.slice(prefix.length), data: readDoc(root, p).data });
    }
    return { collection: segs.join("/"), docs };
  }
  const doc = readDoc(root, segs.join("/"));
  if (flags.has("text")) {
    if (!doc.exists) throw new CliError("NOT_FOUND", `No document ${doc.path}.`);
    if (typeof doc.data.text !== "string") throw new CliError("NO_TEXT", `${doc.path} has no text field.`);
    return { raw: doc.data.text };
  }
  return doc.exists ? { path: doc.path, exists: true, data: doc.data } : { path: doc.path, exists: false };
}
function compileProblem(code, wrap) {
  try {
    new vm.Script(wrap ? `(async function (kit) {
${code}
})` : code, { filename: "module.js" });
    return null;
  } catch (error) {
    const line = /module\.js:(\d+)/.exec(String(error.stack ?? ""))?.[1];
    return `${error.message}${line ? ` (line ${Number(line) - (wrap ? 1 : 0)})` : ""}`;
  }
}
function joinedModules(docs) {
  const parts = /* @__PURE__ */ new Map();
  for (const [p, data] of docs) {
    if (!p.startsWith("modules/")) continue;
    const id = p.slice("modules/".length);
    const m = /^(.*)~([0-9]{1,2})$/.exec(id);
    const name = m ? m[1] : id;
    if (!parts.has(name)) parts.set(name, []);
    parts.get(name).push({ n: m ? Number(m[2]) : 0, data });
  }
  const out = /* @__PURE__ */ new Map();
  for (const [name, list] of parts) {
    list.sort((a, b) => a.n - b.n);
    out.set(name, { kind: list[0].data.kind, text: list.map((x) => typeof x.data.text === "string" ? x.data.text : "").join(""), parts: list.length });
  }
  return out;
}
function check(root) {
  const issues = [];
  const notes = [];
  const issue = (doc, message) => issues.push({ doc, message });
  const note = (doc, message) => notes.push({ doc, message });
  const { docs, damaged } = readAllDocs(root);
  for (const p of damaged) issue(p, "is not a JSON object; the player can\u2019t read it. Rewrite it with set.");
  for (const [p, data] of docs) {
    const problem = documentProblem(p.split("/"), data);
    if (problem) issue(p, problem.replace(`${p} `, "").replace(`${p}: `, ""));
    const top = p.split("/")[0];
    if (!["film", "modules", "assets"].includes(top)) note(p, "is in a collection the player doesn\u2019t read.");
  }
  const meta = docs.get("film/meta");
  const title = typeof meta?.title === "string" ? meta.title : null;
  if (!meta) issue("film/meta", 'is missing: write {"v":1, "title", "updatedAt"} first.');
  else if (title && /^(video|animation|untitled)$/i.test(title.trim())) note("film/meta", `title is "${title}"; use the film's own name.`);
  const script = docs.get("film/script");
  if (!script) issue("film/script", 'is missing: {"code":"window.CUT = kit.scenes();"}, last in the first batch.');
  else if (typeof script.code === "string") {
    const bad = compileProblem(script.code, false);
    if (bad) issue("film/script", `does not parse: ${bad}`);
  }
  const modules = joinedModules(docs);
  let total = 0;
  for (const m of modules.values()) total += Buffer.byteLength(m.text);
  if (modules.size > MAX_MODULES) issue("modules", `${modules.size} modules; a film holds ${MAX_MODULES} at most.`);
  if (total > MAX_MODULES_BYTES) issue("modules", `${kb(total)} of modules; a film holds 2 MiB at most.`);
  for (const [name, m] of modules) {
    const doc = `modules/${name}`;
    if (m.kind === "js") {
      const bad = compileProblem(m.text, true);
      if (bad) issue(doc, `does not parse: ${bad}`);
    } else if (m.kind === "json") {
      try {
        JSON.parse(m.text);
      } catch (error) {
        issue(doc, `is not JSON: ${error.message}`);
      }
    }
    if (["js", "css", "html"].includes(m.kind)) {
      if (/https?:\/\/(?!www\.w3\.org\/)/.test(m.text)) note(doc, "names an http(s) URL; the runner reaches nothing outside the film (raster-safety). Upload the file and use kit.assets.url.");
      if (/\/_blob\/[0-9a-f]{32}/.test(m.text)) note(doc, "names a /_blob/ url directly; place the asset with kit.assets.url('<file>') instead.");
    }
  }
  const assets = [...docs].filter(([p]) => p.startsWith("assets/"));
  if (assets.length > MAX_ASSETS) issue("assets", `${assets.length} assets; a film holds ${MAX_ASSETS} at most.`);
  for (const [p, a] of assets) {
    const id = BLOB_URL.exec(String(a.ref ?? ""))?.[1];
    if (id && !fs9.existsSync(blobFile(root, id))) issue(p, `ref ${a.ref} is not an upload of this film: upload the file again and use its url.`);
  }
  let scenes = null;
  let stage = null;
  let seconds = null;
  const sj = modules.get("scenes.json");
  if (sj) {
    let cut = null;
    try {
      cut = JSON.parse(sj.text);
    } catch {
    }
    if (!isObject2(cut)) issue("modules/scenes.json", "is not a JSON object.");
    else {
      stage = cut.stage;
      if (!["rough", "final"].includes(stage)) issue("modules/scenes.json", 'stage is "rough" or "final".');
      for (const k of ["width", "height", "fps"]) if (cut[k] !== void 0 && !(typeof cut[k] === "number" && cut[k] > 0)) issue("modules/scenes.json", `${k} is a number above 0.`);
      if (!Array.isArray(cut.scenes) || cut.scenes.length === 0) issue("modules/scenes.json", "needs scenes: [{id, name, dur, desc}, \u2026].");
      else {
        if (cut.scenes.length > 24) issue("modules/scenes.json", `${cut.scenes.length} scenes; 24 at most.`);
        const ids = /* @__PURE__ */ new Set();
        seconds = 0;
        scenes = [];
        cut.scenes.forEach((sc, i) => {
          const where = `scenes[${i}]`;
          if (!isObject2(sc)) return issue("modules/scenes.json", `${where} is not an object.`);
          if (typeof sc.id !== "string" || !SCENE_ID.test(sc.id)) issue("modules/scenes.json", `${where}.id ${JSON.stringify(sc.id)}: lower-case letters, digits and -, a letter first, 32 at most.`);
          else if (ids.has(sc.id)) issue("modules/scenes.json", `${where}.id "${sc.id}" appears twice.`);
          ids.add(sc.id);
          if (typeof sc.name !== "string" || sc.name.trim() === "" || sc.name.length > 48) issue("modules/scenes.json", `${where}.name: one to three words, 48 characters at most.`);
          if (!(typeof sc.dur === "number" && sc.dur > 0)) issue("modules/scenes.json", `${where}.dur: seconds, above 0.`);
          else {
            seconds += sc.dur;
            if (sc.dur < 1) note("modules/scenes.json", `${where} "${sc.id}" is ${sc.dur} s; no scene under a second.`);
          }
          const mod = modules.get(`scene-${sc.id}.js`);
          const state = !mod ? "missing" : /\brough\s*:\s*true\b/.test(mod.text) ? "rough" : "written";
          scenes.push({ id: sc.id, dur: sc.dur, module: state });
          if (mod && !new RegExp(`kit\\.scene\\(\\s*['"\`]${String(sc.id).replace(/[-]/g, "\\-")}['"\`]`).test(mod.text)) issue(`modules/scene-${sc.id}.js`, `has no kit.scene('${sc.id}', \u2026) call for its own id.`);
          if (!mod && stage === "final") issue(`modules/scene-${sc.id}.js`, "is missing, but the stage is final: write the scene.");
        });
        if (seconds > MAX_FILM_SECONDS) issue("modules/scenes.json", `${seconds} s in all; over ${MAX_FILM_SECONDS} s won't load.`);
        for (const name of modules.keys()) {
          const m = /^scene-(.+)\.js$/.exec(name);
          if (m && !ids.has(m[1])) note(`modules/${name}`, `names no scene in scenes.json; the player ignores it.`);
        }
      }
      if (stage === "final" && !modules.has("score.js")) note("modules/score.js", "no score: the film is silent.");
    }
  } else if (script && /kit\.scenes\(\)/.test(String(script.code))) issue("modules/scenes.json", "is missing, but film/script calls kit.scenes().");
  const problems = issues.length;
  const running = readState(root)?.url ?? null;
  return {
    problems,
    result: {
      root,
      title,
      problems,
      ...issues.length ? { issues } : {},
      ...notes.length ? { notes } : {},
      ...stage ? { stage } : {},
      ...seconds !== null ? { seconds: Math.round(seconds * 1e3) / 1e3 } : {},
      ...scenes ? { scenes } : {},
      modules: modules.size,
      assets: assets.length,
      notChecked: "Nothing is run here: whether init/render throw, determinism, raster-safety and the look show on the open page (a scene that fails draws its error card).",
      next: problems > 0 ? "Fix each issue (doc names the document), write it with write-db, and run check again until problems is 0." : running ? `No problems. The film is open at ${running} and reloads on every write.` : `No problems. Start the player (it keeps running in the background): ${cmd("open", root)}, then give the person the url it prints.`
    }
  };
}
function unpack(root, given) {
  if (!given) throw new CliError("MISSING_DIR", "Give a new, empty folder to lay the film out in.");
  const out = path8.resolve(given);
  if (fs9.existsSync(out) && fs9.readdirSync(out).length > 0) throw new CliError("NOT_EMPTY", `${given} is not empty; give a new folder.`);
  const { docs } = readAllDocs(root);
  const script = docs.get("film/script");
  if (!script) throw new CliError("NOT_FOUND", "The film has no film/script yet.");
  fs9.mkdirSync(path8.join(out, "artifact-type"), { recursive: true });
  fs9.copyFileSync(path8.join(EDITOR_DIR, "artifact-type", "app.js"), path8.join(out, "artifact-type", "app.js"));
  fs9.copyFileSync(path8.join(EDITOR_DIR, "artifact-type", "app.css"), path8.join(out, "artifact-type", "app.css"));
  fs9.writeFileSync(path8.join(out, "index.html"), fs9.readFileSync(path8.join(EDITOR_DIR, "index.html"), "utf8").replace('<script src="./local-host.js"></script>\n', ""));
  fs9.writeFileSync(path8.join(out, "cut.js"), script.code);
  const written = { modules: 0, assets: 0, skipped: [] };
  for (const [name, m] of joinedModules(docs)) {
    writeFileAtomic(path8.join(out, "modules", name), m.text);
    written.modules++;
  }
  for (const [p, a] of docs) {
    if (!p.startsWith("assets/")) continue;
    const name = p.slice("assets/".length);
    const id = BLOB_URL.exec(String(a.ref ?? ""))?.[1];
    if (id && fs9.existsSync(blobFile(root, id))) writeFileAtomic(path8.join(out, "assets", name), fs9.readFileSync(blobFile(root, id)));
    else if (String(a.ref ?? "").startsWith("data:")) writeFileAtomic(path8.join(out, "assets", name), Buffer.from(String(a.ref).split(",")[1] ?? "", "base64"));
    else {
      written.skipped.push(name);
      continue;
    }
    written.assets++;
  }
  return { dir: out, ...written, next: "This is render-offline.md's folder of steps 1 and 2 (index.html, artifact-type/, cut.js, modules/, assets/): go on from its step 3." };
}
var runningServer2 = (root) => runningServer(root, "motion", "/_api/session");
function serverFlags(flags) {
  const out = [];
  if (flags.has("port")) out.push("--port", flags.get("port"));
  if (flags.has("host")) out.push("--host", flags.get("host"));
  if (flags.has("lan")) out.push("--lan");
  return out;
}
var ADMIN_READ = /* @__PURE__ */ new Set();
var access = (viewer, p) => dbAccess(viewer, p.split("/"), ADMIN_READ);
var ownPath = (p, viewer) => String(p ?? "").replace(/^\/*data\/users\/me(?=\/|$)/, `data/users/${viewer.user.id}`);
var historyTracks = (p) => (p.split("/")[0] ?? "") !== "data";
function historyLabel(p) {
  if (p === "film/meta") return { en: "Title", zh: "标题" };
  if (p === "film/script") return { en: "Cut", zh: "剪辑脚本" };
  const [collection, id] = p.split("/");
  if (collection === "modules" && id) {
    const scene = /^scene-(.+)\.js(?:~\d+)?$/.exec(id);
    if (scene) return { en: `Scene \xB7 ${scene[1]}`, zh: `场景 \xB7 ${scene[1]}` };
    if (/^scenes\.json(?:~\d+)?$/.test(id)) return { en: "Scene list", zh: "场景列表" };
    if (/^score\.js(?:~\d+)?$/.test(id)) return { en: "Score", zh: "配乐" };
    return { en: `Module \xB7 ${id}`, zh: `模块 \xB7 ${id}` };
  }
  if (collection === "assets" && id) return { en: `Asset \xB7 ${id}`, zh: `素材 \xB7 ${id}` };
  return null;
}
function filmTitle(root) {
  let title;
  try {
    const meta = readDoc(root, "film/meta");
    title = meta.exists ? meta.data?.title : void 0;
  } catch {
  }
  return typeof title === "string" && title.trim() ? title.trim() : path8.basename(root);
}
var EDITOR_FILES = ["index.html", "local-host.js", "share-ui.js", "artifact-type/app.js", "artifact-type/app.css"];
async function serve(root, flags) {
  if (!EDITOR_FILES.every((name) => fs9.existsSync(path8.join(EDITOR_DIR, name)))) {
    throw new CliError("EDITOR_MISSING", `The editor page is missing (${EDITOR_DIR}); reinstall the skill.`);
  }
  const existing = await runningServer2(root);
  if (existing && existing.pid !== process.pid) {
    print({ url: existing.url, root, pid: existing.pid, reused: true, ...await lanOn2(existing.url, flags) }, true);
    return false;
  }
  const host = flags.get("host") ?? "127.0.0.1";
  const port = flags.has("port") ? Number(flags.get("port")) : DEFAULT_PORTS.motion;
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new CliError("INVALID_PORT", "--port is a number from 0 to 65535.");
  const log = (line) => process.stderr.write(`[${(/* @__PURE__ */ new Date()).toISOString()}] ${line}
`);
  const dbDir = path8.join(root, "db");
  fs9.mkdirSync(dbDir, { recursive: true });
  const known = /* @__PURE__ */ new Map();
  const clients = /* @__PURE__ */ new Map();
  const presence = new PresenceHub();
  const send = (res, event, data) => res.write(`event: ${event}
data: ${JSON.stringify(data)}

`);
  const snapshot = (viewer) => Object.fromEntries([...known].filter(([p]) => access(viewer, p).read).map(([p, k]) => [p, JSON.parse(k.text)]));
  const page = pagePathOf("motion", root);
  const history = new DbHistory({
    root,
    tracked: historyTracks,
    labels: () => historyLabel,
    base: page,
    write: (p, data) => void applyWrites(root, [data === null ? { op: "delete", path: p } : { op: "set", path: p, data }], { agent: false }),
    rescan: () => rescan(),
    log
  });
  const docsAt = (n) => history.docsAt(n, new Map([...known].map(([p, k]) => [p, JSON.parse(k.text)])));
  function rescan() {
    const files = listDocFiles(root);
    const changes = [];
    for (const [p, { file }] of files) {
      let stat;
      try {
        stat = fs9.statSync(file);
      } catch {
        continue;
      }
      const prev = known.get(p);
      if (prev && prev.mtimeMs === stat.mtimeMs && prev.size === stat.size) continue;
      let data;
      try {
        data = JSON.parse(fs9.readFileSync(file, "utf8"));
        if (!isObject2(data)) throw new Error("not an object");
      } catch {
        continue;
      }
      const text = JSON.stringify(data);
      known.set(p, { text, mtimeMs: stat.mtimeMs, size: stat.size });
      if (!prev || prev.text !== text) changes.push({ path: p, data });
    }
    for (const p of [...known.keys()]) {
      if (!files.has(p)) {
        known.delete(p);
        changes.push({ path: p, data: null });
      }
    }
    const made = history.record(changes, (p) => files.has(p));
    const byAgent = made.filter((v) => v.by === "agent").flatMap((v) => Object.keys(v.changes));
    if (byAgent.length) presence.agentActive({ where: agentWhere(byAgent.at(-1), byAgent.length, (p) => historyLabel(p) ?? { en: p, zh: p }) });
    if (changes.length) {
      for (const [res, viewer] of clients) {
        const seen = changes.filter((c) => access(viewer, c.path).read);
        if (seen.length) send(res, "change", { changes: seen });
      }
      log(`changed: ${changes.map((c) => c.path).join(", ")}`);
    }
  }
  rescan();
  let timer = null;
  const soon = () => {
    clearTimeout(timer);
    timer = setTimeout(rescan, 40);
  };
  let watcher = null;
  try {
    watcher = fs9.watch(dbDir, { recursive: true }, soon);
    watcher.on("error", () => {
    });
  } catch (error) {
    log(`file watching unavailable (${error.message}); polling instead`);
  }
  const poll = setInterval(rescan, watcher ? 2e3 : 700);
  const owner = localOwner();
  const share2 = new ShareHost({
    root,
    cookieName: guestCookieName("motion", root),
    owner,
    noun: NOUNS.motion,
    title: () => filmTitle(root),
    log,
    createServer: () => http.createServer(handle),
    uiFile: path8.join(EDITOR_DIR, "share-ui.js"),
    globals: (viewer, query) => ({ __baoyuHistory: history.bootGlobal(viewer, query) })
  });
  const json = (res, status, body) => sendJson(res, status, body);
  const serveFile = (req, res, file, type, cache) => {
    fs9.stat(file, (error, stat) => {
      if (error || !stat.isFile()) return json(res, 404, { code: "not_found", message: "Not found" });
      sendFile(req, res, file, { "Content-Type": type, "Content-Length": stat.size, "Cache-Control": cache, "X-Content-Type-Options": "nosniff" });
    });
  };
  const servePage = (res, viewer, at) => {
    let html;
    try {
      html = fs9.readFileSync(path8.join(EDITOR_DIR, "index.html"), "utf8");
    } catch {
      return json(res, 404, { code: "not_found", message: "The editor page is missing." });
    }
    const body = Buffer.from(share2.injectHead(html, viewer, at === void 0 ? "" : `?at=${at}`) ?? html);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Content-Length": body.length, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }).end(body);
  };
  const listOf = (docs, viewer, collection) => {
    const prefix = `${collection}/`;
    const out = [];
    for (const p of [...docs.keys()].sort()) {
      if (!p.startsWith(prefix) || p.slice(prefix.length).includes("/") || !access(viewer, p).read) continue;
      out.push({ id: p.slice(prefix.length), data: docs.get(p) });
    }
    return { collection, docs: out };
  };
  const collectionOf = (url2, viewer) => {
    const segs = splitPath(ownPath(url2.searchParams.get("path"), viewer), "collection");
    if (segs.length % 2 !== 1) throw new CliError("INVALID_PATH", "Not a collection path.");
    return segs.join("/");
  };
  async function handle(req, res) {
    try {
      if (!share2.hostAllowed(req)) return json(res, 421, { code: "invalid_argument", message: "Unexpected Host header." });
      const url2 = new URL(req.url ?? "/", "http://local");
      if (url2.pathname === "/favicon.ico") {
        res.writeHead(204).end();
        return;
      }
      if (await share2.route(req, res)) return;
      const viewer = share2.viewerOf(req);
      if (!viewer) return share2.denied(req, res);
      const at = pageRoute(url2.pathname, page);
      if ("redirect" in at) {
        req.resume();
        res.writeHead(302, { Location: `${at.redirect}${url2.search}`, "Cache-Control": "no-store" }).end();
        return;
      }
      const p = at.path;
      if (req.method === "POST" && !sameOrigin(req)) return json(res, 403, { code: "not_granted", message: "Cross-origin write refused." });
      const preview = previewOf(url2.searchParams);
      const editing = canEditAs(viewer.role) && preview === void 0;
      if (req.method === "GET" && (p === "/" || p === "/index.html")) return servePage(res, viewer, preview);
      if (p === "/__presence" && preview === void 0) return presence.handle(req, res, viewer);
      if (p === "/__history" || p.startsWith("/__history/")) {
        if (await history.host.handle(req, res, p.slice("/__history".length), viewer)) return;
        req.resume();
        return json(res, 404, { code: "not_found", message: "Not found" });
      }
      if (preview !== void 0 && p.startsWith("/_api/")) {
        const docs = docsAt(preview);
        if (!docs) return json(res, 404, { code: "not_found", message: `There is no version ${preview} (it may be too old to keep).` });
        if (req.method === "GET" && p === "/_api/events") {
          res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
          res.write("retry: 1500\n\n");
          send(res, "snapshot", { docs: Object.fromEntries([...docs].filter(([dp]) => access(viewer, dp).read)) });
          const ping = setInterval(() => res.write(": ping\n\n"), 25e3);
          req.on("close", () => clearInterval(ping));
          return;
        }
        if (req.method === "GET" && p === "/_api/doc") {
          let wanted;
          try {
            wanted = docSegments(ownPath(url2.searchParams.get("path"), viewer)).join("/");
          } catch (error) {
            return json(res, 400, { code: "invalid_argument", message: error.message });
          }
          const data = docs.get(wanted);
          return json(res, 200, data && access(viewer, wanted).read ? { exists: true, data } : { exists: false });
        }
        if (req.method === "GET" && p === "/_api/list") {
          try {
            return json(res, 200, listOf(docs, viewer, collectionOf(url2, viewer)));
          } catch (error) {
            return json(res, 400, { code: "invalid_argument", message: error.message });
          }
        }
        if (req.method === "POST") {
          req.resume();
          return json(res, 403, { code: "invalid_argument", message: "This is an earlier version: open the current one to change it." });
        }
      }
      if (req.method === "GET" && p === "/local-host.js") return serveFile(req, res, path8.join(EDITOR_DIR, "local-host.js"), "text/javascript; charset=utf-8", "no-store");
      if (req.method === "GET" && (p === "/artifact-type/app.js" || p === "/artifact-type/app.css")) return serveFile(req, res, path8.join(EDITOR_DIR, p), contentTypeOf(p), "no-cache");
      const blob = /^\/_blob\/([0-9a-f]{32})$/.exec(p);
      if (req.method === "GET" && blob) {
        const meta = readBlobMeta(root, blob[1]);
        return serveFile(req, res, blobFile(root, blob[1]), meta?.contentType ?? "application/octet-stream", "private, max-age=31536000, immutable");
      }
      if (req.method === "GET" && p === "/_api/session") {
        const session = { ok: true, kind: "motion", ...viewer.guest ? {} : { root }, userId: viewer.user.id, userName: viewer.user.name, role: viewer.role, canEdit: editing };
        return json(res, 200, session);
      }
      if (req.method === "GET" && p === "/_api/events") {
        res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
        res.write("retry: 1500\n\n");
        rescan();
        send(res, "snapshot", { docs: snapshot(viewer) });
        clients.set(res, viewer);
        share2.hold(viewer, res);
        const peer = url2.searchParams.get("peer") ?? "";
        const leave = presence.join(PEER_ID.test(peer) ? peer : "", viewer, (text) => res.write(text));
        const ping = setInterval(() => res.write(": ping\n\n"), 25e3);
        req.on("close", () => {
          clearInterval(ping);
          clients.delete(res);
          leave();
        });
        return;
      }
      if (req.method === "GET" && p === "/_api/doc") {
        let doc;
        try {
          doc = readDoc(root, ownPath(url2.searchParams.get("path"), viewer));
        } catch (error) {
          return json(res, 400, { code: "invalid_argument", message: error.message });
        }
        return json(res, 200, doc.exists && access(viewer, doc.path).read ? { exists: true, data: doc.data } : { exists: false });
      }
      if (req.method === "GET" && p === "/_api/list") {
        try {
          return json(res, 200, listOf(readAllDocs(root).docs, viewer, collectionOf(url2, viewer)));
        } catch (error) {
          return json(res, 400, { code: "invalid_argument", message: error.message });
        }
      }
      if (req.method === "POST" && p === "/_api/write") {
        let body;
        try {
          body = JSON.parse((await readBody(req, MAX_BATCH_BYTES + 4096)).toString("utf8"));
        } catch (error) {
          const tooLarge = error instanceof TooLarge;
          return json(res, tooLarge ? 413 : 400, { code: "invalid_argument", message: tooLarge ? "The write is over 1 MB." : "The write is not JSON." });
        }
        const given = ownPath(body.path, viewer);
        let segs;
        try {
          segs = docSegments(given);
        } catch (error) {
          return json(res, 400, { code: "invalid_argument", message: error.message });
        }
        if (!editing) return json(res, 403, { code: "invalid_argument", message: "You can view this animation but not change it." });
        if (!access(viewer, segs.join("/")).write) return json(res, 403, { code: "invalid_argument", message: `${segs.join("/")} is another person's own: only they read and write it.` });
        let write = { op: body.op, path: given, ...body.op === "delete" ? {} : { data: body.data } };
        let merge;
        const base = isObject2(body.base) ? body.base : body.base === null && body.op !== "delete" ? {} : null;
        if ((body.op === "set" || body.op === "update" || body.op === "delete") && base && (body.op === "delete" || isObject2(body.data))) {
          let now = null;
          try {
            now = readDoc(root, segs.join("/"));
          } catch {
          }
          if (now && (now.exists || body.base !== null)) {
            const mine = body.op === "delete" ? null : body.op === "update" ? mergePatch(base, body.data) : body.data;
            const merged = mergeWrite(base, mine, now.exists ? now.data : null);
            write = merged.result === null ? { op: "delete", path: given } : { op: "set", path: given, data: merged.result };
            merge = { base, conflicts: merged.conflicts, ...body.chosen === true ? { chosen: true } : {} };
          }
        }
        history.attribute(segs.join("/"), whoOf(viewer), merge);
        try {
          const done = applyWrites(root, [write], { agent: false });
          rescan();
          return json(res, 200, { ok: true, writes: done });
        } catch (error) {
          return json(res, 400, { code: "invalid_argument", message: error.message });
        } finally {
          history.settle(segs.join("/"));
        }
      }
      if (req.method === "POST" && p === "/_api/upload") {
        if (!editing) {
          req.resume();
          return json(res, 403, { code: "not_granted", message: "You can view this animation but not add files to it." });
        }
        let bytes;
        try {
          bytes = await readBody(req, MAX_DATA_BYTES);
        } catch (error) {
          const tooLarge = error instanceof TooLarge;
          return json(res, tooLarge ? 413 : 400, { code: "invalid_argument", message: tooLarge ? "The file is over 64 MB." : error.message });
        }
        let name = "upload";
        try {
          name = decodeURIComponent(String(req.headers["x-filename"] ?? "upload")).replace(/[\\/]/g, "_").slice(0, 200) || "upload";
        } catch {
        }
        const type = String(req.headers["content-type"] ?? "") || contentTypeOf(name);
        const result = putBlob(root, bytes, name, type);
        log(`uploaded ${name} as ${result.url}${viewer.guest ? ` (${viewer.user.name})` : ""}`);
        return json(res, 200, result);
      }
      return json(res, 404, { code: "not_found", message: "Not found" });
    } catch (error) {
      log(`error: ${error.stack ?? error}`);
      if (!res.headersSent) json(res, 500, { code: "unavailable", message: String(error.message ?? error) });
    }
  }
  const server = http.createServer(handle);
  const close = () => {
    clearInterval(poll);
    watcher?.close();
    for (const c of clients.keys()) c.end();
    share2.close();
    presence.close();
    server.close();
    server.closeAllConnections?.();
  };
  const actualPort = await share2.listen(server, { port, host, lan: flags.has("lan"), portGiven: flags.has("port") }).catch((error) => {
    close();
    throw error.code === "PORT_IN_USE" ? new CliError("PORT_IN_USE", error.message) : error;
  });
  const url = `${serverOrigin(host, actualPort)}${page}`;
  const state = { kind: "motion", pid: process.pid, url, port: actualPort, root, startedAt: (/* @__PURE__ */ new Date()).toISOString() };
  recordServer(state, close, ["SIGINT", "SIGTERM", "SIGHUP"]);
  const lan = share2.lanUrls();
  print({ url, root, pid: process.pid, ...lan.length ? { lan } : {} }, true);
  log(`serving ${root} at ${url}`);
  return true;
}
var fail = (code, message) => {
  throw new CliError(code, message);
};
var shareCall2 = (url, action) => shareCall(url, action, fail);
var lanOn2 = (url, flags) => lanOn(url, flags, fail);
async function open(root, flags) {
  const existing = await runningServer2(root);
  if (existing) {
    print({ url: existing.url, root, pid: existing.pid, reused: true, ...await lanOn2(existing.url, flags), log: path8.join(root, LOG_FILE), stop: cmd("stop", root) }, true);
    return;
  }
  const state = await startBackground(root, flags);
  const view = await shareCall2(state.url, null).catch(() => null);
  const empty = !fs9.existsSync(docFile(root, ["film", "script"]));
  print({ url: state.url, root, pid: state.pid, ...view?.lan ? { lan: lanUrls(view) } : {}, log: path8.join(root, LOG_FILE), stop: cmd("stop", root), ...empty ? { note: "film/script is not written yet: the page shows “No animation yet” until the first batch lands." } : {} }, true);
}
async function startBackground(root, flags) {
  const logFile = path8.join(root, LOG_FILE);
  const fd = fs9.openSync(logFile, "a");
  const child = spawn2(process.execPath, [SCRIPT, "serve", root, ...serverFlags(flags)], { detached: true, stdio: ["ignore", "ignore", fd] });
  child.unref();
  fs9.closeSync(fd);
  let exited = false;
  child.once("exit", () => exited = true);
  const deadline = Date.now() + 15e3;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 120));
    const state = readState(root);
    if (state && state.pid === child.pid) return state;
    if (exited) break;
  }
  const tail = fs9.existsSync(logFile) ? fs9.readFileSync(logFile, "utf8").split("\n").slice(-12).join("\n") : "";
  throw new CliError("SERVER_FAILED", `The editor server did not start. Run ${cmd("serve", root)} in the foreground to see why.${tail ? `
${tail}` : ""}`);
}
function stop(root) {
  const state = readState(root);
  if (!state || !alive(state.pid)) {
    fs9.rmSync(path8.join(root, STATE_FILE), { force: true });
    print({ stopped: false, message: "No editor server is running for this folder." }, true);
    return;
  }
  process.kill(state.pid, "SIGTERM");
  print({ stopped: true, pid: state.pid }, true);
}
async function share(root, flags) {
  print(
    await shareCommand({
      root,
      flags,
      running: () => runningServer2(root),
      startShared: () => startBackground(root, new Map([...flags, ["lan", "true"]])),
      offCommand: cmd("share", root, "--off"),
      serveCommand: cmd("serve", root, "--lan"),
      fail
    })
  );
}
var USAGE = `libre-motion \u2014 local Artifact tool for the Motion type

Usage:
  node scripts/artifact.mjs write-db <root> <batch.json | ->     write documents (set / update / delete), all or nothing
  node scripts/artifact.mjs read-db  <root> [<collection>[/<doc_id>]] [--text]
                                                                  read the store; --text prints a document's text raw
  node scripts/artifact.mjs upload   <root> <file> [--name n]    upload an image, font or clip; prints its /_blob/<id> url
  node scripts/artifact.mjs delete-asset <root> <url|id>         remove an upload nothing names any more
  node scripts/artifact.mjs check    <root>                      check the film's documents; exit 1 on problems
  node scripts/artifact.mjs open     <root> [--port n] [--lan]   start the player in the background; prints {"url"}
  node scripts/artifact.mjs serve    <root> [--port n] [--lan]   the same server, in the foreground (--lan: shared too)
  node scripts/artifact.mjs stop     <root>                      stop the background player
  node scripts/artifact.mjs share    <root>                      share on the local network; prints a link per role
                                     [--off] [--reset R] [--enable R] [--disable R]
                                                                  R: editor, commenter, viewer, a comma list, or all
                                     [--role G=R,...]            give guest G (an id it prints) role R
  node scripts/artifact.mjs archive  <root> [--out file.zip|dir] the whole folder as one zip (backup, another computer,
                                                                  someone else); beside the folder unless --out says
  node scripts/artifact.mjs unpack   <root> <new-dir>            lay the film out for render-offline.md (stills, only when asked)

<root> is the film's folder: documents at <root>/db/<collection>/<doc_id>.json, uploads in <root>/_blobs/,
versions in <root>/history/.
A batch is a JSON array (or {"writes": [...]}) of {op, path: "collection/doc_id" (or collection + doc_id), data | file_path};
in data, {"$file": "path"} is replaced by that file's text. update merges fields; null or {"__delete__": true} removes one.
Paths in a batch are relative to the current directory. Skill: ${SKILL_DIR}`;
async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { positional, flags } = parseArgs(rest);
  switch (command) {
    case "write-db": {
      const root = resolveRoot(positional[0], { create: true });
      const from = positional[1];
      if (!from) throw new CliError("MISSING_BATCH", "Give the batch: a JSON file, or - to read it from stdin.");
      let text;
      try {
        text = from === "-" ? fs9.readFileSync(0, "utf8") : fs9.readFileSync(path8.resolve(from), "utf8");
      } catch {
        throw new CliError("FILE_NOT_FOUND", `No such batch file: ${from}`);
      }
      let batch;
      try {
        batch = JSON.parse(text);
      } catch (error) {
        throw new CliError("INVALID_BATCH", `The batch is not JSON: ${error.message}`);
      }
      const writes = Array.isArray(batch) ? batch : Array.isArray(batch?.writes) ? batch.writes : isObject2(batch) && batch.op ? [batch] : null;
      if (!writes) throw new CliError("INVALID_BATCH", 'A batch is an array of writes, or {"writes": [...]}.');
      const written = applyWrites(root, writes);
      const server = readState(root);
      print({ root, written, next: `Run ${cmd("check", root)}.${server && alive(server.pid) ? " The open editor picks the change up by itself." : ""}` });
      return 0;
    }
    case "read-db": {
      const result = readDb(resolveRoot(positional[0]), positional[1], flags);
      if ("raw" in result) process.stdout.write(result.raw.endsWith("\n") ? result.raw : `${result.raw}
`);
      else print(result);
      return 0;
    }
    case "upload":
      print(upload(resolveRoot(positional[0], { create: true }), positional[1], flags));
      return 0;
    case "delete-asset":
      print(deleteAsset(resolveRoot(positional[0]), positional[1]));
      return 0;
    case "check": {
      const { result, problems } = check(resolveRoot(positional[0]));
      print(result);
      return problems > 0 ? 1 : 0;
    }
    case "unpack":
      print(unpack(resolveRoot(positional[0]), positional[1]));
      return 0;
    case "open":
      await open(resolveRoot(positional[0]), flags);
      return 0;
    case "serve":
      return await serve(resolveRoot(positional[0]), flags) ? -1 : 0;
    case "stop":
      stop(resolveRoot(positional[0]));
      return 0;
    case "share":
      await share(resolveRoot(positional[0]), flags);
      return 0;
    case "archive": {
      const made = await archiveCommand(resolveRoot(positional[0]), flags.get("out"));
      print({ ...made, open: `unzip it anywhere, then ${cmd("open", `<there>/${made.folder}`)}` }, true);
      return 0;
    }
    case void 0:
    case "help":
    case "--help":
    case "-h":
      process.stdout.write(`${USAGE}
`);
      return command === void 0 ? 2 : 0;
    default:
      process.stderr.write(`Unknown command: ${command}

${USAGE}
`);
      return 2;
  }
}
main().then(
  (code) => {
    if (code >= 0) process.exitCode = code;
  },
  (error) => {
    process.stderr.write(`${JSON.stringify({ error: error.code ?? "ERROR", message: error.message })}
`);
    process.exitCode = 2;
  }
);
