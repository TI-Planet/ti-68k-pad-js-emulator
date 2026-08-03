# TI-68k emulator reconstructed history

This repository is a best-effort reconstruction of the JavaScript TI-68k emulator's development history, from Patrick Davidson's earliest surviving 2012 release through Lionel Debroux's TI-Planet v12 work, Adrien Bertrand's standalone UI fork, LogicalJoe's original TI-92 support, and the combined updated v13.

It is **not recovered original Git history**. Each historical commit was synthesized from a surviving file snapshot and carries a `Reconstructed-from:` note explaining its evidence. Dates and attribution are as precise as the available OCF server listings, Wayback captures, embedded changelogs, forum posts, patch headers, and later TI-Planet Git history allow.

_Created by Adriweb with Codex (GPT 5.6 Sol, High), 2026-08-04._

## Branches

- `main`: updated v13, merging the latest known upstream v12 fixes into the UI/TI-92 fork.
- `upstream`: Lionel Debroux's reconstructed line through the 2020-12-30 v12 source.
- `adriweb-ui`: Adrien Bertrand's standalone UI line through the 2026 skin-positioning fix and LogicalJoe's TI-92 patch.
- `patrick-original`: Patrick Davidson's original v11 line, including the post-fork touchscreen-event fix dated from the OCF server mtime.

The central relationship is:

```text
Patrick v11 (May 2013)
├── Patrick original: touchscreen fix (November 2013)
└── TI-Planet/Lionel v11 → v12
    ├── upstream fixes through 2020
    └── Adrien UI fork → LogicalJoe TI-92 support → updated v13 merge
```

## Exploring snapshots

There are release and snapshot tags for Patrick's versions, all distinct surviving TI-Planet v11/v12 sources, and the two v13 milestones. For example:

```sh
git tag --list
git show patrick-v4-instrumented:v4.html
git show tiplanet-v12-snapshot-28:v12_readable.js
git diff tiplanet-v12-2014-03-19 tiplanet-v12-2020-12-30 -- v12_readable.js
git log --graph --all --decorate --oneline
```

See [PROVENANCE.md](PROVENANCE.md) for source-by-source methodology and known gaps, and [provenance/FORUM_EVIDENCE.md](provenance/FORUM_EVIDENCE.md) for the relevant TI-Planet posts. Raw OCF directory captures, the Wayback CDX inventory, Patrick's archived `scripts.zip`, and the reproducible builder are under `provenance/`.

## License

Everything in this repository—including the emulator code, retained PedroM payloads, UI and image assets, tools, and provenance material—is distributed under the **GNU General Public License, version 2 or (at your option) any later version** (`GPL-2.0-or-later`). See [LICENSE](LICENSE). Historical copyright and attribution notices remain in force.

## Important limits

- No JavaScript v1, v2, or v5 snapshot was found. `v3.html` calls itself “alpha version 2”; `v2inst.py` was listed by OCF but was not captured.
- Wayback did recover the real v4 generator and converters inside `scripts.zip`; uncaptured individual `.py` URLs are not represented as source.
- Proprietary TI AMS ROM payloads are intentionally excluded. Patrick's earlier `v4rom.js` is retained because it is the free PedroM 0.72 alpha image; the later TI-Planet file with the same name and `v12rom.js` were identified as TI AMS and cleansed selectively.
- Some commit times are exact preserved server mtimes; some are Wayback crawl times (an upper bound); a few come from embedded changelog dates or forum evidence and are explicitly marked.
- Byte-identical named snapshots point to the same commit/tag instead of creating fake empty commits.
- Adrien's exact April 2014 fork tree did not survive. Its initial reconstructed commit uses the earliest later exact tree, attached to the dated forum announcement that the fork and redesign existed.
