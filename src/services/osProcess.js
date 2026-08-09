// Running an OS helper process and capturing its output.
//
// Extracted from vaultConnection.js, which has used this exact shape for the
// native folder picker since it was written; the ALS file dialogs need the
// same thing, and spawning processes is security-relevant enough that it must
// not exist twice.
//
// ALWAYS spawn with an argv ARRAY, never a concatenated command line and never
// shell: true — a path or a filename with spaces or quotes in it can then
// never become extra arguments. Parameters that come from data (a suggested
// filename, a directory) are passed through `env` instead of being written
// into a script string; see nativeFileDialog.js for why that matters there.

import { spawn } from "node:child_process";

function processError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// Resolves with the result even on a non-zero exit code (some OS openers,
// e.g. explorer.exe, exit non-zero on success) — only a failure to start the
// process or a timeout rejects.
export function runCommand(command, args, { timeoutMs, env, timeoutMessage } = {}) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(command, args, {
        windowsHide: false,
        ...(env ? { env: { ...process.env, ...env } } : {}),
      });
    } catch (err) {
      reject(processError(500, `Could not start ${command}: ${err.message}`));
      return;
    }
    let stdout = "";
    let stderr = "";
    const timer = timeoutMs
      ? setTimeout(() => {
          child.kill();
          reject(processError(504, timeoutMessage || `Timed out running ${command}.`));
        }, timeoutMs)
      : null;
    child.stdout?.on("data", (d) => (stdout += d));
    child.stderr?.on("data", (d) => (stderr += d));
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      reject(processError(500, `Could not start ${command}: ${err.message}`));
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}
