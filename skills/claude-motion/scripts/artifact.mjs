#!/usr/bin/env node
// claude-motion: local Artifact tool for the Motion type (do not edit by hand without testing).

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs2 from "node:fs";
import http from "node:http";
import os from "node:os";
import path2 from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import fs from "node:fs";
import path from "node:path";
var STATE_FILE = ".artifact-server.json";
var LOG_FILE = ".artifact-server.log";
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
  const shutdown = () => {
    if (readState(state.root)?.pid === process.pid) fs.rmSync(file, { force: true });
    close();
    process.exit(0);
  };
  for (const signal of signals) process.on(signal, shutdown);
}
async function listen(server, port, host) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve());
  });
  const address = server.address();
  return typeof address === "object" && address ? address.port : port;
}
function serverOrigin(host, port) {
  const shown = host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host.includes(":") ? `[${host}]` : host;
  return `http://${shown}:${port}`;
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

var SCRIPT = fileURLToPath(import.meta.url);
var SKILL_DIR = path2.dirname(path2.dirname(SCRIPT));
var EDITOR_DIR = path2.join(path2.dirname(SCRIPT), "editor");
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
var isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
var bytesOf = (value) => Buffer.byteLength(JSON.stringify(value), "utf8");
var kb = (n) => n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`;
var extOf = (name) => path2.extname(name).slice(1).toLowerCase();
var contentTypeOf = (name) => CONTENT_TYPES[extOf(name)] ?? "application/octet-stream";
var quote = (s) => /^[A-Za-z0-9_./:@%+=-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`;
var cmd = (name, ...args) => ["node", quote(SCRIPT), name, ...args.map(quote)].join(" ");
function print(value, compact = false) {
  process.stdout.write(`${compact ? JSON.stringify(value) : JSON.stringify(value, null, 2)}
`);
}
function parseArgs(argv) {
  const positional = [];
  const flags = /* @__PURE__ */ new Map();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      if (eq > 0) flags.set(arg.slice(2, eq), arg.slice(eq + 1));
      else if (i + 1 < argv.length && !argv[i + 1].startsWith("--") && !["text", "json"].includes(arg.slice(2))) flags.set(arg.slice(2), argv[++i]);
      else flags.set(arg.slice(2), "true");
    } else positional.push(arg);
  }
  return { positional, flags };
}
function writeFileAtomic(file, data) {
  fs2.mkdirSync(path2.dirname(file), { recursive: true });
  const tmp = path2.join(path2.dirname(file), `.tmp-${process.pid}-${Date.now()}-${path2.basename(file)}`);
  fs2.writeFileSync(tmp, data);
  fs2.renameSync(tmp, file);
}
function resolveRoot(given, { create = false } = {}) {
  if (!given) throw new CliError("MISSING_ROOT", "Give the film folder (for example designs/<slug>).");
  const root = path2.resolve(given);
  const stat = fs2.statSync(root, { throwIfNoEntry: false });
  if (stat && !stat.isDirectory()) throw new CliError("NOT_A_FOLDER", `${given} is a file; the film is a folder.`);
  if (!stat) {
    if (!create) throw new CliError("NOT_FOUND", `${root} does not exist. Write the film first: ${cmd("write-db", given, "batch.json")}.`);
    fs2.mkdirSync(root, { recursive: true });
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
var docFile = (root, segs) => path2.join(root, "db", ...segs.slice(0, -1), `${segs.at(-1)}.json`);
function listDocFiles(root) {
  const out = /* @__PURE__ */ new Map();
  const base = path2.join(root, "db");
  const walk = (dir, rel) => {
    let entries;
    try {
      entries = fs2.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      const full = path2.join(dir, e.name);
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
    text = fs2.readFileSync(file, "utf8");
  } catch {
    return { path: segs.join("/"), exists: false, file };
  }
  try {
    const data = JSON.parse(text);
    if (!isObject(data)) throw new Error("not an object");
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
      const data = JSON.parse(fs2.readFileSync(file, "utf8"));
      if (isObject(data)) docs.set(p, data);
      else damaged.push(p);
    } catch {
      damaged.push(p);
    }
  }
  return { docs, damaged };
}
var isDeleteMarker = (v) => v === null || isObject(v) && v.__delete__ === true && Object.keys(v).length === 1;
function mergePatch(target, patch) {
  const out = isObject(target) ? { ...target } : {};
  for (const [k, v] of Object.entries(patch)) {
    if (k === "__proto__") continue;
    if (isDeleteMarker(v)) delete out[k];
    else if (isObject(v)) out[k] = mergePatch(out[k], v);
    else out[k] = v;
  }
  return out;
}
function hasDeleteMarker(v) {
  if (Array.isArray(v)) return v.some(hasDeleteMarker);
  if (!isObject(v)) return false;
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
  if (!isObject(value)) return value;
  const keys = Object.keys(value);
  if (keys.length === 1 && keys[0] === "$file") {
    const file = path2.resolve(String(value.$file));
    try {
      return fs2.readFileSync(file, "utf8");
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
    if (!isObject(w)) throw new CliError("INVALID_WRITE", `${where} is not an object.`);
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
          data = JSON.parse(fs2.readFileSync(path2.resolve(String(w.file_path)), "utf8"));
        } catch (error) {
          throw new CliError("INVALID_WRITE", `${where}.file_path ${JSON.stringify(w.file_path)}: ${error.code === "ENOENT" ? "no such file" : `not JSON (${error.message})`}.`);
        }
      } else data = w.data;
      if (!isObject(data)) throw new CliError("INVALID_WRITE", `${where}.data must be a JSON object (the document's fields).`);
      data = agent ? resolveFileRefs(data, `${where}.data`) : data;
      if (op === "set" && hasDeleteMarker(data)) throw new CliError("INVALID_WRITE", `${where}: {"__delete__": true} works only in an update; set writes the whole document.`);
    }
    const file = docFile(root, segs);
    const existing = fs2.existsSync(file) ? readDoc(root, p) : { exists: false };
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
    if (w.op === "delete") fs2.rmSync(w.file, { force: true });
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
var blobFile = (root, id) => path2.join(root, "_blobs", id);
function readBlobMeta(root, id) {
  try {
    return JSON.parse(fs2.readFileSync(`${blobFile(root, id)}.json`, "utf8"));
  } catch {
    return null;
  }
}
function putBlob(root, bytes, name, contentType) {
  const id = createHash("sha256").update(bytes).digest("hex").slice(0, 32);
  const file = blobFile(root, id);
  if (!fs2.existsSync(file)) writeFileAtomic(file, bytes);
  const meta = { name, contentType, bytes: bytes.length, uploadedAt: (/* @__PURE__ */ new Date()).toISOString() };
  writeFileAtomic(`${file}.json`, `${JSON.stringify(meta, null, 2)}
`);
  return { url: `/_blob/${id}`, id, name, bytes: bytes.length, contentType };
}
function upload(root, given, flags) {
  if (!given) throw new CliError("MISSING_FILE", "Give the file to upload (an image, font or video clip).");
  const file = path2.resolve(given);
  const stat = fs2.statSync(file, { throwIfNoEntry: false });
  if (!stat) throw new CliError("FILE_NOT_FOUND", `No such file: ${given}`);
  if (!stat.isFile()) throw new CliError("NOT_A_FILE", `${given} is not a regular file.`);
  if (stat.size > MAX_DATA_BYTES) {
    throw new CliError("FILE_TOO_LARGE", `${given} is ${kb(stat.size)}; an upload over 64 MB is refused. Trim or compress it first.`);
  }
  const name = flags.get("name") ?? path2.basename(file);
  const type = flags.get("type") ?? contentTypeOf(name);
  const result = putBlob(root, fs2.readFileSync(file), name, type);
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
  if (!fs2.existsSync(blobFile(root, id))) throw new CliError("NOT_FOUND", `No attached file ${id} in ${root}/_blobs.`);
  const users = referencesTo(root, id);
  if (users.length > 0) throw new CliError("IN_USE", `${id} is still named by ${users.join(", ")}; change or delete those first.`);
  fs2.rmSync(blobFile(root, id), { force: true });
  fs2.rmSync(`${blobFile(root, id)}.json`, { force: true });
  return { deleted: `/_blob/${id}` };
}
function readDb(root, given, flags) {
  if (!given) {
    const files = listDocFiles(root);
    return {
      root,
      documents: [...files.keys()].sort().map((p) => ({ path: p, bytes: fs2.statSync(files.get(p).file).size }))
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
    if (id && !fs2.existsSync(blobFile(root, id))) issue(p, `ref ${a.ref} is not an upload of this film: upload the file again and use its url.`);
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
    if (!isObject(cut)) issue("modules/scenes.json", "is not a JSON object.");
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
          if (!isObject(sc)) return issue("modules/scenes.json", `${where} is not an object.`);
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
var runningServer2 = (root) => runningServer(root, "motion", "/_api/session");
function unpack(root, given) {
  if (!given) throw new CliError("MISSING_DIR", "Give a new, empty folder to lay the film out in.");
  const out = path2.resolve(given);
  if (fs2.existsSync(out) && fs2.readdirSync(out).length > 0) throw new CliError("NOT_EMPTY", `${given} is not empty; give a new folder.`);
  const { docs } = readAllDocs(root);
  const script = docs.get("film/script");
  if (!script) throw new CliError("NOT_FOUND", "The film has no film/script yet.");
  fs2.mkdirSync(path2.join(out, "artifact-type"), { recursive: true });
  fs2.copyFileSync(path2.join(EDITOR_DIR, "artifact-type", "app.js"), path2.join(out, "artifact-type", "app.js"));
  fs2.copyFileSync(path2.join(EDITOR_DIR, "artifact-type", "app.css"), path2.join(out, "artifact-type", "app.css"));
  fs2.writeFileSync(path2.join(out, "index.html"), fs2.readFileSync(path2.join(EDITOR_DIR, "index.html"), "utf8").replace('<script src="./local-host.js"></script>\n', ""));
  fs2.writeFileSync(path2.join(out, "cut.js"), script.code);
  const written = { modules: 0, assets: 0, skipped: [] };
  for (const [name, m] of joinedModules(docs)) {
    writeFileAtomic(path2.join(out, "modules", name), m.text);
    written.modules++;
  }
  for (const [p, a] of docs) {
    if (!p.startsWith("assets/")) continue;
    const name = p.slice("assets/".length);
    const id = BLOB_URL.exec(String(a.ref ?? ""))?.[1];
    if (id && fs2.existsSync(blobFile(root, id))) writeFileAtomic(path2.join(out, "assets", name), fs2.readFileSync(blobFile(root, id)));
    else if (String(a.ref ?? "").startsWith("data:")) writeFileAtomic(path2.join(out, "assets", name), Buffer.from(String(a.ref).split(",")[1] ?? "", "base64"));
    else {
      written.skipped.push(name);
      continue;
    }
    written.assets++;
  }
  return { dir: out, ...written, next: "This is render-offline.md's folder of steps 1 and 2 (index.html, artifact-type/, cut.js, modules/, assets/): go on from its step 3." };
}
function localUserName() {
  try {
    return os.userInfo().username || "You";
  } catch {
    return "You";
  }
}
function serverFlags(flags) {
  const out = [];
  if (flags.has("port")) out.push("--port", flags.get("port"));
  if (flags.has("host")) out.push("--host", flags.get("host"));
  return out;
}
async function serve(root, flags) {
  if (!fs2.existsSync(path2.join(EDITOR_DIR, "index.html")) || !fs2.existsSync(path2.join(EDITOR_DIR, "local-host.js")) || !fs2.existsSync(path2.join(EDITOR_DIR, "artifact-type", "app.js"))) {
    throw new CliError("EDITOR_MISSING", `The editor page is missing (${EDITOR_DIR}); reinstall the skill.`);
  }
  const existing = await runningServer2(root);
  if (existing && existing.pid !== process.pid) {
    print({ url: existing.url, root, pid: existing.pid, reused: true }, true);
    return false;
  }
  const host = flags.get("host") ?? "127.0.0.1";
  const port = Number(flags.get("port") ?? 0);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new CliError("INVALID_PORT", "--port is a number from 0 to 65535.");
  const log = (line) => process.stderr.write(`[${(/* @__PURE__ */ new Date()).toISOString()}] ${line}
`);
  const dbDir = path2.join(root, "db");
  fs2.mkdirSync(dbDir, { recursive: true });
  const known = /* @__PURE__ */ new Map();
  const clients = /* @__PURE__ */ new Set();
  const send = (res, event, data) => res.write(`event: ${event}
data: ${JSON.stringify(data)}

`);
  const snapshot = () => Object.fromEntries([...known].map(([p, k]) => [p, JSON.parse(k.text)]));
  function rescan() {
    const files = listDocFiles(root);
    const changes = [];
    for (const [p, { file }] of files) {
      let stat;
      try {
        stat = fs2.statSync(file);
      } catch {
        continue;
      }
      const prev = known.get(p);
      if (prev && prev.mtimeMs === stat.mtimeMs && prev.size === stat.size) continue;
      let data;
      try {
        data = JSON.parse(fs2.readFileSync(file, "utf8"));
        if (!isObject(data)) throw new Error("not an object");
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
    if (changes.length) {
      for (const res of clients) send(res, "change", { changes });
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
    watcher = fs2.watch(dbDir, { recursive: true }, soon);
    watcher.on("error", () => {
    });
  } catch (error) {
    log(`file watching unavailable (${error.message}); polling instead`);
  }
  const poll = setInterval(rescan, watcher ? 2e3 : 700);
  const allowedHosts = (p) => /* @__PURE__ */ new Set([`127.0.0.1:${p}`, `localhost:${p}`, `[::1]:${p}`, `${host}:${p}`]);
  let hosts = /* @__PURE__ */ new Set();
  const json = (res, status, body) => sendJson(res, status, body);
  const serveFile = (req, res, file, type, cache) => {
    fs2.stat(file, (error, stat) => {
      if (error || !stat.isFile()) return json(res, 404, { code: "not_found", message: "Not found" });
      sendFile(req, res, file, { "Content-Type": type, "Content-Length": stat.size, "Cache-Control": cache, "X-Content-Type-Options": "nosniff" });
    });
  };
  const server = http.createServer(async (req, res) => {
    try {
      if (!hosts.has(req.headers.host ?? "")) return json(res, 421, { code: "invalid_argument", message: "Unexpected Host header." });
      const url2 = new URL(req.url ?? "/", "http://local");
      const p = url2.pathname;
      if (req.method === "POST" && !sameOrigin(req)) return json(res, 403, { code: "not_granted", message: "Cross-origin write refused." });
      if (req.method === "GET" && (p === "/" || p === "/index.html")) return serveFile(req, res, path2.join(EDITOR_DIR, "index.html"), "text/html; charset=utf-8", "no-store");
      if (req.method === "GET" && p === "/local-host.js") return serveFile(req, res, path2.join(EDITOR_DIR, "local-host.js"), "text/javascript; charset=utf-8", "no-store");
      if (req.method === "GET" && (p === "/artifact-type/app.js" || p === "/artifact-type/app.css")) return serveFile(req, res, path2.join(EDITOR_DIR, p), contentTypeOf(p), "no-cache");
      if (p === "/favicon.ico") return res.writeHead(204).end();
      const blob = /^\/_blob\/([0-9a-f]{32})$/.exec(p);
      if (req.method === "GET" && blob) {
        const meta = readBlobMeta(root, blob[1]);
        return serveFile(req, res, blobFile(root, blob[1]), meta?.contentType ?? "application/octet-stream", "private, max-age=31536000, immutable");
      }
      if (req.method === "GET" && p === "/_api/session") return json(res, 200, { ok: true, kind: "motion", root, userId: LOCAL_USER_ID, userName: localUserName() });
      if (req.method === "GET" && p === "/_api/events") {
        res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
        res.write("retry: 1500\n\n");
        rescan();
        send(res, "snapshot", { docs: snapshot() });
        clients.add(res);
        const ping = setInterval(() => res.write(": ping\n\n"), 25e3);
        req.on("close", () => {
          clearInterval(ping);
          clients.delete(res);
        });
        return;
      }
      if (req.method === "GET" && p === "/_api/doc") {
        let doc;
        try {
          doc = readDoc(root, url2.searchParams.get("path"));
        } catch (error) {
          return json(res, 400, { code: "invalid_argument", message: error.message });
        }
        return json(res, 200, doc.exists ? { exists: true, data: doc.data } : { exists: false });
      }
      if (req.method === "GET" && p === "/_api/list") {
        let segs;
        try {
          segs = splitPath(url2.searchParams.get("path"), "collection");
        } catch (error) {
          return json(res, 400, { code: "invalid_argument", message: error.message });
        }
        if (segs.length % 2 !== 1) return json(res, 400, { code: "invalid_argument", message: "Not a collection path." });
        return json(res, 200, readDb(root, segs.join("/"), new Map()));
      }
      if (req.method === "POST" && p === "/_api/write") {
        let body;
        try {
          body = JSON.parse((await readBody(req, MAX_BATCH_BYTES + 4096)).toString("utf8"));
        } catch (error) {
          const tooLarge = error instanceof TooLarge;
          return json(res, tooLarge ? 413 : 400, { code: "invalid_argument", message: tooLarge ? "The write is over 1 MB." : "The write is not JSON." });
        }
        try {
          const done = applyWrites(root, [{ op: body.op, path: body.path, ...body.op === "delete" ? {} : { data: body.data } }], { agent: false });
          rescan();
          return json(res, 200, { ok: true, writes: done });
        } catch (error) {
          return json(res, 400, { code: "invalid_argument", message: error.message });
        }
      }
      if (req.method === "POST" && p === "/_api/upload") {
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
        log(`uploaded ${name} as ${result.url}`);
        return json(res, 200, result);
      }
      return json(res, 404, { code: "not_found", message: "Not found" });
    } catch (error) {
      log(`error: ${error.stack ?? error}`);
      if (!res.headersSent) json(res, 500, { code: "unavailable", message: String(error.message ?? error) });
    }
  });
  const close = () => {
    clearInterval(poll);
    watcher?.close();
    for (const c of clients) c.end();
    server.close();
    server.closeAllConnections?.();
  };
  const actualPort = await listen(server, port, host).catch((error) => {
    close();
    throw error.code === "EADDRINUSE" ? new CliError("PORT_IN_USE", `Port ${port} is in use; pick another --port, or leave it out to take a free one.`) : error;
  });
  hosts = allowedHosts(actualPort);
  const url = `${serverOrigin(host, actualPort)}/`;
  const state = { kind: "motion", pid: process.pid, url, port: actualPort, root, startedAt: (/* @__PURE__ */ new Date()).toISOString() };
  recordServer(state, close, ["SIGINT", "SIGTERM", "SIGHUP"]);
  print({ url, root, pid: process.pid }, true);
  log(`serving ${root} at ${url}`);
  return true;
}
async function open(root, flags) {
  const existing = await runningServer2(root);
  if (existing) {
    print({ url: existing.url, root, pid: existing.pid, reused: true, log: path2.join(root, LOG_FILE), stop: cmd("stop", root) }, true);
    return;
  }
  const logFile = path2.join(root, LOG_FILE);
  const fd = fs2.openSync(logFile, "a");
  const child = spawn(process.execPath, [SCRIPT, "serve", root, ...serverFlags(flags)], { detached: true, stdio: ["ignore", "ignore", fd] });
  child.unref();
  fs2.closeSync(fd);
  let exited = false;
  child.once("exit", () => exited = true);
  const deadline = Date.now() + 15e3;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 120));
    const state = readState(root);
    if (state?.pid === child.pid) {
      const empty = !fs2.existsSync(docFile(root, ["film", "script"]));
      print({ url: state.url, root, pid: state.pid, log: logFile, stop: cmd("stop", root), ...empty ? { note: "film/script is not written yet: the page shows \u201cNo animation yet\u201d until the first batch lands." } : {} }, true);
      return;
    }
    if (exited) break;
  }
  const tail = fs2.existsSync(logFile) ? fs2.readFileSync(logFile, "utf8").split("\n").slice(-12).join("\n") : "";
  throw new CliError("SERVER_FAILED", `The editor server did not start. Run ${cmd("serve", root)} in the foreground to see why.${tail ? `
${tail}` : ""}`);
}
function stop(root) {
  const state = readState(root);
  if (!state || !alive(state.pid)) {
    fs2.rmSync(path2.join(root, STATE_FILE), { force: true });
    print({ stopped: false, message: "No editor server is running for this folder." }, true);
    return;
  }
  process.kill(state.pid, "SIGTERM");
  print({ stopped: true, pid: state.pid }, true);
}
var USAGE = `claude-motion \u2014 local Artifact tool for the Motion type

Usage:
  node scripts/artifact.mjs write-db <root> <batch.json | ->     write documents (set / update / delete), all or nothing
  node scripts/artifact.mjs read-db  <root> [<collection>[/<doc_id>]] [--text]
                                                                  read the store; --text prints a document's text raw
  node scripts/artifact.mjs upload   <root> <file> [--name n]    upload an image, font or clip; prints its /_blob/<id> url
  node scripts/artifact.mjs delete-asset <root> <url|id>         remove an upload nothing names any more
  node scripts/artifact.mjs check    <root>                      check the film's documents; exit 1 on problems
  node scripts/artifact.mjs open     <root> [--port n]           start the player in the background; prints {"url"}
  node scripts/artifact.mjs serve    <root> [--port n]           the same server, in the foreground
  node scripts/artifact.mjs stop     <root>                      stop the background player
  node scripts/artifact.mjs unpack   <root> <new-dir>            lay the film out for render-offline.md (stills, only when asked)

<root> is the film's folder: documents at <root>/db/<collection>/<doc_id>.json, uploads in <root>/_blobs/.
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
        text = from === "-" ? fs2.readFileSync(0, "utf8") : fs2.readFileSync(path2.resolve(from), "utf8");
      } catch {
        throw new CliError("FILE_NOT_FOUND", `No such batch file: ${from}`);
      }
      let batch;
      try {
        batch = JSON.parse(text);
      } catch (error) {
        throw new CliError("INVALID_BATCH", `The batch is not JSON: ${error.message}`);
      }
      const writes = Array.isArray(batch) ? batch : Array.isArray(batch?.writes) ? batch.writes : isObject(batch) && batch.op ? [batch] : null;
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
