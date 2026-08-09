// DEV-ONLY: hand a file to the operating system.
//
// The F8 Content tab used to offer "Copy Relative Path", because a browser
// cannot open a local file from a page. The path still had to be pasted
// somewhere by hand. This closes that gap for the developer workflow: Open
// hands the file to whatever the OS has associated with .json (Cursor, VS
// Code, Notepad…), and Reveal shows it selected in the file manager.
//
// It deliberately does NOT implement an editor, a picker, or any way to
// choose a different file — see the route in server.js, which resolves the
// target from a fixed (kind, id) pair through the SAME validated resolvers
// the runtime uses. Nothing here accepts a caller-supplied path.
//
// Registered only inside server.js's `config.devTools` gate: a production
// run has no such route, and this module is never reached.

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

function openError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// Fire-and-forget, the same way vaultConnection.openFolder() does it: the
// opener's exit code is not a useful success signal (explorer.exe in
// particular reports non-zero on a perfectly good open), and waiting would
// block the request on a GUI application's lifetime.
function launch(command, args) {
  try {
    const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: false });
    child.unref();
  } catch (err) {
    throw openError(500, `Could not launch the system handler: ${err.message}`);
  }
}

// `targetPath` must already be resolved by the caller from validated parts —
// this module never turns user input into a path.
export async function openPathInOs(targetPath, { reveal = false } = {}) {
  try {
    const stat = await fs.stat(targetPath);
    if (!stat.isFile()) throw openError(400, "That content path is not a file.");
  } catch (err) {
    if (err.status) throw err;
    if (err.code === "ENOENT") throw openError(404, "That file does not exist on disk.");
    if (err.code === "EACCES" || err.code === "EPERM") throw openError(403, "Permission denied reading that file.");
    throw openError(500, err.message);
  }

  if (reveal) {
    // Select the file inside its folder where the platform supports it.
    if (process.platform === "win32") {
      // The comma is part of explorer's own syntax and must NOT be a separate
      // argument — `/select,<path>` is one token.
      launch("explorer.exe", [`/select,${targetPath}`]);
    } else if (process.platform === "darwin") {
      launch("open", ["-R", targetPath]);
    } else {
      // No portable "select the file" on Linux — open the containing folder.
      launch("xdg-open", [path.dirname(targetPath)]);
    }
    return { revealed: true };
  }

  // Open with whatever the OS has associated with the extension.
  if (process.platform === "win32") {
    // `start` is a cmd builtin, so it needs a shell. The empty "" is start's
    // window-title argument — without it, a quoted path is mistaken for one.
    launch("cmd.exe", ["/c", "start", "", targetPath]);
  } else if (process.platform === "darwin") {
    launch("open", [targetPath]);
  } else {
    launch("xdg-open", [targetPath]);
  }
  return { opened: true };
}
