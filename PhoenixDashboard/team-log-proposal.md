# Team Log — background and proposal

FLL BIOGLOW season, 2026–27
Draft for discussion. Nothing here is built yet except where noted.

---

## Background

The team runs SPIKE Prime hubs on Pybricks firmware, coding with Pybricks blocks. Three laptops, five students in grade 5, one coach.

Two things need to survive the season: the robot programs themselves, and a record of how they got that way. The second one is worth as much as the first. Judging rewards evidence of iteration — what was tried, what happened, what changed as a result, with dates attached. That evidence is easy to lose and nearly impossible to reconstruct in April.

We chose GitHub as the store for both, in one repo at `C:\FLL`, cloned to the coach laptop.

### What makes this awkward

Pybricks keeps programs inside the browser, not in a folder. There is no Git integration and no way to watch for changes. Getting a program out is a deliberate export: the kid clicks "back up" in the Pybricks file menu, and a `.py` file lands in the downloads folder.

That file is plain text — the block layout is stored as a single JSON comment on line one, followed by the generated Python. Git handles it fine. But the block blob rewrites completely on every edit, so diffs on it are meaningless, and two people can never merge edits to the same program.

The Chrome download folder on each laptop is set to `C:\FLL\missions`, so the export lands in the right place with no file-picker step.

### What exists today (v1)

A small Node server, started by double-clicking a `.bat` file, serving a page on `localhost:4545`. It asks five questions, writes a markdown file into `notebook/`, then runs `git add -A`, `commit`, `pull --rebase`, `push`.

It works. But it does one thing, and the rest of the session still involves three separate places: the Pybricks tab, the folder, and this page. Past entries are invisible unless someone browses GitHub. And nothing connects the log to the habit of leaving the table in a usable state.

---

## Problem

Four specific gaps in v1.

1. **Nothing is visible.** A kid writes an entry and it vanishes. They never see what the team wrote last week, so entries don't build on each other and nobody rereads them before a judging session.
2. **The log is disconnected from the work.** Pybricks lives in another tab. The tool feels like paperwork bolted on at the end rather than part of the session.
3. **No confirmation the work is actually captured.** The kid can't tell whether their export made it in. They press push and hope.
4. **Cleanup is enforced by nagging.** Mat rolled, models reset, hubs charging, pieces sorted. It gets forgotten, and remembering it is currently the coach's job every single week.

---

## Proposal

Extend the local tool into a single page that is open for the whole session — the one window the team works out of.

### Screen

```
┌──────────────────────────────────────────────┐
│  Sunday 14 September            Session 6    │
│                                              │
│  [ Open Pybricks ]                           │
│                                              │
│  ── Write today's entry ─────────────────    │
│   Who was here                               │
│   Which mission                              │
│   What did we try                            │
│   What happened                              │
│   What next                                  │
│                                              │
│  ── Ready to save ───────────────────────    │
│   Files waiting to be saved:                 │
│     missions/m09-platform.py                 │
│     photos/attachment-v3.jpg                 │
│                                              │
│   [ ] We did our cleanup today               │
│                                              │
│   [ Push your update to GitHub ]             │
│                                              │
│  ── Latest changes ──────────────────────    │
│   7 Sep  M09 approach angle, 5/5 runs        │
│   31 Aug M04 gripper rebuild                 │
│   24 Aug base robot, wheel spacing           │
│                        [ Read the whole log ]│
└──────────────────────────────────────────────┘
```

### Features

**1. Engineering log input.** As today: who, mission, what we tried, what happened, what next. The split between "tried" and "happened" is the part that matters — it's what makes an entry evidence rather than a diary.

**2. Open Pybricks.** A button that opens `code.pybricks.com` in a new tab. Trivial to build, and it makes this page the starting point of the session instead of an afterthought.

**3. Files waiting to be saved.** Runs `git status` and lists what's changed but uncommitted. This closes gap 3 — the kid sees their export sitting there before they push, and notices when it's missing.

**4. Latest changes.** The last several commits from `git log`, with dates and messages. Cheap to build, and it makes the history feel real to a ten-year-old who otherwise never sees GitHub.

**5. Read the whole log.** Reads every `.md` in `notebook/`, newest first, rendered on one scrollable page. This is the feature that pays off in judging season: the team can read their own season back in ten minutes, and the coach can pull specifics into the Engineering Notebook without hunting.

**6. Cleanup gate.** A checkbox that must be ticked before the push button becomes active. Unticked, the button is disabled and the page says the log and the code stay on this laptop until the table is cleaned up.

Which name goes on the entry gets recorded in the markdown, so the claim is attributable rather than anonymous.

---

## Decisions to make

**How specific is the cleanup checkbox?** One vague box gets ticked reflexively by week three. A short named list — mat rolled, models back on the mat, hubs on the charger, loose pieces in the tray, table wiped — takes five more seconds and actually gets read. Recommend the list, all items required.

**Hard block or soft block?** A hard block is the point of the feature, but it has a failure mode: 8pm, a parent waiting in the car, and the work is stranded on one laptop because the mat isn't rolled. Recommend the block stays hard for students, with a coach override that records itself in the log as an override. Rare and visible beats easy and meaningless.

**Does the checkbox belong in the log file?** Recommend yes — one line at the bottom of each entry recording who confirmed cleanup. It costs nothing and makes the record honest.

**Does the log get pushed if cleanup fails?** No. The whole point is that they're coupled. The entry is already written to disk, so nothing is lost; it goes up with the next push.

---

## Out of scope

- **Automating the Pybricks export.** Not possible. Programs live in browser storage; the export click stays manual.
- **Two laptops editing the same program.** Block files cannot be merged. Stays a social rule: one owner per mission file.
- **Hosting this anywhere.** It runs on `localhost` on the coach laptop only. No accounts, no server, no data leaving the room except through Git.
- **Phones and tablets.** Desktop only.

---

## Risks

**Credentials.** `git push` from the script needs a cached GitHub login. The coach must push once manually from GitHub Desktop first; otherwise every student push fails with an error they can't act on.

**The console window.** Closing the black window kills the server and the page dies mid-entry. Mitigation: the page should warn on lost connection and keep the typed text on screen so nothing has to be retyped.

**Offline.** The commit succeeds, the push fails. The tool should say plainly that the work is safe on this laptop but not on GitHub, and that pressing the button again later will send it.

**The tool becoming the point.** This is a twenty-minute-a-week habit in service of the robot, not a software project. If it starts eating build time, cut features.

---

## Build order

1. Latest changes and files-waiting panels — both are a `git` call and a list, and both make the existing tool noticeably better.
2. Open Pybricks button.
3. Cleanup gate.
4. Read the whole log.

Steps 1 and 2 are worth doing before the next session. Step 4 is only needed by the time judging prep starts, so it can wait.
