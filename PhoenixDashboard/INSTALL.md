# Setting up the team log on a team laptop

Do this once per laptop. Steps 1–5 are a grown-up job. Step 6 is what the kids do every week.

---

## 1. Install Node.js

https://nodejs.org — take the big green "LTS" button, click Next through the installer.

## 2. Install Git

**Windows:** https://git-scm.com — Next through the installer, all defaults are fine.
**Mac:** open Terminal and type `git --version`; if it asks to install developer tools, say yes.

## 3. Get the team folder

Install GitHub Desktop (https://desktop.github.com), sign in with the team GitHub account,
and clone `PiedmontFLLPhoenix/bioglow2026`.

**On Windows, clone it to `C:\FLL`.** Same path on every laptop keeps step 5 simple.

## 4. Tell Git who this laptop is, and sign it in

Open Terminal (Mac) or Git Bash (Windows) and run, replacing the name:

    git config --global user.name "Phoenix Laptop 2"
    git config --global user.email "phoenix.team@example.com"

Then **push once by hand from GitHub Desktop** — make any small change, commit, press Push.
This is what saves the GitHub login on the laptop. If you skip it, every kid's push fails
with an error they can't do anything about.

## 5. Point Chrome's downloads at the missions folder

Chrome → Settings → Downloads → Location → `C:\FLL\missions`
(and turn **off** "Ask where to save each file").

Now when a kid clicks Backup in Pybricks, the program lands straight in the team folder.

## 6. Start it

Double-click **`PhoenixDashboard\start-team-log.bat`** (Mac: `start-team-log.command`).

A black window opens and the browser goes to http://localhost:4545 by itself.
**Leave the black window open** — closing it turns the tool off.

Make a shortcut to the `.bat` on the desktop and call it "Team log".

---

## What the kids do each session

1. Double-click **Team log**.
2. Press **Update my folders from GitHub** — this brings down what the rest of the team did.
3. Work in Pybricks. Click **Backup** whenever a program is worth keeping.
4. Write the entry: who, mission, what we tried, what happened, what next.
5. Press **Save and send to GitHub** and answer the two questions.
6. **Read engineering blog** shows the whole season, newest first.

## If something goes wrong

The tool says what happened in plain words. Red messages that mention the coach mean:
the work is safe on that laptop, and nothing is lost — it just hasn't reached GitHub yet.
Pressing the button again later usually sends it.

Under a red message there's small grey text with the real technical detail. That's for the coach.

## One rule that isn't in the software

**One person per mission program.** Pybricks block files cannot be merged — if two laptops
edit the same program, one of them loses their work. Decide who owns which mission.
