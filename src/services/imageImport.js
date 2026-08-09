// Importing an image from anywhere on the author's machine INTO the project.
//
// GENERIC ON PURPOSE (task §7): the Start Menu background is the first caller,
// but nothing here knows what a start menu is. The destination root is a
// CALLER-SUPPLIED restriction, so Map Background can reuse this untouched by
// passing its own root. That is also the security boundary — this module never
// picks a root of its own, and never accepts one from a client.
//
// WHAT IT DOES NOT DO: it does not decode, re-encode, resize or convert. The
// bytes are copied verbatim. Adding an image pipeline would mean a native
// dependency (see the Auto Shadow audit), and nothing here needs one.
//
// DEV-ONLY: the route that reaches this module is registered inside
// server.js's config.devTools gate.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"];

// A source image the author picked is their own file, but "big enough to be a
// background" is still bounded — a 200MB pick is a mistake, not an intent.
export const MAX_IMPORT_BYTES = 64 * 1024 * 1024;

function importError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// ---------------------------------------------------------------- the name
// Produces a SAFE LEAF NAME — never a path. Separators, traversal, control
// characters, device-hostile characters and leading dots are all removed
// rather than escaped, because the result has to be a filename on three
// platforms and inside a URL.
export function safeImportFileName(value) {
  const raw = String(value || "");
  const ext = path.extname(raw).toLowerCase();
  const stem = raw
    .slice(0, raw.length - ext.length)
    .replace(/[\x00-\x1f\x7f]/g, "")
    .replace(/[\\/]/g, "")          // separators: a name, never a path
    .replace(/[:*?"<>|]/g, "")      // invalid on Windows
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9._-]/g, "") // conservative: URL- and shell-inert
    .replace(/^[.]+/, "")            // no leading dots — no hidden files, no ".."
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  return stem;
}

// Validates the extension against the CALLER's allowlist and returns it
// lowercased, so "PHOTO.PNG" and "photo.png" land on the same rule.
function validatedExtension(sourcePath, extensions) {
  const ext = path.extname(String(sourcePath || "")).toLowerCase();
  if (!extensions.includes(ext)) {
    throw importError(
      400,
      `Unsupported image type "${ext || "(none)"}". Supported: ${extensions.join(", ")}.`
    );
  }
  return ext;
}

// ------------------------------------------------------------- the content
// The extension is a claim; these are the bytes. Checking the signature stops
// an arbitrary file (an .exe renamed to .png) from being copied into the
// project's asset tree and later served.
const SIGNATURES = [
  { ext: ".png", test: (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: ".jpg", test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: ".webp", test: (b) => b.length > 12 && b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP" },
];

export function detectImageType(buffer) {
  for (const sig of SIGNATURES) if (sig.test(buffer)) return sig.ext;
  return "";
}

// .jpg and .jpeg are the same format; everything else must match exactly.
function signatureMatches(detected, ext) {
  if (!detected) return false;
  if (detected === ".jpg") return ext === ".jpg" || ext === ".jpeg";
  return detected === ext;
}

// -------------------------------------------------------------- collisions
// example.png → example_2.png → example_3.png. NEVER an overwrite: another
// asset that happens to share a name is somebody's work, and silently
// replacing it is the one outcome an import must not produce.
export async function uniqueDestination(dirAbs, stem, ext) {
  for (let n = 1; n < 1000; n += 1) {
    const name = n === 1 ? `${stem}${ext}` : `${stem}_${n}${ext}`;
    try {
      await fs.access(path.join(dirAbs, name));
    } catch {
      return name; // nothing there — this name is free
    }
  }
  throw importError(400, "Too many files with that name already exist.");
}

// ------------------------------------------------------------------ import
// `root` is the project-relative destination directory and is the caller's
// restriction, e.g. "assets/background/start-menu/". The resolved destination
// is re-checked against it after joining, so no combination of inputs can
// escape the intended folder.
export async function importImage(sourcePath, { root, extensions = IMAGE_EXTENSIONS } = {}) {
  if (typeof root !== "string" || !root.endsWith("/") || root.startsWith("/") || root.includes("..")) {
    throw importError(500, "An import root is required.");
  }
  const source = String(sourcePath || "").trim();
  if (!source) throw importError(400, "No image was selected.");
  if (source.includes("\0")) throw importError(400, "Invalid image path.");
  // The source is genuinely absolute — it comes from the author's own native
  // file dialog and legitimately lives outside the project.
  if (!path.isAbsolute(source)) throw importError(400, "The image path must be absolute.");

  const ext = validatedExtension(source, extensions);

  let stat;
  try {
    stat = await fs.stat(source);
  } catch (err) {
    if (err.code === "ENOENT") throw importError(404, "That image file does not exist.");
    if (err.code === "EACCES" || err.code === "EPERM") throw importError(403, "Permission denied reading that image.");
    throw importError(500, err.message);
  }
  if (!stat.isFile()) throw importError(400, "That is not a file.");
  if (stat.size === 0) throw importError(400, "That image file is empty.");
  if (stat.size > MAX_IMPORT_BYTES) {
    throw importError(400, `That image is too large (${Math.round(stat.size / 1048576)}MB, limit ${MAX_IMPORT_BYTES / 1048576}MB).`);
  }

  const bytes = await fs.readFile(source);
  const detected = detectImageType(bytes);
  if (!signatureMatches(detected, ext)) {
    throw importError(400, `That file is not a valid ${ext.replace(".", "").toUpperCase()} image.`);
  }

  const dirAbs = path.join(projectRoot, root);

  // ADOPT, DO NOT DUPLICATE.
  //
  // A file that already lives in the destination folder IS the project asset —
  // there is nothing to import. Copying it produced a new image_2.png on every
  // pick, so an author who opened the picker on art they already had ended up
  // with menu_bg.png, menu_bg_2.png, menu_bg_3.png… The picker naturally opens
  // in this folder, which made it easy to hit.
  //
  // DIRECT CHILDREN ONLY: a file in a SUBfolder of the root is still a real
  // import, because the reference has to be flattened into the root to be a
  // valid asset path. Compared case-insensitively on Windows, where the same
  // file can be spelled with different case and must not read as two files.
  const sourceAbs = path.resolve(source);
  const sameDir =
    process.platform === "win32"
      ? path.dirname(sourceAbs).toLowerCase() === path.resolve(dirAbs).toLowerCase()
      : path.dirname(sourceAbs) === path.resolve(dirAbs);
  if (sameDir) {
    const name = path.basename(sourceAbs);
    return { path: `${root}${name}`, name, bytes: bytes.length, adopted: true };
  }

  const stem = safeImportFileName(path.basename(source)) || "image";
  await fs.mkdir(dirAbs, { recursive: true });
  const name = await uniqueDestination(dirAbs, stem, ext);
  const destAbs = path.join(dirAbs, name);

  // Belt and braces: whatever the inputs were, the destination resolved inside
  // the caller's root or nothing is written.
  const rootAbs = path.join(projectRoot, root);
  if (!path.resolve(destAbs).startsWith(path.resolve(rootAbs) + path.sep)) {
    throw importError(400, "The destination escaped the import folder.");
  }

  await fs.writeFile(destAbs, bytes);
  // Project-relative, forward-slashed — the external absolute source path is
  // never stored anywhere. `adopted: false` distinguishes a real copy from the
  // in-root adoption above, so the caller can report the right thing.
  return { path: `${root}${name}`, name, bytes: bytes.length, adopted: false };
}
