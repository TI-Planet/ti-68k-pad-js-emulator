import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const outer = "/Users/adriweb/Documents/PhpstormProjects/TI-Planet";
const pad = path.join(outer, "pad_ti68k_emu");
const research = "/private/tmp/ti68k_history_research";
const patrick = path.join(research, "patrick");
const target = process.env.TI68K_HISTORY_TARGET || path.join(outer, "ti68k-emulator-history");

if (fs.existsSync(target)) {
  throw new Error(`Refusing to overwrite existing target: ${target}`);
}
fs.mkdirSync(target, { recursive: true });

function git(args, options = {}) {
  return execFileSync("git", args, {
    cwd: target,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    env: { ...process.env, ...options.env },
  });
}

git(["init", "-b", "main"]);
git(["config", "user.name", "History Reconstruction"]);
git(["config", "user.email", "history@invalid.example"]);
git(["config", "commit.gpgsign", "false"]);

const people = {
  patrick: { name: "Patrick Davidson", email: "eeulplek@hotmail.com" },
  lionel: { name: "Lionel Debroux", email: "lionel_debroux@yahoo.fr" },
  xavier: { name: "Xavier Andréani", email: "andreanx@hotmail.com" },
  adrien: { name: "Adrien Bertrand", email: "bertrand.adrien@gmail.com" },
  logicaljoe: { name: "LogicalJoe", email: "LJ@LogicalJoe.com" },
};

function copy(source, destination) {
  const dst = path.join(target, destination);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(source, dst);
}

function remove(...relativePaths) {
  for (const relativePath of relativePaths) {
    fs.rmSync(path.join(target, relativePath), { recursive: true, force: true });
  }
}

function replaceTree(sourceDirectory) {
  const resolvedTarget = path.resolve(target);
  if (resolvedTarget === "/" || !fs.existsSync(path.join(resolvedTarget, ".git"))) {
    throw new Error(`Unsafe or uninitialized target during replacement: ${resolvedTarget}`);
  }
  for (const entry of fs.readdirSync(target)) {
    if (entry !== ".git") {
      fs.rmSync(path.join(target, entry), { recursive: true, force: true });
    }
  }
  fs.cpSync(sourceDirectory, target, {
    recursive: true,
    dereference: false,
    verbatimSymlinks: true,
  });
  // These unrelated artifacts and proprietary TI ROM payloads happened to
  // share the source directories but are deliberately outside this history.
  remove("essai.c", "ourworld_in_emu.png", "v4rom.js", "v12rom.js");
}

function commit({
  subject,
  body,
  author,
  date,
  committer = author,
  commitDate = date,
  coAuthors = [],
}) {
  git(["add", "-A"]);
  try {
    git(["diff", "--cached", "--quiet"], { capture: true });
    const head = git(["rev-parse", "HEAD"], { capture: true }).trim();
    console.log(`Skipping byte-identical snapshot: ${subject} -> ${head}`);
    return head;
  } catch {
    // A non-zero diff --quiet status means there is a real tree change.
  }
  const trailer = coAuthors
    .map((person) => `Co-authored-by: ${person.name} <${person.email}>`)
    .join("\n");
  const fullBody = [body, trailer].filter(Boolean).join("\n\n");
  const env = {
    GIT_AUTHOR_NAME: author.name,
    GIT_AUTHOR_EMAIL: author.email,
    GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_NAME: committer.name,
    GIT_COMMITTER_EMAIL: committer.email,
    GIT_COMMITTER_DATE: commitDate,
  };
  const args = ["commit", "--no-gpg-sign", "-m", subject];
  if (fullBody) args.push("-m", fullBody);
  git(args, { env });
  return git(["rev-parse", "HEAD"], { capture: true }).trim();
}

function tag(name) {
  git(["tag", name]);
}

function evidenceBody(source, extra = "") {
  return [
    `Reconstructed-from: ${source}`,
    extra,
    "This commit records a surviving snapshot; it is not an original recovered Git commit.",
  ].filter(Boolean).join("\n");
}

// Patrick Davidson's surviving JavaScript series. The dates come from the
// original server mtimes preserved in Wayback's 2013-05-30 directory capture.
copy(path.join(patrick, "v3-20120501.html"), "v3.html");
for (const file of ["v3inst.js", "v3rom.js", "v3sav.js"]) {
  copy(path.join(patrick, file), file);
}
commit({
  subject: "Patrick v3 / alpha 2: first surviving JavaScript emulator",
  body: evidenceBody(
    "Wayback capture 20120501080936 + OCF server mtime 2012-04-20 for v3 runtime files",
    "The filename is v3.html, while the page identifies itself as alpha version 2. Earlier v1/v2 JavaScript snapshots and the listed v2/v3 generator sources were not captured by Wayback."
  ),
  author: people.patrick,
  date: "2012-04-20T17:11:00-07:00",
});
tag("patrick-v3-alpha2");

remove("v3.html", "v3inst.js", "v3rom.js", "v3sav.js");
for (const file of ["v4inst.js", "v4rom.js", "v4sav.js"]) {
  copy(path.join(patrick, file), file);
}
for (const file of ["v4inst.py", "v4savconv.py", "v4tibconv.py"]) {
  copy(path.join(patrick, "scripts-extracted", file), file);
}
copy(path.join(patrick, "v4-20120602.html"), "v4.html");
commit({
  subject: "Patrick v4: word-oriented core and generated instruction tables",
  body: evidenceBody("Wayback capture 20120602011013 + OCF server mtime 2012-05-14 21:04 + archived scripts.zip", "The Python generator and converter sources were recovered from scripts.zip; their individual Wayback URLs were not captured."),
  author: people.patrick,
  date: "2012-05-14T21:04:00-07:00",
});
tag("patrick-v4");

copy(path.join(patrick, "emu-20120602.html"), "legacy-java/emu.html");
commit({
  subject: "Document Java emulator alpha 1",
  body: evidenceBody("Wayback capture 20120602011007 + OCF server mtime 2012-05-28 19:13", "This related Java implementation predates the surviving alpha 2 package."),
  author: people.patrick,
  date: "2012-05-28T19:13:00-07:00",
});
tag("patrick-java-alpha1");

for (const file of ["jemu.java", "jemucalc.java", "jemumode.java", "jemuproc.java"]) {
  copy(path.join(patrick, file), path.join("legacy-java", file));
}
commit({
  subject: "Preserve Patrick's Java TI-89 emulator sources",
  body: evidenceBody("OCF server mtime 2012-06-02 16:14", "This is a related predecessor/parallel implementation, preserved under legacy-java rather than presented as a direct JavaScript snapshot."),
  author: people.patrick,
  date: "2012-06-02T16:14:00-07:00",
});

copy(path.join(patrick, "emu-20120703.html"), "legacy-java/emu.html");
commit({
  subject: "Document and package Java emulator alpha 2",
  body: evidenceBody("Wayback capture 20120703035234 + OCF server mtime 2012-06-25 18:58"),
  author: people.patrick,
  date: "2012-06-25T18:58:00-07:00",
});
tag("patrick-java-alpha2");

copy(path.join(patrick, "v4-20120703.html"), "v4.html");
commit({
  subject: "Instrument v4 frame performance",
  body: evidenceBody("distinct Wayback capture 20120703042650", "This snapshot times each main-loop frame and reports the average over 1000 frames. The capture timestamp is used because the archived directory mtime did not change."),
  author: people.patrick,
  date: "2012-07-03T04:26:50Z",
});
tag("patrick-v4-instrumented");

remove("v4.html", "v4inst.js", "v4inst.py");
copy(path.join(patrick, "v6.html"), "v6.html");
copy(path.join(patrick, "v6inst.js"), "v6inst.js");
commit({
  subject: "Patrick v6: expand the 68000 instruction implementation",
  body: evidenceBody("OCF server mtime 2012-10-13 19:35-19:36", "No surviving v5 snapshot was found."),
  author: people.patrick,
  date: "2012-10-13T19:36:00-07:00",
});
tag("patrick-v6");

remove("v6.html", "v6inst.js");
copy(path.join(patrick, "v7.html"), "v7.html");
commit({
  subject: "Patrick v7: inline generated instruction handling",
  body: evidenceBody("OCF server mtime 2012-11-10 17:14"),
  author: people.patrick,
  date: "2012-11-10T17:14:00-08:00",
});
tag("patrick-v7");

copy(path.join(pad, "Ti-92plus.jpg"), "Ti-92plus.jpg");
remove("v7.html");
copy(path.join(patrick, "v8.html"), "v8.html");
commit({
  subject: "Patrick v8: load local ROM and OS upgrade images",
  body: evidenceBody("OCF server mtime 2012-12-01 11:33", "The TI-92 Plus skin image has OCF server mtime 2012-11-18."),
  author: people.patrick,
  date: "2012-12-01T11:33:00-08:00",
});
tag("patrick-v8");

remove("v8.html");
copy(path.join(patrick, "v9.html"), "v9.html");
commit({
  subject: "Patrick v9: improve ROM loading and compatibility",
  body: evidenceBody("OCF server mtime 2013-05-05 13:10"),
  author: people.patrick,
  date: "2013-05-05T13:10:00-07:00",
});
tag("patrick-v9");

remove("v9.html");
copy(path.join(patrick, "v10-20131023.html"), "v10.html");
commit({
  subject: "Patrick v10: add RAM flags and core refinements",
  body: evidenceBody("OCF server mtime 2013-05-05 13:10; content verified against Wayback capture 20131023171934"),
  author: people.patrick,
  date: "2013-05-05T13:10:01-07:00",
});
tag("patrick-v10");

remove("v10.html");
copy(path.join(patrick, "v11-20131023.html"), "v11.html");
commit({
  subject: "Patrick v11 beta: final surviving original JavaScript release",
  body: evidenceBody("OCF server mtime 2013-05-05 16:54; earliest distinct Wayback capture 20131023173719"),
  author: people.patrick,
  date: "2013-05-05T16:54:00-07:00",
});
tag("patrick-v11");

// Patrick's original page continued independently after Lionel's fork.  The
// later touchscreen fix belongs on a side branch so Lionel still forks the
// exact earlier v11 snapshot that his July 2013 work used.
const patrickV11ForkPoint = git(["rev-parse", "HEAD"], { capture: true }).trim();
git(["switch", "-c", "patrick-original"]);
copy(path.join(patrick, "v11-20131124.html"), "v11.html");
commit({
  subject: "Fix touchscreen key events in Patrick v11",
  body: evidenceBody("OCF server mtime 2013-11-02 07:25 + distinct Wayback captures 20131023173719 and 20131124021037", "Replaces the nonexistent touchdown/touchup handlers with touchstart/touchend and clears keys on touchleave/touchcancel."),
  author: people.patrick,
  date: "2013-11-02T07:25:00-07:00",
});
tag("patrick-v11-touch");
git(["switch", "main"]);
if (git(["rev-parse", "HEAD"], { capture: true }).trim() !== patrickV11ForkPoint) {
  throw new Error("Patrick v11 fork point moved unexpectedly");
}

// Lionel's first surviving TI-Planet tree is monolithic. It already contains
// work described in the later changelog as beginning in 2012 / spring 2013.
copy(path.join(pad, "v11_old.html"), "v11.html");
// Do not replace Patrick's free PedroM image with TI's proprietary AMS image.
remove("v4rom.js");
copy(path.join(pad, "v4sav.js"), "v4sav.js");
for (const file of ["ti89_skinmap.gif", "ti89t_skinmap.gif", "ti92p_skinmap.gif", "tiv200_skinmap.gif"]) {
  copy(path.join(pad, file), file);
}
commit({
  subject: "Begin TI-Planet multi-model TI-68k development from Patrick v11",
  body: evidenceBody(
    "pad_ti68k_emu/v11_old.html, mtime 2013-07-08 20:35:32 +0200",
    "The embedded later work log attributes generated memory accessors, AMS 2.x support, and TI-89/V200/89T support to Lionel Debroux during 2012 through July 2013."
  ),
  author: people.lionel,
  date: "2013-07-08T20:35:32+02:00",
});
tag("tiplanet-v11-monolithic");

const v11Events = [
  ["2013-07-11T19:47:33+02:00", "v11_readable_old.js", "Split v11 into readable JS and add linking/screenshot support", [people.adrien]],
  ["2013-07-12T08:45:28+02:00", "v11_readable_old2.js", "Support transfers outside the main folder", []],
  ["2013-07-12T21:52:16+02:00", "v11_readable_old3.js", "Refine exception and file-transfer handling", []],
  ["2013-07-13T12:56:33+02:00", "v11_readable_old4.js", "Fix math key bindings and add unscaled screen output", []],
  ["2013-07-13T19:32:29+02:00", "v11_readable_old5.js", "Add reset and debugger helpers with initial Flash support", []],
  ["2013-07-14T18:18:29+02:00", "v11_readable_old6.js", "Fix MMIO and ROM-base handling for TI-89", []],
  ["2013-07-15T13:58:11+02:00", "v11_readable_old7.js", "Add hardware ports and TI-89 keyboard handling", [people.xavier]],
  ["2013-07-15T19:39:03+02:00", "v11_readable_old8.js", "Use typed ROMs and model-specific memory/link handlers", []],
  ["2013-07-16T09:40:08+02:00", "v11_readable_old9.js", "Implement writable Flash memory emulation", []],
  ["2013-07-16T21:14:08+02:00", "v11_readable_old10.js", "Send large FlashApps through the AMS linking protocol", []],
  ["2013-07-18T11:06:27+02:00", "v11_readable_old11.js", "Split model key handlers and begin disassembler support", [people.xavier]],
  ["2013-07-20T15:16:35+02:00", "v11_readable_old12.js", "Autodetect calculator models and start receiving files", []],
  ["2013-07-21T15:10:51+02:00", "v11_readable_old13.js", "Accept string variable names when receiving files", []],
  ["2013-07-23T16:50:27+02:00", "v11_readable_old14.js", "Improve disassembly and reject invalid instructions", []],
  ["2013-07-23T18:42:25+02:00", "v11_readable.js", "Finalize the TI-Planet v11 readable standalone snapshot", []],
];

let v11Index = 0;
for (const [date, file, subject, coAuthors] of v11Events) {
  copy(path.join(pad, file), "v11_readable.js");
  if (file === "v11_readable.js") {
    copy(path.join(pad, "v11.html"), "v11.html");
    copy(path.join(pad, "v11chk.js"), "v11chk.js");
    copy(path.join(pad, "v11tibconv.py"), "v11tibconv.py");
  }
  commit({
    subject,
    body: evidenceBody(`pad_ti68k_emu/${file}, preserved mtime ${date}`),
    author: people.lionel,
    date,
    coAuthors,
  });
  v11Index += 1;
  tag(`tiplanet-v11-snapshot-${String(v11Index).padStart(2, "0")}`);
}
tag("tiplanet-v11");
tag("tiplanet-v11-old15-alias");

remove("v11.html", "v11_readable.js", "v11chk.js", "v11tibconv.py");

const v12Events = [
  { date: "2013-07-25T17:31:08+02:00", type: "js", file: "v12_readable_old.js", subject: "Create v12 and add calculator-to-browser file reception" },
  { date: "2013-07-25T18:38:56+02:00", type: "html", file: "v12_old2.html", subject: "Add the first surviving v12 standalone page" },
  { date: "2013-07-26T09:38:51+02:00", type: "js", file: "v12_readable_old2.js", subject: "Extract instruction execution and begin modularization" },
  { date: "2013-07-26T09:39:52+02:00", type: "html", file: "v12_old.html", subject: "Update the v12 standalone shell for modularization" },
  { date: "2013-07-26T18:00:16+02:00", type: "js", file: "v12_readable_old3.js", subject: "Wrap the emulator core in an exported object" },
  { date: "2013-07-26T18:42:24+02:00", type: "js", file: "v12_readable_old4.js", subject: "Separate UI logic and expose screen scaling" },
  { date: "2013-07-27T09:47:24+02:00", type: "html", file: "v12_old3.html", subject: "Expose v12 screen-scaling controls" },
  { date: "2013-07-27T19:27:31+02:00", type: "js", file: "v12_readable_old5.js", subject: "Improve keyboard interrupts and move screenshot UI helpers" },
  { date: "2013-07-27T19:27:40+02:00", type: "html", file: "v12_old4.html", subject: "Add pause/resume and skin-selection UI" },
  { date: "2013-07-28T12:26:01+02:00", type: "js", file: "v12_readable_old6.js", subject: "Integrate small skins and pause/resume support", coAuthors: [people.xavier] },
  { date: "2013-07-28T19:13:32+02:00", type: "js", file: "v12_readable_old7.js", subject: "Fix keymap switching and export debugger helpers" },
  { date: "2013-07-28T19:22:13+02:00", type: "html", file: "v12_old5.html", subject: "Refine the standalone skin-selection page" },
  { date: "2013-07-28T19:23:12+02:00", type: "html", file: "v12_old6.html", subject: "Update v12 standalone controls" },
  { date: "2013-07-30T07:10:30+02:00", type: "js", file: "v12_readable_old8.js", subject: "Fix BCD, shift, and rotate instruction emulation" },
  { date: "2013-08-03T17:58:02+02:00", type: "js", file: "v12_readable_old9.js", subject: "Add strict-mode support and single-step execution" },
  { date: "2013-08-04T09:17:55+02:00", type: "js", file: "v12_readable_old10.js", subject: "Expose CPU register setters and rename Flash-special accessors" },
  { date: "2013-08-04T15:00:04+02:00", type: "js", file: "v12_readable_old11.js", subject: "Correct shift and rotate behavior used by AMS math" },
  { date: "2013-08-04T19:44:33+02:00", type: "js", file: "v12_readable_old12.js", subject: "Fix TI-89 Titanium memory and add LCD hardware handling" },
  { date: "2013-08-06T20:36:43+02:00", type: "js", file: "v12_readable_old13.js", subject: "Record restored FlashApp compatibility" },
  { date: "2013-08-07T07:47:04+02:00", type: "js", file: "v12_readable_old14.js", subject: "Honor archive and lock flags during file transfer", extras: true },
  { date: "2013-12-13T12:00:00+01:00", type: "js", file: "v12_readable_old15.js", subject: "Add API versioning, copyright, and the consolidated work list", inferredDate: true },
  { date: "2014-01-01T12:00:00+01:00", type: "readme", file: "README.txt", subject: "Add standalone emulator README", inferredDate: true },
  { date: "2014-02-04T21:36:47+01:00", type: "js", file: "v12_readable_old16.js", subject: "Separate link module and implement pending interrupts", extras: true },
  { date: "2014-02-04T21:37:19+01:00", type: "html", file: "v12_old7.html", subject: "Update standalone page for the separated link module" },
  { date: "2014-02-04T22:20:38+01:00", type: "html", file: "v12_old8.html", subject: "Refine the modular standalone bootstrap" },
  { date: "2014-02-08T21:26:20+01:00", type: "js", file: "v12_readable_old17.js", subject: "Add larger scaling modes and classic VTI/TIEmu key bindings" },
  { date: "2014-02-08T21:29:47+01:00", type: "html", file: "v12_old9.html", subject: "Expose larger screen scaling modes" },
  { date: "2014-02-11T21:40:57+01:00", type: "js", file: "v12_readable_old18.js", subject: "Fix converter output and normalize function-key mappings" },
  { date: "2014-02-12T21:57:01+01:00", type: "html", file: "v12_old10.html", subject: "Update the standalone page after key-binding work" },
  { date: "2014-02-13T21:29:49+01:00", type: "html", file: "v12_old11.html", subject: "Update standalone keyboard and screen controls" },
  { date: "2014-02-13T21:29:50+01:00", type: "js", file: "v12_readable_old19.js", subject: "Expand key bindings and optimize TI-89 screen drawing" },
  { date: "2014-02-16T21:55:20+01:00", type: "js", file: "v12_readable_old20.js", subject: "Improve timers, grayscale, ROM booting, and Flash emulation" },
  { date: "2014-02-16T21:55:21+01:00", type: "html", file: "v12_old12.html", subject: "Update standalone feedback and color controls" },
  { date: "2014-02-17T21:57:09+01:00", type: "js", file: "v12_readable_old21.js", subject: "Add numeric keypad mappings and fix wake-from-sleep interrupts" },
  { date: "2014-02-17T21:57:10+01:00", type: "html", file: "v12_old13.html", subject: "Update standalone page for keypad and reset controls" },
  { date: "2014-02-23T21:36:40+01:00", type: "js", file: "v12_readable_old22.js", subject: "Add emulator speed controls" },
  { date: "2014-02-23T21:36:41+01:00", type: "html", file: "v12_old14.html", subject: "Expose emulator speed controls" },
  { date: "2014-02-24T08:24:24+01:00", type: "js", file: "v12_readable_old23.js", subject: "Implement branch costs and fix CHK exception handling" },
  { date: "2014-02-24T08:24:25+01:00", type: "html", file: "v12_old15.html", subject: "Update standalone controls for instruction timing work" },
  { date: "2014-02-24T21:29:24+01:00", type: "js", file: "v12_readable_old24.js", subject: "Improve bus/address error stack frames" },
  { date: "2014-02-24T21:29:25+01:00", type: "html", file: "v12_old16.html", subject: "Refresh the standalone v12 page" },
  { date: "2014-02-25T21:44:25+01:00", type: "js", file: "v12_readable_old25.js", subject: "Add effective-address timing calculations" },
  { date: "2014-02-25T21:44:26+01:00", type: "html", file: "v12_old17.html", subject: "Refresh standalone timing controls" },
  { date: "2014-03-02T21:52:24+01:00", type: "js", file: "v12_readable_old26.js", subject: "Remove hot-path try/catch and add non-silent file reception" },
  { date: "2014-03-02T21:52:25+01:00", type: "html", file: "v12_old18.html", subject: "Expose non-silent file reception" },
  { date: "2014-03-07T20:18:09+01:00", type: "html", file: "v12_old19.html", subject: "Prepare standalone UI for directory listing" },
  { date: "2014-03-07T20:18:10+01:00", type: "js", file: "v12_readable_old27.js", subject: "Implement calculator directory listing support" },
  { date: "2014-03-09T20:47:18+01:00", type: "html", file: "v12.html", subject: "Publish the March 2014 standalone v12 page" },
  { date: "2014-03-19T15:39:35+01:00", type: "js", file: "v12_readable_old28.js", subject: "Move emulator state and instruction tables into scoped objects" },
];

let v12JsIndex = 0;
for (const event of v12Events) {
  if (event.type === "js") {
    copy(path.join(pad, event.file), "v12_readable.js");
    v12JsIndex += 1;
    if (event.extras && event.file === "v12_readable_old14.js") {
      copy(path.join(pad, "v12tibconv_old.py"), "v12tibconv.py");
    }
    if (event.extras && event.file === "v12_readable_old16.js") {
      copy(path.join(pad, "v12tibconv.py"), "v12tibconv.py");
      copy(path.join(pad, "v12sav.js"), "v12sav.js");
    }
  } else if (event.type === "html") {
    copy(path.join(pad, event.file), "v12.html");
  } else if (event.type === "readme") {
    copy(path.join(pad, event.file), "README.txt");
  }
  const note = event.inferredDate
    ? "Commit date is taken from the embedded changelog; the surviving file mtime is later."
    : `Preserved source mtime: ${event.date}`;
  commit({
    subject: event.subject,
    body: evidenceBody(`pad_ti68k_emu/${event.file}`, note),
    author: people.lionel,
    date: event.date,
    coAuthors: event.coAuthors || [],
  });
  if (event.type === "js") {
    tag(`tiplanet-v12-snapshot-${String(v12JsIndex).padStart(2, "0")}`);
  }
}

const branchPoint = git(["rev-parse", "HEAD"], { capture: true }).trim();
git(["branch", "adriweb-ui", branchPoint]);
tag("tiplanet-v12-pre-2014-03-19-fix");

function insertBeforeAchievements(source, text) {
  const marker = /\n+Achievements:/;
  if (!marker.test(source)) throw new Error("Cannot find changelog insertion point");
  return source.replace(marker, `\n${text}\n\nAchievements:`);
}

let intermediate = fs.readFileSync(path.join(pad, "v12_readable_old28.js"), "latin1");
intermediate = intermediate.replace(
  "\t\trom = new Uint16Array(inputrom.byteLength / 2);",
  "\t\tstate.rom = new Uint16Array(inputrom.byteLength / 2);"
);
intermediate = insertBeforeAchievements(
  intermediate,
  "\t* fix ROM / OS upgrade loading, several occurrences of bare rom (instead of state.rom) remained.\n\t  (debrouxl 2014/03/19)"
);
fs.writeFileSync(path.join(target, "v12_readable.js"), intermediate, "latin1");
commit({
  subject: "Fix ROM and OS upgrade loading after state encapsulation",
  body: evidenceBody("diff between v12_readable_old28.js and v12_readable.js + embedded changelog", "The intermediate tree is reconstructed because no separately named source snapshot survived."),
  author: people.lionel,
  date: "2014-03-19T16:00:00+01:00",
});
tag("tiplanet-v12-2014-03-19");

intermediate = fs.readFileSync(path.join(target, "v12_readable.js"), "latin1");
intermediate = intermediate.replace(
  "\t\tcase 101: emu.setKey(35, value); break; // 7 (keypad)",
  "\t\tcase 103: emu.setKey(35, value); break; // 7 (keypad)"
);
intermediate = insertBeforeAchievements(
  intermediate,
  "\t* fix keypad 7 key mapping for 89/89T.\n\t  (debrouxl 2014/04/27)"
);
fs.writeFileSync(path.join(target, "v12_readable.js"), intermediate, "latin1");
commit({
  subject: "Fix TI-89 and TI-89 Titanium keypad 7 mapping",
  body: evidenceBody("diff between v12_readable_old28.js and v12_readable.js + embedded changelog", "The intermediate tree is reconstructed because no separately named source snapshot survived."),
  author: people.lionel,
  date: "2014-04-27T12:00:00+02:00",
});
tag("tiplanet-v12-2014-04-27");

copy(path.join(pad, "v12_readable.js"), "v12_readable.js");
commit({
  subject: "Fix MOVE to CCR and condition-code updates",
  body: evidenceBody("pad_ti68k_emu/v12_readable.js, mtime 2020-12-30 12:22:14 +0100", "MOVE to CCR is always a word operation; the commit also changes remaining status-register flag additions to bitwise OR and preserves debugging hooks."),
  author: people.lionel,
  date: "2020-12-30T12:22:14+01:00",
});
tag("tiplanet-v12-2020-12-30");
git(["branch", "-m", "upstream"]);

// Reconstruct Adrien's UI fork from the surviving forum announcement and the
// later exact TI-Planet Git snapshots.
git(["switch", "adriweb-ui"]);
replaceTree(path.join(research, "git-7be80d2c"));
commit({
  subject: "Fork v12 and redesign the standalone emulator page",
  body: evidenceBody("TI-Planet forum post 2014-04-23 18:06 + surviving tree first imported by outer commit 7be80d2c", "The forum post explicitly says Adrien forked the directory and worked on the standalone page design; exact intermediate 2014 files did not survive separately."),
  author: people.adrien,
  date: "2014-04-23T18:06:00+02:00",
});
tag("adriweb-ui-2014-04-23");

const uiSnapshots = [
  ["054c417e", "2018-03-04T02:16:23+08:00", "Optimize emulator skin images"],
  ["86d5b4c5", "2018-03-04T02:35:57+08:00", "Improve emulator HTML and CSS"],
  ["3e205833", "2018-03-04T04:14:38+08:00", "Add experimental URL-hash keypress support"],
  ["e2dba434", "2019-01-25T20:26:38+08:00", "Check whether a file input is present"],
  ["950bca32", "2019-01-25T20:29:17+08:00", "Fix duplicate file-loading input ID"],
];
for (const [hash, date, subject] of uiSnapshots) {
  replaceTree(path.join(research, `git-${hash}`));
  commit({
    subject,
    body: evidenceBody(`exact emu68k_fork tree from outer TI-Planet commit ${hash}`),
    author: people.adrien,
    date,
  });
}

replaceTree(path.join(research, "git-5ae773e7"));
remove("v12_readable.js");
commit({
  subject: "Add original TI-92 support",
  body: evidenceBody("LogicalJoe patch 0001-add-TI-92-support.patch + outer TI-Planet commit 5ae773e7", "Authorship and author date come from the patch header; the committer and commit date come from the TI-Planet integration commit."),
  author: people.logicaljoe,
  date: "2026-08-02T13:40:38-04:00",
  committer: people.adrien,
  commitDate: "2026-08-03T17:10:04+02:00",
});
tag("v13-ti92");

replaceTree(path.join(research, "git-d9058fe2"));
remove("v12_readable.js");
commit({
  subject: "Fix standalone skin positioning",
  body: evidenceBody("exact emu68k_fork tree from outer TI-Planet commit d9058fe2"),
  author: people.adrien,
  date: "2026-08-03T17:10:21+02:00",
});
git(["switch", "-c", "main"]);
git(["merge", "--no-commit", "-s", "ours", "upstream"]);
replaceTree(path.join(outer, "emu68k_fork"));
copy(path.join(research, "git-d9058fe2", "v12.html"), "v12.html");
remove("v12_readable.js");
commit({
  subject: "Merge the latest upstream v12 fixes into v13",
  body: [
    "Merge the reconstructed Lionel Debroux upstream branch into Adrien's UI/TI-92 branch.",
    "",
    "The resulting v13 contains all 2020 upstream fixes, LogicalJoe's TI-92 support, and the fork-specific UI integration.",
    "",
    "Reconstructed-by: Adrien Bertrand with Codex",
  ].join("\n"),
  author: people.adrien,
  date: "2026-08-04T01:07:41+02:00",
});
tag("v13-updated");

console.log(`Reconstructed repository created at ${target}`);
