# Team log — what we built, and what's next

FLL BIOGLOW season, 2026–27
Written 30 August 2026. Background and the original thinking are in `team-log-proposal.md`.

---

## What this is

A small tool that runs on a team laptop and does two jobs: it collects the engineering log
entry at the end of a session, and it gets that entry — plus whatever Pybricks programs were
exported — onto GitHub without anyone touching Git.

It is deliberately small. Two files do the work: `server.js` (the whole program, no
dependencies) and a launcher script. It runs on `localhost` only. Nothing leaves the room
except through Git.

---

## What works today

**Writing an entry.** One form, one set of questions: who was here, which mission or part of
the project, what did we try, what happened, who we talked to or where we found it, what
next, and who is writing it. The answers become a markdown file in `notebook/`.

**Saying what the session was about.** Four tick boxes — Robot, Mission, Innovation project,
Other — one of which must be chosen. Pressing save with none ticked gives a warning and
scrolls back to them. The choice sets the file name and tags the entry so the blog can filter
on it.

**Two questions before anything is saved.** "Did you remember to save and download your code
from Pybricks?" — No cancels the save entirely. Then "Did you clean up your parts?" — No says
to go do it and come back. Innovation project and Other entries skip the Pybricks question,
since there is no code to download. Both answers get written into the entry.

**Sending it to GitHub.** One button. Behind it: `git add`, `commit`, `pull --rebase`, `push`.
The commit message is built from the entry — kind, mission, a one-line summary and the name —
so `git log` reads as a season history rather than a wall of identical rows.

**Getting other people's work.** *Download latest missions* pulls down what the rest of the
team pushed and names the changes in plain words. It refuses to run when there are unsaved
changes to tracked files, but a fresh untracked Pybricks export does not block it.

**Reading the season back.** *Read engineering blog* — menu of entries on the left with names
underneath, the chosen entry on the right, filters for All / Robot / Mission / Project / Other.
This is the feature that pays off at judging: the team can read their own season in ten minutes.

**Seeing where things live.** *File structure* — a plain-English explanation of what GitHub is,
next to a list of every file actually on GitHub, grouped by folder. At the bottom, anything
sitting on that laptop that has not been sent yet.

**Not showing kids raw Git output.** Every Git result is translated: "Sent to GitHub. The whole
team can see it now.", "Could not reach GitHub. Check the wifi, then press the button again
later.", "This computer is not set up yet. Ask your coach to finish the setup steps." The real
Git output is kept in small grey text under red messages, for the coach.

**Not losing typing.** Everything typed is saved in the browser as it is typed, so a reload, a
closed console window or a crashed tool does not cost the entry.

**Not leaving the repo broken.** A failed rebase aborts itself and says the work is safe on
this laptop and to get the coach, rather than stranding a 10-year-old mid-rebase.

**Saying when it needs restarting.** If an update replaces the tool's own file while it is
running, the next update tells you to close the black window and start it again — because Node
keeps running the version it loaded at startup.

---

## Decisions we made, and why

**A `.bat` file rather than an `.exe`.** Readable, diffable, no build step, and antivirus
leaves it alone. The cost is the black console window, which is why a lost connection is
handled gracefully in the page.

**One form, not two.** We tried separate question sets for robot work and the innovation
project. It was worse: two things to learn, and a mode to get wrong. One form plus a tag does
the same job. The Pybricks question still adapts, because that part genuinely differs.

**"Who we talked to, or where we found it" is optional and always visible.** Judges lean on it
for the innovation project and it is occasionally true for the robot too. Empty means it is
simply left out of the file.

**Kids' names live in the entry, not in the commit.** Every commit is authored by whatever
identity the laptop is configured with. The markdown is the source of truth for who did what.

**Cleanup is coupled to pushing.** The entry is written to disk regardless, so nothing is ever
lost, but it only goes up when the table is dealt with.

---

## What still needs doing

**Re-clone the second laptop.** Its copy is based on history that no longer exists, after we
rewrote the commit authorship on 30 August. Save anything unsaved on it, delete the folder,
clone again. Until then its pushes will fail confusingly.

**Finish setup on each laptop.** Node, Git, a clone, `git config user.name`, and one manual
push from GitHub Desktop to cache the login. That last step is the one that gets skipped and
it breaks every kid push on that machine. Steps are in `INSTALL.md` / `INSTALL.html`.

**Agree who owns which mission program.** Pybricks block files cannot be merged. Two laptops
editing the same program means one of them loses an evening. This is a table rule; no software
can enforce it.

---

## Worth considering from here

Roughly in the order the pain will show up.

**1. Tidy repeated exports.** Chrome does not overwrite — a second export of the same program
becomes `m09-platform (1).py`, then `(2)`. Within a month `missions/` is a graveyard and "one
owner per mission file" stops meaning anything. The tool should rename `foo (3).py` back to
`foo.py` before showing what is waiting. This is the single most practical thing left.

**2. Keep junk out of `missions/`.** The Chrome download folder is global to the browser, so
every PDF and picture anyone downloads on that laptop lands there and gets committed. A
`.gitignore` that only allows `.py` under `missions/` would fix it. We already had to remove a
`.DS_Store` that got swept in on day one.

**3. Detect a diverged clone.** If a laptop's copy no longer matches GitHub — after a history
rewrite, or after someone forces something — say so in plain words instead of letting a kid
hit a Git error.

**4. A "check this laptop is ready" button.** Tests the GitHub login and the Git identity, and
says yes or no. Finds the missed setup step during setup, not on session night.

**5. Link each entry to the code it describes.** The tool already knows which files changed
when it saves. Writing those file names into the bottom of the entry turns "we changed the
approach angle" into a claim tied to the exact program version that proves it. Cheap, and it
is the strongest single artifact for judging.

**6. Photos.** The blog would be much better with them, and the innovation project needs them.
Right now there is no route for a photo to get from a phone into the folder. Worth solving
before the attachment builds start.

**7. Real timestamps.** Entries sort by file name, so two entries written the same day land in
an arbitrary order. Fine week to week, will look wrong on a competition day.

**8. A coach override for the cleanup gate.** The proposal recommended a hard block for
students with an override that records itself in the log. Not built yet — the gate is
currently just the two questions.

---

## The rule that matters most

This is a twenty-minute-a-week habit in service of the robot, not a software project. If it
starts eating build time, cut features.
