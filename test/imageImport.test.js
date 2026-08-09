// Importing an image from the author's machine into the project.
//
// THE TWO PROPERTIES THAT MATTER:
//   1. The copy lands inside the CALLER's root and nowhere else, whatever the
//      source path looks like.
//   2. An existing asset is never overwritten. Another file that happens to
//      share a name is somebody's work.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readSource = async (rel) =>
  (await fs.readFile(new URL(rel, import.meta.url), "utf8")).replace(/\r\n/g, "\n");

const {
  importImage,
  safeImportFileName,
  uniqueDestination,
  detectImageType,
  IMAGE_EXTENSIONS,
  MAX_IMPORT_BYTES,
} = await import("../src/services/imageImport.js");

// A scratch root INSIDE the project (that is what an import root is), removed
// afterwards. Never the real assets/background/start-menu/ folder.
const TEST_ROOT = "assets/__import_test__/";
const testDirAbs = path.join(projectRoot, TEST_ROOT);

let outside; // stands in for "anywhere on the author's computer"

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 7),
]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 3)]);
const WEBP = Buffer.concat([
  Buffer.from("RIFF", "ascii"),
  Buffer.alloc(4, 1),
  Buffer.from("WEBP", "ascii"),
  Buffer.alloc(64, 5),
]);

before(async () => {
  outside = await fs.mkdtemp(path.join(os.tmpdir(), "aether-import-src-"));
  await fs.mkdir(testDirAbs, { recursive: true });
});

after(async () => {
  await fs.rm(outside, { recursive: true, force: true });
  await fs.rm(testDirAbs, { recursive: true, force: true });
});

const src = async (name, bytes = PNG) => {
  const p = path.join(outside, name);
  await fs.writeFile(p, bytes);
  return p;
};

// ================================================================ the name

test("a source name is reduced to a safe leaf, never a path", () => {
  // Separators are REMOVED rather than treated as a path split, so no part of
  // a directory can survive as a directory. (importImage passes a basename in
  // anyway; this is the second line of defence, tested directly.)
  assert.equal(safeImportFileName("../../etc/passwd.png"), "etcpasswd");
  assert.equal(safeImportFileName("a/b/c.png"), "abc");
  assert.equal(safeImportFileName("..\\..\\win.png"), "win");
  assert.equal(safeImportFileName("...leading.png"), "leading");
  assert.equal(safeImportFileName("my photo.PNG"), "my_photo");
  assert.equal(safeImportFileName('we:ir*d?"<>|.png'), "weird");
  assert.equal(safeImportFileName(""), "");
  assert.equal(safeImportFileName("ok_name-1.webp"), "ok_name-1");
  // No separator survives, so the result can never redirect the write.
  for (const evil of ["../x.png", "..\\x.png", "/abs/x.png", "C:\\x.png"]) {
    const out = safeImportFileName(evil);
    assert.ok(!out.includes("/") && !out.includes("\\") && !out.includes(".."), evil);
  }
});

// ============================================================== the content

test("the file signature is checked, not just the extension", async () => {
  assert.equal(detectImageType(PNG), ".png");
  assert.equal(detectImageType(JPG), ".jpg");
  assert.equal(detectImageType(WEBP), ".webp");
  assert.equal(detectImageType(Buffer.from("MZ this is an executable")), "");

  // An .exe renamed to .png must not enter the asset tree.
  const liar = await src("payload.png", Buffer.from("MZ\x90\x00 not an image at all"));
  await assert.rejects(() => importImage(liar, { root: TEST_ROOT }), /not a valid PNG image/);
  assert.deepEqual(await fs.readdir(testDirAbs), [], "nothing was written");
});

test("every supported format is accepted", async () => {
  for (const [name, bytes, ext] of [
    ["a.png", PNG, ".png"],
    ["b.jpg", JPG, ".jpg"],
    ["c.jpeg", JPG, ".jpeg"], // .jpeg and .jpg are the same format
    ["d.webp", WEBP, ".webp"],
  ]) {
    const result = await importImage(await src(name, bytes), { root: TEST_ROOT });
    assert.ok(result.path.endsWith(ext), result.path);
    assert.ok(result.path.startsWith(TEST_ROOT));
  }
  await fs.rm(testDirAbs, { recursive: true, force: true });
  await fs.mkdir(testDirAbs, { recursive: true });
});

test("unsupported types are refused before anything is read", async () => {
  assert.deepEqual(IMAGE_EXTENSIONS, [".png", ".jpg", ".jpeg", ".webp"]);
  for (const name of ["x.gif", "x.bmp", "x.svg", "x.tiff", "x.exe", "x.als", "x"]) {
    const from = await src(name, PNG);
    await assert.rejects(() => importImage(from, { root: TEST_ROOT }), /Unsupported image type/);
  }
  assert.deepEqual(await fs.readdir(testDirAbs), []);
});

test("case does not defeat the extension check", async () => {
  const result = await importImage(await src("SHOUTY.PNG"), { root: TEST_ROOT });
  assert.equal(result.path, `${TEST_ROOT}SHOUTY.png`);
  await fs.rm(path.join(projectRoot, result.path), { force: true });
});

// ============================================================== the source

test("a source outside the project is exactly what this accepts", async () => {
  const from = await src("portal.png");
  assert.ok(!path.resolve(from).startsWith(projectRoot), "the fixture really is outside the project");
  const result = await importImage(from, { root: TEST_ROOT });
  assert.equal(result.path, `${TEST_ROOT}portal.png`);
  // Copied, not moved — the author keeps their original.
  assert.ok((await fs.stat(from)).isFile());
  assert.deepEqual(await fs.readFile(path.join(projectRoot, result.path)), PNG);
  await fs.rm(path.join(projectRoot, result.path), { force: true });
});

test("a missing, empty, relative or oversized source is refused", async () => {
  await assert.rejects(() => importImage(path.join(outside, "nope.png"), { root: TEST_ROOT }), /does not exist/);
  await assert.rejects(() => importImage("relative/x.png", { root: TEST_ROOT }), /must be absolute/);
  await assert.rejects(() => importImage("", { root: TEST_ROOT }), /No image was selected/);
  const empty = path.join(outside, "empty.png");
  await fs.writeFile(empty, Buffer.alloc(0));
  await assert.rejects(() => importImage(empty, { root: TEST_ROOT }), /empty/);
  assert.equal(MAX_IMPORT_BYTES, 64 * 1024 * 1024);
});

test("a directory is not an image", async () => {
  const dir = path.join(outside, "folder.png");
  await fs.mkdir(dir, { recursive: true });
  await assert.rejects(() => importImage(dir, { root: TEST_ROOT }), /not a file|does not exist/);
});

// =========================================================== the collision

test("a name collision produces _2, _3 — never an overwrite", async () => {
  const original = Buffer.concat([PNG, Buffer.from("ORIGINAL")]);
  const replacement = Buffer.concat([PNG, Buffer.from("SECOND")]);
  await fs.writeFile(path.join(testDirAbs, "art.png"), original);

  const second = await importImage(await src("art.png", replacement), { root: TEST_ROOT });
  assert.equal(second.path, `${TEST_ROOT}art_2.png`);
  const third = await importImage(await src("art.png", replacement), { root: TEST_ROOT });
  assert.equal(third.path, `${TEST_ROOT}art_3.png`);

  // THE POINT: the first file is byte-identical to what it was.
  assert.deepEqual(await fs.readFile(path.join(testDirAbs, "art.png")), original);

  await fs.rm(testDirAbs, { recursive: true, force: true });
  await fs.mkdir(testDirAbs, { recursive: true });
});

test("uniqueDestination hands back the plain name when nothing is there", async () => {
  assert.equal(await uniqueDestination(testDirAbs, "fresh", ".png"), "fresh.png");
});

// ================================================== adopt, not duplicate
//
// THE BUG THIS CLOSES: the picker naturally opens in the destination folder, so
// choosing art already in the project ran the full import and minted
// menu_bg_2.png, menu_bg_3.png… on every pick. A file already in the folder IS
// the project asset; there is nothing to import.

test("a source already in the root is adopted, never copied", async () => {
  const original = Buffer.concat([PNG, Buffer.from("IN-ROOT")]);
  await fs.writeFile(path.join(testDirAbs, "already.png"), original);
  const before = await fs.readdir(testDirAbs);

  const result = await importImage(path.join(testDirAbs, "already.png"), { root: TEST_ROOT });
  assert.equal(result.adopted, true);
  assert.equal(result.path, `${TEST_ROOT}already.png`);
  // ZERO filesystem change.
  assert.deepEqual((await fs.readdir(testDirAbs)).sort(), before.sort());
  assert.deepEqual(await fs.readFile(path.join(testDirAbs, "already.png")), original);
});

test("picking the same in-root file repeatedly never creates _2", async () => {
  await fs.writeFile(path.join(testDirAbs, "menu_bg.png"), PNG);
  for (let i = 0; i < 5; i += 1) {
    const r = await importImage(path.join(testDirAbs, "menu_bg.png"), { root: TEST_ROOT });
    assert.equal(r.path, `${TEST_ROOT}menu_bg.png`, `pick ${i + 1}`);
    assert.equal(r.adopted, true);
  }
  const files = await fs.readdir(testDirAbs);
  assert.equal(files.filter((f) => /^menu_bg/.test(f)).length, 1, "exactly one menu_bg file");
  assert.ok(!files.some((f) => /_2\./.test(f)), files.join(", "));
});

test("switching between two in-root files copies nothing", async () => {
  await fs.writeFile(path.join(testDirAbs, "a.png"), PNG);
  await fs.writeFile(path.join(testDirAbs, "b.png"), PNG);
  const before = (await fs.readdir(testDirAbs)).sort();
  for (const n of ["a.png", "b.png", "a.png", "b.png"]) {
    const r = await importImage(path.join(testDirAbs, n), { root: TEST_ROOT });
    assert.equal(r.path, `${TEST_ROOT}${n}`);
    assert.equal(r.adopted, true);
  }
  assert.deepEqual((await fs.readdir(testDirAbs)).sort(), before);
});

test("adoption keeps the real filename — no sanitizing, no renaming", async () => {
  // The file is already a project asset; renaming it would break every other
  // reference to it.
  await fs.writeFile(path.join(testDirAbs, "My Art-01.png"), PNG);
  const r = await importImage(path.join(testDirAbs, "My Art-01.png"), { root: TEST_ROOT });
  assert.equal(r.path, `${TEST_ROOT}My Art-01.png`);
  assert.equal(r.adopted, true);
  assert.ok((await fs.readdir(testDirAbs)).includes("My Art-01.png"));
});

test("a genuine external import still copies exactly once, and still collides to _2", async () => {
  const from = await src("external.png");
  const first = await importImage(from, { root: TEST_ROOT });
  assert.equal(first.adopted, false, "an outside file is a real import");
  assert.equal(first.path, `${TEST_ROOT}external.png`);

  const second = await importImage(from, { root: TEST_ROOT });
  assert.equal(second.adopted, false);
  assert.equal(second.path, `${TEST_ROOT}external_2.png`, "genuine collision still gets _2");

  // Re-picking the copy that now lives in the folder adopts instead of chaining
  // to external_3.png.
  const third = await importImage(path.join(testDirAbs, "external.png"), { root: TEST_ROOT });
  assert.equal(third.adopted, true);
  assert.equal(third.path, `${TEST_ROOT}external.png`);
  assert.ok(!(await fs.readdir(testDirAbs)).includes("external_3.png"));
});

test("a file in a SUBfolder of the root is a real import, not an adoption", async () => {
  // Its reference has to be flattened into the root to be a valid asset path,
  // so this one genuinely has to be copied.
  const nested = path.join(testDirAbs, "nested");
  await fs.mkdir(nested, { recursive: true });
  await fs.writeFile(path.join(nested, "deep.png"), PNG);
  const r = await importImage(path.join(nested, "deep.png"), { root: TEST_ROOT });
  assert.equal(r.adopted, false);
  assert.equal(r.path, `${TEST_ROOT}deep.png`);
  await fs.rm(nested, { recursive: true, force: true });
});

test("the adopted reference is project-relative, never the absolute source", async () => {
  await fs.writeFile(path.join(testDirAbs, "rel.png"), PNG);
  const r = await importImage(path.join(testDirAbs, "rel.png"), { root: TEST_ROOT });
  assert.ok(!path.isAbsolute(r.path));
  assert.ok(!r.path.includes("\\"));
  assert.ok(r.path.startsWith(TEST_ROOT));
  assert.ok(!r.path.includes(projectRoot));
});

test("adoption still validates — a bogus in-root file is refused", async () => {
  await fs.writeFile(path.join(testDirAbs, "fake.png"), Buffer.from("MZ not an image"));
  await assert.rejects(() => importImage(path.join(testDirAbs, "fake.png"), { root: TEST_ROOT }), /not a valid PNG/);
  await assert.rejects(() => importImage(path.join(testDirAbs, "fake.png"), { root: "assets/other/" }), /not a valid PNG/);
  await fs.rm(path.join(testDirAbs, "fake.png"), { force: true });
});

// =============================================================== the root

test("the destination stays inside the caller's root", async () => {
  const from = await src("x.png");
  const result = await importImage(from, { root: TEST_ROOT });
  const abs = path.resolve(projectRoot, result.path);
  assert.ok(abs.startsWith(path.resolve(testDirAbs) + path.sep), abs);
  // The stored value is project-relative and forward-slashed — never the
  // absolute source path the author picked from.
  assert.ok(!path.isAbsolute(result.path));
  assert.ok(!result.path.includes("\\"));
  assert.ok(!result.path.includes(outside));
  await fs.rm(abs, { force: true });
});

test("a caller cannot aim the import outside the project", async () => {
  const from = await src("x.png");
  for (const bad of ["", "/etc/", "../../", "assets/../../", undefined, null, 42, "assets/no-trailing-slash"]) {
    await assert.rejects(() => importImage(from, { root: bad }), /import root is required/, String(bad));
  }
});

test("the root is chosen by the SERVER from an allowlist, never by the client", async () => {
  const server = await readSource("../src/server.js");
  // One fixed table, now two domains: start-menu art and app icons. Growth is
  // by ADDING a named kind, never by letting a caller name a folder.
  assert.match(server, /const IMPORT_ROOTS = \{ "start-menu-background": START_MENU_ROOT, "app-icon": APP_ICON_ROOT \};/);
  const route = server.slice(server.indexOf('app.post("/api/dev/import-image"'), server.indexOf('app.post("/api/dev/image-dialog"'));
  assert.match(route, /const root = IMPORT_ROOTS\[req\.body\?\.kind\];/);
  assert.match(route, /if \(!root\) throw/);
  // The request body supplies a KIND and a source path — never a destination.
  assert.doesNotMatch(route, /req\.body\?\.root|req\.body\?\.dest|req\.body\?\.destination/);
});

// ======================================================= reusable, generic

test("the service is generic — nothing in it knows about start menus", async () => {
  // Comments stripped: the doc comment legitimately names the first caller and
  // gives its root as an example, which is the opposite of a dependency.
  const src_ = (await readSource("../src/services/imageImport.js")).replace(/^[ \t]*\/\/[^\n]*$/gm, "");
  assert.doesNotMatch(src_, /start-menu|startMenu|start_menu/i, "the root is the caller's, per task §7");
  // Which is what lets Map Background reuse it later by passing its own root.
  const result = await importImage(await src("generic.png"), { root: TEST_ROOT });
  assert.equal(result.path, `${TEST_ROOT}generic.png`);
  await fs.rm(path.join(projectRoot, result.path), { force: true });
});

test("no image decoding dependency was added", async () => {
  const pkg = JSON.parse(await readSource("../package.json"));
  assert.deepEqual(Object.keys(pkg.dependencies || {}).sort(), ["express", "pdf-parse"]);
  const src_ = await readSource("../src/services/imageImport.js");
  assert.match(src_, /copied verbatim|bytes are copied/i);
});

// ============================================================== ownership

test("production has no import UI and no import route", async () => {
  const app = await readSource("../public/app.js");
  for (const forbidden of [/import-image/, /image-dialog/, /Import Image/, /importStartMenuImage/]) {
    assert.doesNotMatch(app, forbidden, `production must not contain ${forbidden}`);
  }
});
