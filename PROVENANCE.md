# Provenance and reconstruction method

## What this repository claims

This is a source-history reconstruction, not a claim that the project used Git at the time or that the synthesized commit boundaries exactly match the authors' private work sessions. A commit means: “this distinct tree or logically isolatable change is known to have existed by this date, and the cited evidence supports this attribution.”

Commit messages contain `Reconstructed-from:` fields. The builder at `provenance/reconstruct-history.mjs` can reproduce the graph when supplied with the same local evidence corpus described below.

The reconstructed repository as published here is licensed in its entirety under `GPL-2.0-or-later`, including code, retained PedroM payloads, UI and image assets, tools, and provenance material. This repository-level declaration preserves all historical copyright and attribution notices.

## Patrick Davidson: OCF and Wayback

Primary page: <https://www.ocf.berkeley.edu/~pad/emu/>

Wayback's CDX inventory and five archived Apache directory indexes are preserved under `provenance/evidence/`. The indexes are especially useful because they retain the OCF server's own “Last modified” fields rather than merely recording crawl time.

Recovered sequence:

| Snapshot                       |             Best date used | Evidence and qualification                                                                                                           |
|--------------------------------|---------------------------:|--------------------------------------------------------------------------------------------------------------------------------------|
| JS v3 / page “alpha version 2” |           2012-04-20 17:11 | OCF mtime for runtime files; page captured 2012-05-01. First surviving JavaScript release.                                           |
| JS v4                          |           2012-05-14 21:04 | OCF mtime plus 2012-06-02 page capture.                                                                                              |
| Java alpha 1 page              |           2012-05-28 19:13 | OCF page mtime; captured 2012-06-02. Related predecessor/parallel implementation.                                                    |
| Java sources                   |           2012-06-02 16:14 | OCF mtimes.                                                                                                                          |
| Java alpha 2 page              |           2012-06-25 18:58 | OCF mtime; captured 2012-07-03.                                                                                                      |
| Instrumented JS v4             | by 2012-07-03 04:26:50 UTC | Distinct Wayback capture; no trustworthy changed server mtime, so crawl time is used as an upper bound.                              |
| JS v6                          |     2012-10-13 19:35–19:36 | OCF mtimes. No v5 capture found.                                                                                                     |
| JS v7                          |           2012-11-10 17:14 | OCF mtime.                                                                                                                           |
| JS v8                          |           2012-12-01 11:33 | OCF mtime; TI-92 Plus skin mtime is 2012-11-18.                                                                                      |
| JS v9                          |           2013-05-05 13:10 | OCF mtime.                                                                                                                           |
| JS v10                         |           2013-05-05 13:10 | OCF mtime. One second was added in Git solely to order v10 after v9; both are listed at minute precision.                            |
| JS v11 beta                    |           2013-05-05 16:54 | OCF mtime; initial content verified by the 2013-10-23 capture.                                                                       |
| v11 touchscreen fix            |           2013-11-02 07:25 | Later OCF mtime from the 2014 directory capture; the before/after files are preserved by 2013-10-23 and 2013-11-24 Wayback captures. |

The OCF listings do show `v2inst.py`, v3/v4/v6 generator sources, and converter scripts. Wayback did not capture their individual URLs. Early reconstruction attempts received HTTP 500 documents from those URLs; those error documents were detected and excluded. The archived `scripts.zip` did survive and contains authentic `v4inst.py`, `v4savconv.py`, and `v4tibconv.py`, which are included in `patrick-v4`.

Wayback also has two content encodings for some later captures. The apparently different CDX digests for `v3inst.js`, `v4rom.js`, and later `v11.html` reduce to identical bytes after gzip decoding; they are not treated as revisions.

Patrick identifies himself in the pages and gives `eeulplek@hotmail.com` as his contact address, so that address is used in reconstructed commit metadata. The OCF account path proves the `pad` account name but is not used as an invented email address.

### Patrick branch point

Lionel's surviving work forks the initial Patrick v11 state. Patrick's later touchscreen correction is therefore on `patrick-original`, while `upstream` and `adriweb-ui` descend from `patrick-v11`. This preserves both the source relationship and chronological reality.

The v3 page later gained a navigation-only link pointing users to v9. It is documented by the 2013-05-07 capture but is not modeled as an emulator-source commit because it changes only a retired page and its authoring time cannot be narrowed beyond the crawl.

### ROM payload policy

The reconstruction does not bundle proprietary TI operating-system images. The 3.46 MB generated `v12rom.js` decodes to a 2 MiB TI-92 Plus AMS image containing “Advanced Mathematics Software” and “Copyright © 1998 Texas Instruments, Inc.” The later TI-Planet `v4rom.js` blob is another TI AMS image and is excluded as well.

Patrick's much smaller earlier `v4rom.js` is intentionally retained: decoding it yields the `RO` PedroM kernel marker and the string “PedroM v0.72 alpha.” Selective blob/path handling is necessary because the free and proprietary payloads reused the same filename at different points in history. The reconstruction script removes the old PedroM file when Lionel's line begins, but never copies either TI AMS payload.

## Lionel Debroux and Xavier Andréani: TI-Planet v11/v12

Primary local corpus: the `pad_ti68k_emu` directory supplied from TI-Planet, including every `v11_readable_old*`, `v12_readable_old*`, and corresponding HTML snapshot, with the filesystem mtimes listed by Lionel Debroux.

Each byte-distinct source snapshot becomes a commit in preserved-time order. Messages summarize the actual delta and the embedded work log. Lionel is the author for this line. Xavier Andréani and Adrien Bertrand are recorded with `Co-authored-by` trailers where the source changelog or surviving evidence names their contribution.

Several HTML names are byte-identical to a neighboring snapshot. They do not receive synthetic empty commits. Relevant aliases are represented by tags where useful; the provenance deliberately distinguishes “a filename existed” from “a source change existed.”

The final 2020 file contains three changes beyond `v12_readable_old28.js`. Two intermediate commits were reconstructed from its embedded dated changelog and isolated diff:

- 2014-03-19: repair remaining bare `rom` references after state encapsulation.
- 2014-04-27: correct TI-89/Titanium keypad 7 mapping.
- 2020-12-30: MOVE-to-CCR width/status-flag corrections and the final known v12 tree.

The first two trees are logically reconstructed because no separately named files survived for them; their commit bodies say so.

## Adrien Bertrand: UI fork

The TI-Planet post dated 2014-04-23 18:06 says Adrien forked the folder and was working on the standalone page design. No exact April 2014 tree survives, so `adriweb-ui-2014-04-23` uses the earliest exact fork tree later imported into the outer TI-Planet Git repository. This is the largest unavoidable tree/date approximation in the reconstruction.

Subsequent UI commits replay exact `emu68k_fork` trees from the outer TI-Planet repository for the 2018 image optimization, HTML/CSS changes, URL-hash experiment, and 2019 file-input fixes. Adrien's 2026 standalone skin-positioning fix is likewise an exact outer-repository tree.

## Original TI-92 support and updated v13

LogicalJoe's patch header supplies the author name, email, and author date for original TI-92 support. Adrien's outer TI-Planet integration commit supplies the committer and commit date.

`main` ends in a real two-parent merge. Its first parent is `adriweb-ui` (UI plus TI-92 support); its second is `upstream` (Lionel's final 2020 v12). The resulting tree is the updated v13 produced by integrating both lines.

## Date and timezone policy

- Git and patch timestamps retain their explicit offsets.
- TI-Planet filesystem mtimes use the timezone recorded by the supplied listing/context.
- OCF directory entries have no printed timezone. Pacific time is used because the server is at Berkeley; this is a stated inference.
- A Wayback crawl timestamp is used only when no source mtime exists and means “present by this time,” not necessarily “authored exactly then.”
- Embedded changelog dates without times use a synthetic noon time, called out in the corresponding commit body.

## Evidence inventory

- `provenance/evidence/wayback-cdx.json`: distinct successful CDX records under the OCF emulator directory, collapsed by digest.
- `provenance/evidence/ocf-directory-*.html`: raw archived Apache indexes from 2012, 2013, and 2014.
- `provenance/evidence/patrick-scripts.zip`: archived original ZIP containing the recovered v4 Python sources.
- `provenance/FORUM_EVIDENCE.md`: forum post URLs, dates, and what each supports.
- Every reconstructed commit body: the specific input filename, mtime, outer Git commit, patch, or forum evidence used for that commit.
