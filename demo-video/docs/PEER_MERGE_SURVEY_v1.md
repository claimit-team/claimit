# PEER MERGE SURVEY v1

Date: 2026-06-03
Purpose: peer (`dev` branch) has merged demo-video work the user wants
to consider. This spec is a **non-destructive investigation**: back up
current state, inspect peer's work, categorize, report. **NO merging,
copying, or rendering of peer's files in this phase.** User decides
what to keep, replace, or combine — that's a follow-up spec.

---

## 0. SACRED LIST — never modify, delete, or overwrite

| Path | What it is | Status |
|---|---|---|
| `demo-video/remotion/src/uirefs/**` | LOCKED UI references (user-approved 2026-06-03) | DO NOT TOUCH |
| `demo-video/remotion/src/polish/Cursor.tsx` | New orange cursor primitive | DO NOT TOUCH |
| `demo-video/remotion/src/polish/BeatSubtitle.tsx` | LOCKED subtitle (PROJECT LAW) | DO NOT TOUCH |
| `demo-video/remotion/src/polish/HookAtmosphere.tsx` | LOCKED light bg | DO NOT TOUCH |
| `demo-video/remotion/src/polish/easings.ts` | LOCKED easings | DO NOT TOUCH |
| `demo-video/remotion/src/polish/tokens.ts` | LOCKED tokens | DO NOT TOUCH |
| `demo-video/remotion/src/beats/b10-b27/**` | CC's recent rebuild | DO NOT TOUCH |
| `demo-video/remotion/src/beats/b{01-09,28-29,35}/**` | other locked beats | DO NOT TOUCH |
| `demo-video/remotion/out/**` | ALL rendered mp4s + stills | DO NOT TOUCH |
| `demo-video/remotion/public/audio/vo/*.mp3` | LOCKED VO audio | DO NOT TOUCH |

If peer's branch *also* modifies any of the above, that's a **CONFLICT**
to surface in the report — not a permission to overwrite.

---

## 1. Phase 1 — Safety net (before any git op)

### 1.1 Git status snapshot

```bash
git -C I:/cs_mtal/2026hackthon/claimit status
git -C I:/cs_mtal/2026hackthon/claimit branch --show-current
git -C I:/cs_mtal/2026hackthon/claimit log --oneline -10
```

Report current branch name and whether the working tree is clean.

### 1.2 Backup current state to a branch

If there are uncommitted changes:

```bash
git checkout -b backup/pre-peer-merge-$(date +%Y%m%d-%H%M)
git add -A
git commit -m "Backup: demo-video state before peer-merge survey"
git checkout -    # return to original working branch
```

If the tree is already clean (everything committed):

```bash
git branch backup/pre-peer-merge-$(date +%Y%m%d-%H%M)
```

Either way, **a recovery branch must exist before doing anything else.**

### 1.3 Backup out/ folder (gitignored, not protected by the branch)

```bash
cd demo-video/remotion
TIMESTAMP=$(date +%Y%m%d-%H%M)
cp -r out out.backup.$TIMESTAMP
```

Verify the backup landed: `ls out.backup.* | wc -l` should match the
original out/ tree (or close to it; depth doesn't have to be exact, but
`out.backup.*/shorts/*.mp4 | wc -l` must equal the current mp4 count).

### 1.4 Confirmation before proceeding

In the Phase 5 report, list:
- Current branch
- Backup branch name (created or pre-existing)
- out/ backup folder name
- mp4 counts: original vs backup (must match)

**Do not proceed to Phase 2 until backups verified.**

---

## 2. Phase 2 — Fetch peer's work (READ ONLY — no merge)

```bash
git fetch origin dev
```

This downloads dev into `origin/dev` without touching the working tree.

### 2.1 Topology

```bash
# How many commits is dev ahead?
git log HEAD..origin/dev --oneline | wc -l
git log HEAD..origin/dev --oneline

# Has dev diverged from us, or is it strictly ahead?
git rev-list --left-right --count HEAD...origin/dev
# Output: "X Y" — X = our commits not on dev, Y = dev commits not on us
```

If X > 0 (we have commits dev doesn't), flag it: a merge might be a
non-trivial rebase.

### 2.2 File-level diff

```bash
# What files differ between us and dev?
git diff --name-status HEAD origin/dev -- demo-video/ apps/ packages/

# Statistics (insertion/deletion counts per file):
git diff --stat HEAD origin/dev -- demo-video/
```

Categorize each changed file:
- `A` = peer added (new file on dev)
- `M` = peer modified (existing file changed)
- `D` = peer deleted

---

## 3. Phase 3 — Inspect peer's contributions

For **each file** in the diff list, do the appropriate inspection:

### 3.1 New beat files (likely under `demo-video/remotion/src/beats/**`)

```bash
git show origin/dev:demo-video/remotion/src/beats/<path>/Beat<NN>.tsx | head -80
```

Note:
- Beat number (from filename)
- Imports — what uirefs, shims, or new components does peer use?
- Composition pattern (does peer use Cursor? Audio? BeatSubtitle? Or a
  different approach?)
- Approximate visual style judged from code

### 3.2 New components / uirefs / polish

If peer added files under `src/uirefs/`, `src/polish/`, `src/shims/`, or
a new directory:

```bash
git show origin/dev:demo-video/remotion/src/<path> | head -100
```

Note: name, purpose, whether it overlaps with CC's existing components.

### 3.3 New assets (public/, audio/, fonts/)

```bash
git ls-tree origin/dev demo-video/remotion/public/ -r | grep -v "$(git ls-tree HEAD demo-video/remotion/public/ -r | awk '{print $4}')"
```

(Or simpler: `git diff --name-status HEAD origin/dev -- demo-video/remotion/public/`)

List new assets by category (audio, images, fonts, logos).

### 3.4 Modified files (potential conflicts)

For each `M` file:

```bash
git diff HEAD origin/dev -- <path>
```

If the modified file is on the SACRED LIST (§0), flag as **CRITICAL
CONFLICT** in the report — peer touched something that's now LOCKED.

If the modified file is not sacred (e.g. `Root.tsx`, `BEAT_SHEET.md`,
shims/), summarize the diff briefly.

### 3.5 Deleted files

For each `D` file, note what peer removed. Some might be intentional
(e.g. old shims peer also retired), some might be regressions.

---

## 4. Phase 4 — Categorize per beat

Build a table covering beats b01-b35 (excluding the deleted b30-b34).
For each beat, note both sides:

```
| Beat | CC version (current)           | Peer version (origin/dev)       | Recommendation |
|------|--------------------------------|---------------------------------|----------------|
| b01  | HOOK light v1.1, no cursor     | (no change)                     | KEEP CC        |
| b10  | ui-app-shell-empty + cursor    | <peer's approach>               | <judgment>     |
| ...  | ...                            | ...                             | ...            |
```

For "Recommendation," CC writes a brief opinion based on:
- Visual quality (judged from code — animations, real-component reuse)
- Compatibility with locked uirefs
- Risk of breaking current renders

Three recommendation tokens:
- `KEEP CC` — current version is better or peer didn't touch this
- `USE PEER` — peer's version looks higher quality, worth replacing
- `MERGE` — combine ideas; needs user discussion + a follow-up spec

CC's recommendation is **advisory only** — user decides per beat.

---

## 5. Phase 5 — Report

Output to `demo-video/docs/PEER_MERGE_SURVEY.md`:

```markdown
# Peer Merge Survey
Date: 2026-06-03
Source: origin/dev (commits since <last-common-commit>)
Status: PENDING USER DECISION

## Topology
- Current branch: <name>
- Backup branch: <name>
- out/ backup folder: <name> (<N> mp4s preserved)
- Peer commits on dev not on current branch: <N>
- Current commits not on dev: <N> (X if non-zero, flag as divergent)

## Peer's commits (concise)
- <hash> <msg>
- <hash> <msg>
...

## Files changed (file-level diff summary)
- Added: <list>
- Modified: <list> (flag sacred-list collisions in BOLD)
- Deleted: <list>

## Per-beat assessment table
[the table from §4]

## Sacred-list collisions (CRITICAL — user must arbitrate)
[any sacred files peer also touched]

## Non-beat assets
- New audio: <list>
- New images / logos: <list>
- New fonts: <list>
- New components: <list>

## CC's recommendations
- Beats to definitely keep CC: <list>
- Beats where peer might be better: <list> + brief reason each
- Beats worth merging: <list> + brief reason each

## What we DID NOT do (for the record)
- No `git merge`, `git pull`, `git rebase`, `git checkout origin/dev`
- No files modified, added, or deleted from working tree
- No renders triggered
- No copy of peer's files into the working tree

## Awaiting user verdict
User decides per beat: KEEP CC / USE PEER / MERGE. After verdict, a
follow-up spec (PEER_MERGE_APPLY_v1) will implement the chosen plan.
```

Then STOP.

---

## 6. Anti-patterns — DO NOT do any of these

❌ `git pull origin dev`
❌ `git merge origin/dev`
❌ `git rebase origin/dev`
❌ `git checkout origin/dev`
❌ `git checkout origin/dev -- <path>` (this *would* overwrite working tree)
❌ Copy any file from `origin/dev` into the working tree
❌ Delete or modify anything on the SACRED LIST (§0)
❌ Trigger renders to "see what peer's beats look like" (defer; that's
   the next spec)
❌ Commit, push, or reset anything

✅ `git fetch origin dev` (download, no merge)
✅ `git show origin/dev:<path>` (view file content)
✅ `git diff HEAD origin/dev -- <path>` (compare)
✅ `git log HEAD..origin/dev` (peer's commits)
✅ Create backup branch + out/ backup folder (Phase 1)
✅ Write PEER_MERGE_SURVEY.md (the deliverable)

---

## 7. Estimated effort

- Phase 1 (safety net): 5 min
- Phase 2 (topology fetch): 2 min
- Phase 3 (inspect peer files): 30-60 min depending on how many beats
  peer touched
- Phase 4 (categorize): 15 min
- Phase 5 (write report): 15 min
- **Total: 60-90 min autonomous, ZERO render time.**

User reviews PEER_MERGE_SURVEY.md, then we plan the actual merge.
