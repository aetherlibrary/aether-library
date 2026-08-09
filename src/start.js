// Aether Library — the SHIPPED entry point (`npm start`).
//
// WHY THIS FILE EXISTS. The production default has to be established before
// src/config.js is evaluated, and a static `import` is hoisted: anything a
// module sets in its own body runs AFTER every module it imports has already
// been evaluated. Setting NODE_ENV at the top of server.js would therefore be
// too late — config.js would have read it as undefined. The dynamic `import()`
// below runs after the assignment, so the ordering is guaranteed rather than
// dependent on where an import statement happens to sit.
//
// WHY NOT A SHELL PREFIX. `NODE_ENV=production node src/server.js` is not
// portable: cmd.exe and PowerShell do not accept a leading VAR=value
// assignment, and Aether Library ships on Windows and macOS. Doing it in the
// Node bootstrap keeps ONE start command working identically on both, with no
// cross-env dependency.
//
// THE CONTRACT. This entry is UNCONDITIONALLY production. The assignment is
// not a default-if-absent (`??=`) on purpose: a shipped launch must not become
// an authoring launch because a stray NODE_ENV was exported in the user's
// shell. config.js treats production as a hard off that no DEV_TOOLS value can
// override, so from here the F8 Scene Editor, the /dev static mount and every
// /api/dev/* route are unreachable.
//
// Authoring runs through `npm run dev`, which starts server.js directly and
// leaves this file out of the picture entirely.
process.env.NODE_ENV = "production";

await import("./server.js");
