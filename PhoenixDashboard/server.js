// Phoenix team log
// Runs on one laptop, in the browser, at http://localhost:4545
// Writes engineering log entries into notebook/ and pushes them to GitHub.
// No dependencies. Start it with start-team-log.bat (Windows) or start-team-log.command (Mac).

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
// Node loads this file once at startup. If a pull replaces it, the running tool is stale
// until someone restarts it - so remember what we started with, and say so if it changes.
const RUNNING_VERSION = fs.statSync(__filename).mtimeMs;
const NOTEBOOK = path.join(REPO, 'notebook');
const PORT = Number(process.env.PORT) || 4545;

// What this laptop knows about each program: which version its Pybricks last had
// (`base`), and which programs came down from the team but are not imported yet
// (`pending`). Lives inside .git so it never gets pushed.
const STATE_FILE = path.join(REPO, '.git', 'phoenix-sync.json');

// ---------------------------------------------------------------- git helpers

// No terminal password prompts: they would freeze the whole tool. A login window
// from Git Credential Manager is still allowed, so give it time to be answered.
const GIT_ENV = { ...process.env, GIT_TERMINAL_PROMPT: '0' };

function git(...args) {
  try {
    const raw = execFileSync('git', ['-c', 'core.quotepath=off', ...args],
      { cwd: REPO, encoding: 'utf8', env: GIT_ENV, timeout: 120000, maxBuffer: 64 * 1024 * 1024 });
    return { ok: true, out: (raw || '').trim(), raw: raw || '' };
  } catch (e) {
    const timedOut = e.code === 'ETIMEDOUT' || e.signal === 'SIGTERM' ? '\ngit timed out' : '';
    return { ok: false, out: ((e.stdout || '') + (e.stderr || '') + timedOut).trim(), raw: '' };
  }
}

// Turns raw git output into something a 10-year-old can act on.
// The real output is kept in `details` so the coach can still see it.
function explain(raw) {
  const t = raw.toLowerCase();
  if (t.includes('please tell me who you are') || t.includes('unable to auto-detect email'))
    return 'This computer is not set up yet. Ask your coach to finish the setup steps.';
  if (t.includes('could not resolve host') || t.includes('unable to access') || t.includes('timed out'))
    return 'Could not reach GitHub. Check the wifi, then press the button again later.';
  if (t.includes('authentication failed') || t.includes('could not read username') || t.includes('permission denied'))
    return 'GitHub did not let this computer in. Ask your coach to sign in to GitHub on this laptop.';
  if (t.includes('nothing to commit'))
    return 'There was nothing new to save.';
  if (t.includes('rejected') || t.includes('non-fast-forward'))
    return 'Someone else pushed first. Press the button again to try once more.';
  return 'Something unexpected happened. Show this screen to your coach.';
}

// ------------------------------------------------------------- writing entries

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'entry';

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Every entry says what the team worked on that day. The questions are the same
// for all three; only the label and the file name change.
const KINDS = {
  robot:   { label: 'Robot' },
  mission: { label: 'Mission' },
  project: { label: 'Innovation project' },
  other:   { label: 'Other' }
};

function writeEntry(f) {
  fs.mkdirSync(NOTEBOOK, { recursive: true });
  const kind = KINDS[f.kind] ? f.kind : 'robot';
  const base = `${today()}-${kind}-${slug(f.mission)}`;
  let name = `${base}.md`;
  let n = 2;
  while (fs.existsSync(path.join(NOTEBOOK, name))) name = `${base}-${n++}.md`;

  const md = [
    `# ${today()} - ${f.mission}`,
    ``,
    `**Kind:** ${KINDS[kind].label}`,
    `**Who was here:** ${f.who}`,
    `**Written by:** ${f.author}`,
    ``,
    `## What we tried`,
    f.tried,
    ``,
    `## What happened`,
    f.happened,
    ``,
    ...(f.sources ? [`## Who we talked to, or where we found it`, f.sources, ``] : []),
    `## What next`,
    f.next,
    ``,
    `---`,
    kind === 'project'
      ? `Tidied up: yes, said by ${f.author}.`
      : `Code downloaded from Pybricks: yes. Parts cleaned up: yes, said by ${f.author}.`,
    ``
  ].join('\n');

  fs.writeFileSync(path.join(NOTEBOOK, name), md);
  return `notebook/${name}`;
}

// The kid's name goes on every commit, so GitHub shows who changed what - not just
// which laptop. The .invalid address is reserved, so it can never belong to a real person.
const cleanName = (s) => String(s || '').replace(/[<>\r\n]/g, '').trim() || 'Phoenix team';
const authorFlag = (name) => `--author=${name} <${slug(name)}@phoenix.invalid>`;

// Saves the log entry as its own commit on this laptop, then syncs. Once the entry is
// committed it is safe, so pressing a button again can never write it twice.
function saveAndSync(f) {
  const steps = [];
  const say = (msg, ok, details) => steps.push({ msg, ok, details: details || '' });

  const file = writeEntry(f);
  const author = cleanName(f.author);
  const summary = (f.happened.split('\n')[0] || '').slice(0, 60);
  const kindLabel = KINDS[f.kind] ? KINDS[f.kind].label : KINDS.robot.label;
  const commitMessage = `${kindLabel} - ${f.mission}: ${summary} (${author})`;

  const add = git('add', '--', file);
  const commit = add.ok ? git('commit', authorFlag(author), '-m', commitMessage, '--', file) : add;
  if (!commit.ok) {
    git('reset', '-q', '--', file);
    fs.unlinkSync(path.join(REPO, file));   // so the next try does not leave a second copy
    say(explain(commit.out), false, commit.out);
    return { steps, saved: false };
  }
  say(`Your log entry is saved on this computer (${file})`, true);

  const result = sync(author, {});
  return { ...result, steps: steps.concat(result.steps), saved: true };
}

// ------------------------------------------------------------------ syncing

function loadState() {
  try {
    const s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    return { base: s.base || {}, pending: s.pending || {} };
  } catch (e) {
    return { base: {}, pending: {} };
  }
}
const saveState = (s) => fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));

const onDisk = (p) => path.join(REPO, p);
const nice = (p) => p.replace(/^missions\//, '');

// Git names every version of a file by its content. Same content, same id - so
// comparing ids tells us exactly whether two copies of a program are the same.
function blobAt(ref, p) {
  const r = git('rev-parse', '--verify', '-q', `${ref}:${p}`);
  return r.ok && r.out ? r.out : null;
}
const blobOnDisk = (p) => fs.existsSync(onDisk(p)) ? git('hash-object', '--', p).out : null;

// Every file that differs from the last commit, including brand new ones.
function changedFiles() {
  const parts = git('status', '--porcelain', '-z', '--untracked-files=all').raw.split('\0');
  const files = [];
  for (let i = 0; i < parts.length; i++) {
    const e = parts[i];
    if (e.length < 4) continue;
    files.push({ path: e.slice(3), untracked: e.startsWith('??') });
    if (e[0] === 'R' || e[0] === 'C') i++;   // a rename carries its old name as an extra entry
  }
  return files;
}

// Every version a file has ever had, newest first, with when and by whom.
function pastVersions(p) {
  const r = git('log', '--all', '--format=%x01%ad|%an', '--date=short', '--raw', '--no-abbrev', '--', p);
  const seen = {};
  for (const chunk of r.raw.split('\x01').slice(1)) {
    const [head, ...lines] = chunk.split('\n');
    const [date, who] = head.split('|');
    for (const l of lines) {
      const blob = l.startsWith(':') ? l.split(' ')[3] : null;
      if (blob && !seen[blob]) seen[blob] = { date, who };
    }
  }
  return seen;
}

// Puts a file back the way the last commit has it. Its content is in the history, so nothing is lost.
function putBack(p) {
  if (blobAt('HEAD', p)) git('checkout', 'HEAD', '--', p);
  else if (fs.existsSync(onDisk(p))) fs.unlinkSync(onDisk(p));
}

function sideBySideName(p, who) {
  const ext = path.extname(p);
  const stem = ext ? p.slice(0, -ext.length) : p;
  let name = `${stem}-from-${slug(who)}${ext}`;
  let n = 2;
  while (fs.existsSync(onDisk(name)) || blobAt('@{u}', name)) name = `${stem}-from-${slug(who)}-${n++}${ext}`;
  return name;
}

// One button: check this laptop's changes, send them, and bring down everyone else's.
// `decisions` answers the questions from an earlier try: { path: 'send' | 'skip' }.
// Nothing on disk is touched until every question has an answer.
function sync(author, decisions) {
  const steps = [];
  const say = (msg, ok, details) => steps.push({ msg, ok, details: details || '' });
  const who = cleanName(author);
  const state = loadState();

  const fetch = git('fetch');
  if (!fetch.ok) { say(explain(fetch.out), false, fetch.out); return { steps, pending: state.pending }; }
  if (!git('rev-parse', '--verify', '-q', '@{u}').ok) {
    say('This laptop is not connected to the team folder on GitHub. Ask your coach.', false);
    return { steps, pending: state.pending };
  }

  const send = [], putBacks = [], copies = [], ask = [], notes = [];

  for (const { path: p, untracked } of changedFiles()) {
    const mission = p.startsWith('missions/');
    const head = blobAt('HEAD', p), theirs = blobAt('@{u}', p), mine = blobOnDisk(p);
    // Which version this laptop's Pybricks started from. Before the first sync we
    // cannot know, so assume the last commit.
    const base = mission && p in state.base ? state.base[p] : head;

    if (mine === theirs) { putBacks.push(p); continue; }   // already the same as GitHub

    if (mission && theirs !== base) {
      // A teammate changed this program after this laptop's Pybricks got its copy.
      // Never merge two programs: keep both, and let the kids pick.
      const by = git('log', '-1', '--format=%an', '@{u}', '--', p).out || 'a teammate';
      putBacks.push(p);
      state.pending[p] = { by, date: today() };
      if (mine === null) {
        notes.push(`You deleted ${nice(p)}, but ${by} changed it, so it is kept.`);
      } else if (mine === base || pastVersions(p)[mine]) {
        notes.push(`${nice(p)} on this laptop was an old copy. You now have ${by}’s newer version.`);
      } else {
        const copy = sideBySideName(p, who);
        copies.push([p, copy]);
        send.push(copy);
        notes.push(`Two people changed ${nice(p)}. ${by}’s version stays as ${nice(p)}, and yours is ` +
                   `saved as ${nice(copy)}. Open both in Pybricks and pick one together.`);
      }
      continue;
    }

    // A normal change. Check that it looks like something a person meant to do.
    let question = null;
    if (mine === null) {
      question = { text: `${nice(p)} was deleted on this laptop. Delete it for the whole team?`,
                   yes: 'Yes, delete it', no: 'No, bring it back' };
    } else if (fs.statSync(onDisk(p)).size === 0) {
      question = { text: `${nice(p)} is empty. It looks like the download did not finish. Send it anyway?`,
                   yes: 'Send it anyway', no: 'Do not send it' };
    } else if (mission) {
      const old = pastVersions(p)[mine];
      if (old) question = { text: `${nice(p)} is exactly the same as an older version, saved ${old.date} ` +
                                  `by ${old.who}. Do you want to go back to that version?`,
                            yes: 'Yes, go back', no: 'No, keep the newest' };
    }

    if (!question || decisions[p] === 'send') send.push(p);
    else if (decisions[p] === 'skip') { if (!untracked) putBacks.push(p); }
    else ask.push({ path: p, ...question });
  }

  if (ask.length) {
    say('Before anything is sent, answer the question' + (ask.length > 1 ? 's' : '') + ' below.', 'warn');
    return { steps, ask, pending: state.pending };
  }

  // ---- every question is answered: now change things
  for (const [from, to] of copies) fs.copyFileSync(onDisk(from), onDisk(to));
  for (const p of putBacks) putBack(p);
  notes.forEach(n => say(n, 'warn'));

  if (send.length) {
    const add = git('add', '-A', '--', ...send);
    const names = send.map(nice);
    const commit = add.ok
      ? git('commit', authorFlag(who), '-m', `Sync - ${who}: ${names.slice(0, 5).join(', ')}` +
            (names.length > 5 ? ` and ${names.length - 5} more` : ''))
      : add;
    if (!commit.ok) { say(explain(commit.out), false, commit.out); saveState(state); return { steps, pending: state.pending }; }
    for (const p of send) {
      if (!p.startsWith('missions/')) continue;
      state.base[p] = blobAt('HEAD', p);
      delete state.pending[p];
    }
    say(`Packed up your changes: ${names.join(', ')}`, true, commit.out);
  }
  saveState(state);

  const before = git('rev-parse', 'HEAD').out;
  const incoming = git('log', '--format=%s', `${before}..@{u}`);
  const pull = git('pull', '--rebase', '--autostash');
  if (!pull.ok) {
    git('rebase', '--abort');
    say(/conflict/i.test(pull.out)
          ? 'Someone changed the same file at the same moment. Your work is safe on this computer - ask your coach.'
          : explain(pull.out), false, pull.out);
    return { steps, pending: state.pending };
  }

  const news = incoming.ok && incoming.out ? incoming.out.split('\n') : [];
  if (news.length) {
    // Programs that came down from the team must be imported into Pybricks by hand.
    const came = git('diff', '--name-only', '-z', before, 'HEAD', '--', 'missions').raw.split('\0').filter(Boolean);
    for (const p of came) {
      if (!(p in state.base)) state.base[p] = blobAt(before, p);
      if (blobAt('HEAD', p) === state.base[p]) { delete state.pending[p]; continue; }
      const by = git('log', '-1', '--format=%an', 'HEAD', '--', p).out || 'a teammate';
      if (blobAt('HEAD', p)) state.pending[p] = { by, date: today() };
      else { delete state.pending[p]; state.base[p] = null; }   // deleted by the team: nothing to import
    }
    saveState(state);
    say(`You got ${news.length} new change${news.length === 1 ? '' : 's'} from the team.`, true);
    news.forEach(l => say('  ' + l, true));
  }

  const waiting = Number(git('rev-list', '--count', '@{u}..HEAD').out) || 0;
  if (waiting) {
    let push = git('push');
    if (!push.ok && /rejected|non-fast-forward|fetch first/i.test(push.out)) {
      // Someone pushed in the last few seconds. Take their work and try once more.
      if (git('pull', '--rebase', '--autostash').ok) push = git('push');
      else git('rebase', '--abort');
    }
    if (!push.ok) {
      say(explain(push.out), false, push.out);
      say('Your work is safe on this computer. Press Sync with GitHub again later to send it.', false);
      return { steps, pending: state.pending };
    }
    say('Sent to GitHub. The whole team can see it now.', true, push.out);
  } else if (!news.length && !send.length) {
    say('Everything is already in sync with GitHub.', true);
  }

  if (fs.statSync(__filename).mtimeMs !== RUNNING_VERSION) {
    say('The team log tool itself was updated. Close the black window and start Team log ' +
        'again to get the new version. Your work is safe either way.', 'warn');
  }
  return { steps, pending: state.pending, synced: true };
}

// The kids said they imported a program into Pybricks, so this laptop's copy is current.
function markImported(p) {
  const state = loadState();
  if (p in state.pending) {
    state.base[p] = blobAt('HEAD', p);
    delete state.pending[p];
    saveState(state);
  }
  return { pending: state.pending };
}

// --------------------------------------------------------------- reading entries

const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Tiny markdown renderer. It only needs to handle the entries this tool writes.
function render(md) {
  const html = [];
  for (const line of md.split('\n')) {
    const t = escape(line.trim());
    if (!t) continue;
    if (t === '---') html.push('<hr>');
    else if (t.startsWith('## ')) html.push(`<h3>${t.slice(3)}</h3>`);
    else if (t.startsWith('# ')) html.push(`<h2>${t.slice(2)}</h2>`);
    else html.push(`<p>${t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</p>`);
  }
  return html.join('\n');
}

function readEntries() {
  if (!fs.existsSync(NOTEBOOK)) return [];
  return fs.readdirSync(NOTEBOOK)
    .filter(n => n.endsWith('.md'))
    .sort().reverse()               // filenames start with the date, so this is newest first
    .map(name => {
      const body = fs.readFileSync(path.join(NOTEBOOK, name), 'utf8');
      const find = (label) => (body.match(new RegExp('\\*\\*' + label + ':\\*\\*\\s*(.+)')) || [])[1] || '';
      return {
        name,
        label: name.replace('.md', ''),
        names: find('Written by') || find('Who was here'),
        kind: (Object.keys(KINDS).find(k => KINDS[k].label === find('Kind')) || 'robot'),
        html: render(body)
      };
    });
}

// ------------------------------------------------------------------ the pages

const FAVICON = `<link rel="icon" href="data:image/png;base64,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">`;

const STYLE = `
  /* Colours sampled from the team's phoenix picture: ground #191412, embers
     #732a1d to #cc6632, flames #eb9a45 and #f3b74c. */
  :root { color-scheme: light; }
  body { font: 16px/1.5 system-ui, sans-serif; margin: 0; color: #241a15; background: #faf6f2; }
  .bar { background: #1f1310; color: #fff; padding: 14px 20px; display: flex; align-items: center; gap: 20px; }
  .bar b { font-size: 18px; }
  .bar a { color: #f3b74c; text-decoration: none; font-weight: 600; }
  .wrap { max-width: 720px; margin: 0 auto; padding: 24px 20px 60px; }
  label { display: block; margin: 18px 0 5px; font-weight: 600; }
  .hint { font-weight: 400; color: #7a6a60; font-size: 14px; }
  input, textarea { width: 100%; font: inherit; padding: 9px; box-sizing: border-box;
                    border: 1px solid #ddd0c6; border-radius: 6px; background: #fff; }
  input:focus, textarea:focus { outline: 2px solid #cc6632; border-color: #cc6632; }
  textarea { min-height: 78px; resize: vertical; }
  button { font: inherit; font-weight: 600; padding: 13px 22px; border: 0; border-radius: 8px;
           background: #c1521f; color: #fff; cursor: pointer; }
  button:hover { background: #a94425; }
  button.plain { background: #efe6de; color: #241a15; }
  button.plain:hover { background: #e6d8cd; }
  button:disabled { opacity: .5; cursor: default; }
  #save { margin-top: 26px; font-size: 17px; }
  .step { padding: 9px 12px; border-radius: 6px; margin: 7px 0; background: #e7f2e7; }
  .step.bad { background: #fbe6e0; }
  .step.warn { background: #fdf0d5; }
  .step .more { display: block; margin-top: 5px; font: 12px ui-monospace, monospace;
                color: #6b5a50; white-space: pre-wrap; }
  .done { margin-top: 16px; padding: 14px; border-radius: 8px; background: #1f1310;
          color: #f3b74c; font-weight: 600; }
  .modal { position: fixed; inset: 0; background: rgba(25,20,18,.6); display: flex;
           align-items: center; justify-content: center; padding: 20px; }
  .card { background: #fff; border-radius: 12px; padding: 26px; max-width: 440px; text-align: center; }
  .card p { font-size: 19px; font-weight: 600; margin: 0 0 22px; }
  .card .row { display: flex; gap: 12px; justify-content: center; }
  [hidden] { display: none !important; }
  .layout { display: grid; grid-template-columns: 270px 1fr; gap: 26px; align-items: start; }
  .wide { max-width: 1040px; }
  .menu { background: #fff; border: 1px solid #eaded4; border-radius: 10px; padding: 12px;
          position: sticky; top: 18px; max-height: calc(100vh - 130px); overflow-y: auto; }
  .menu h4 { margin: 6px 8px 10px; font-size: 13px; text-transform: uppercase;
             letter-spacing: .05em; color: #7a6a60; }
  .menu button { display: block; width: 100%; text-align: left; background: none; color: #241a15;
                 border-radius: 7px; padding: 9px 10px; font-weight: 500; font-size: 15px; }
  .menu button:hover { background: #f7ece4; }
  .menu button.on { background: #732a1d; color: #fff; }
  .menu .date { display: block; font-weight: 600; }
  .menu .names { display: block; font-size: 13px; color: #7a6a60; }
  .menu button.on .names { color: #f0c39a; }
  .folder { margin-bottom: 22px; }
  .folder h3 { margin: 0 0 3px; font: 600 16px ui-monospace, monospace; }
  .folder .what { margin: 0 0 8px; color: #6b5a50; font-size: 14px; }
  .folder ul { margin: 0; padding-left: 22px; }
  .folder li { font: 14px ui-monospace, monospace; padding: 1px 0; }
  .folder.warn h3 { color: #9c5a12; }
  .side .what { font-size: 14px; color: #4a3a32; line-height: 1.55; }
  .picks { display: flex; flex-wrap: wrap; gap: 22px; margin: 8px 0 4px; }
  .pick { display: flex; align-items: center; gap: 9px; cursor: pointer; }
  .pick input { position: absolute; opacity: 0; }
  .pick .box { flex: none; width: 20px; height: 20px; border: 2px solid #b8a99d; border-radius: 5px; }
  .pick input:checked + .box { background: #c1521f; border-color: #c1521f; }
  .pick input:checked + .box::after { content: '\\2713'; display: block; color: #fff;
          text-align: center; line-height: 19px; font-size: 14px; font-weight: 700; }
  .pick:has(input:checked) { font-weight: 600; }
  .tag { display: inline-block; font-size: 11px; font-weight: 700; padding: 1px 7px;
         border-radius: 20px; background: #f3e2d8; color: #732a1d; vertical-align: 2px; }
  .tag.project { background: #e7f0e0; color: #35521a; }
  .filter { display: flex; gap: 6px; margin-bottom: 12px; }
  .filter button { flex: 1; text-align: center; padding: 7px 2px; font-size: 12px; }
  .filter button.on { background: #732a1d; color: #fff; }
  .side { background: #fff; border: 1px solid #eaded4; border-radius: 10px; padding: 14px;
          position: sticky; top: 18px; }
  .side button { display: block; width: 100%; text-align: left; margin-bottom: 8px; }
  .side .hint { display: block; margin: -2px 4px 16px; }
  .side #result:not(:empty) { margin-top: 14px; border-top: 1px solid #eaded4; padding-top: 12px; }
  .side .step { font-size: 14px; padding: 8px 10px; line-height: 1.45; }
  .side .step .more { font-size: 11px; overflow-wrap: anywhere; }
  .side .done { font-size: 15px; padding: 12px; }
  .side .step .row { display: flex; gap: 8px; margin-top: 8px; }
  .side .step .row button { margin: 0; padding: 7px 10px; font-size: 13px; text-align: center; }
  #pending { margin-top: 14px; padding: 10px 12px; border-radius: 6px; background: #fdf0d5; font-size: 14px; }
  #pending ul { margin: 6px 0 0; padding-left: 18px; }
  #pending li { margin-bottom: 8px; }
  #pending button { display: inline-block; width: auto; margin: 4px 0 0; padding: 4px 10px; font-size: 13px; }
  .panel { background: #fff; border: 1px solid #eaded4; border-radius: 10px; padding: 6px 26px 26px; }
  .panel h1 { font-size: 21px; }
  .entry { background: #fff; border: 1px solid #eaded4; border-radius: 10px; padding: 4px 26px 22px; }
  .entry h2 { font-size: 21px; } .entry h3 { font-size: 15px; color: #6b4a3a; margin-bottom: 2px; }
  .empty { background: #fff; border: 1px dashed #ddd0c6; border-radius: 10px; padding: 30px;
           text-align: center; color: #7a6a60; }
`;


const DASHBOARD = `<!doctype html>
<meta charset="utf-8"><title>Phoenix team log</title>${FAVICON}
<style>${STYLE}</style>
<div class="bar"><b>Phoenix team log</b></div>
<div class="wrap wide"><div class="layout">

  <div class="side">
    <label for="me" style="margin-top:0">Your name</label>
    <input id="me" style="margin-bottom:10px">
    <button id="sync">Sync with GitHub</button>
    <span class="hint">Sends your programs up and brings the team&rsquo;s down.</span>
    <button class="plain" onclick="location.href='/blog'">Read engineering blog</button>
    <button class="plain" onclick="location.href='/files'">File structure</button>
    <button class="plain" onclick="window.open('https://code.pybricks.com', '_blank')">Open Pybricks</button>

    <div id="pending" hidden>
      <b>Import these into Pybricks before you change them</b>
      <ul id="pendingList"></ul>
    </div>
    <div id="result"></div>
  </div>

  <div class="panel">
  <h1>Today&rsquo;s entry</h1>

  <label>What did you work on today?</label>
  <div class="picks">
    <label class="pick"><input type="radio" name="kind" value="robot"><span class="box"></span>Robot</label>
    <label class="pick"><input type="radio" name="kind" value="mission"><span class="box"></span>Mission</label>
    <label class="pick"><input type="radio" name="kind" value="project"><span class="box"></span>Innovation project</label>
    <label class="pick"><input type="radio" name="kind" value="other"><span class="box"></span>Other</label>
  </div>

  <label>Who was here <span class="hint">everyone at the table today</span></label>
  <input id="who">
  <label>Which mission, or which part of the project
    <span class="hint">for example: M09 platform, or talking to an expert</span></label>
  <input id="mission">
  <label>What did we try <span class="hint">what did you change, test or find out?</span></label>
  <textarea id="tried"></textarea>
  <label>What happened <span class="hint">did it work? how many times out of how many?</span></label>
  <textarea id="happened"></textarea>
  <label>Who we talked to, or where we found it
    <span class="hint">only if you asked someone or used a website - otherwise leave empty</span></label>
  <input id="sources">
  <label>What next <span class="hint">what should the team try next time?</span></label>
  <textarea id="next"></textarea>
  <label>Your name <span class="hint">who is writing this</span></label>
  <input id="author">

  <button id="save">Save and send to GitHub</button>
  </div>

</div></div>

<div class="modal" id="modal" hidden><div class="card">
  <p id="question"></p>
  <div class="row" id="answers">
    <button id="yes">Yes</button>
    <button id="no" class="plain">No</button>
  </div>
  <div class="row" id="closer" hidden><button id="okay" class="plain">OK</button></div>
</div></div>

<script>
const FIELDS = ['who', 'mission', 'tried', 'happened', 'next', 'author'];  // sources is optional
const el = id => document.getElementById(id);
const result = el('result');
const picks = [...document.querySelectorAll('.pick input')];   // only one can be on
let kind = localStorage.getItem('log.kind') || null;

function choose(k) {
  kind = k;
  localStorage.setItem('log.kind', k);
  picks.forEach(r => r.checked = r.value === k);
}
picks.forEach(r => r.onchange = () => choose(r.value));
if (kind) choose(kind);

// Keep what they typed, in case the page reloads or the black window gets closed.
FIELDS.concat('sources').forEach(id => {
  el(id).value = localStorage.getItem('log.' + id) || '';
  el(id).addEventListener('input', () => localStorage.setItem('log.' + id, el(id).value));
});

function ask(gate) {
  return new Promise(resolve => {
    el('question').textContent = gate.ask;
    el('answers').hidden = false; el('closer').hidden = true; el('modal').hidden = false;
    el('yes').onclick = () => { el('modal').hidden = true; resolve(true); };
    el('no').onclick = () => {
      el('question').textContent = gate.ifNo;
      el('answers').hidden = true; el('closer').hidden = false;
      el('okay').onclick = () => { el('modal').hidden = true; resolve(false); };
    };
  });
}

// Git output and teammates' text are shown as text, never as page code.
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function show(steps) {
  result.innerHTML = steps.map(s =>
    '<div class="step' + (s.ok === true ? '' : s.ok === 'warn' ? ' warn' : ' bad') + '">' + esc(s.msg) +
    (s.details && s.ok !== true ? '<span class="more">' + esc(s.details) + '</span>' : '') + '</div>'
  ).join('');
}

// The name on the sync button is remembered; the log entry uses its own "Your name" box.
el('me').value = localStorage.getItem('sync.name') || '';
el('me').addEventListener('input', () => localStorage.setItem('sync.name', el('me').value));

async function post(url, body) {
  const res = await fetch(url, { method: 'POST', body: JSON.stringify(body || {}) });
  return res.json();
}

// Programs the team changed that this laptop's Pybricks does not have yet.
function showPending(pending) {
  const files = Object.keys(pending || {});
  el('pending').hidden = !files.length;
  el('pendingList').innerHTML = files.map(p =>
    '<li><b>' + esc(p.slice(p.indexOf('/') + 1)) + '</b> <span class="hint">changed by ' + esc(pending[p].by) +
    '</span><br><button class="plain small" data-path="' + esc(p) + '">I imported it</button></li>').join('');
  el('pendingList').querySelectorAll('button').forEach(b => b.onclick = async () => {
    showPending((await post('/imported', { path: b.dataset.path })).pending);
  });
}
post('/state').then(d => showPending(d.pending)).catch(() => {});

// Shows what happened, and asks about anything that looked wrong. Once every question
// has an answer, the sync runs again with those answers.
function handle(data, author) {
  show(data.steps);
  if (data.pending) showPending(data.pending);
  if (!data.ask) return;
  const decisions = {};
  data.ask.forEach(q => {
    const box = document.createElement('div');
    box.className = 'step warn';
    box.innerHTML = esc(q.text) + '<div class="row"><button>' + esc(q.yes) + '</button>' +
                    '<button class="plain">' + esc(q.no) + '</button></div>';
    const [yes, no] = box.querySelectorAll('button');
    const answer = (a) => {
      decisions[q.path] = a;
      box.querySelector('.row').innerHTML = '<i>' + esc(a === 'send' ? q.yes : q.no) + '</i>';
      if (data.ask.every(x => decisions[x.path])) runSync(author, decisions);
    };
    yes.onclick = () => answer('send');
    no.onclick = () => answer('skip');
    result.appendChild(box);
  });
}

async function runSync(author, decisions) {
  el('sync').disabled = true;
  result.innerHTML = '<div class="step">Syncing with GitHub&hellip;</div>';
  try {
    handle(await post('/sync', { author: author, decisions: decisions || {} }), author);
  } catch (e) {
    result.innerHTML = '<div class="step bad">The tool stopped running. Ask your coach to start it again.</div>';
  }
  el('sync').disabled = false;
}

el('sync').onclick = () => {
  const me = el('me').value.trim();
  if (!me) {
    result.innerHTML = '<div class="step bad">Type your name above the Sync button first.</div>';
    el('me').focus();
    return;
  }
  runSync(me);
};

el('save').onclick = async () => {
  if (!kind) {
    result.innerHTML = '<div class="step bad">Click what you worked on today: Robot, Mission, Innovation project or Other.</div>';
    document.querySelector('.picks').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  const entry = { kind: kind, sources: el('sources').value.trim() };
  FIELDS.forEach(id => entry[id] = el(id).value.trim());
  if (FIELDS.some(id => !entry[id])) {
    result.innerHTML = '<div class="step bad">Please fill in every box first.</div>';
    return;
  }

  // The Pybricks question only makes sense when there was code to download.
  const gates = (kind === 'project' || kind === 'other')
    ? [{ ask: 'Did you clean up and put everything away?', ifNo: 'Please do that and come back!' }]
    : [{ ask: 'Did you remember to save and download your code from Pybricks?',
         ifNo: 'Go back to Pybricks, click Backup to download your program, then press the button again.' },
       { ask: 'Did you clean up your parts?', ifNo: 'Please do that and come back!' }];

  for (const gate of gates) {
    if (!await ask(gate)) { result.innerHTML = ''; return; }   // No = nothing is saved
  }

  el('save').disabled = true;
  result.innerHTML = '<div class="step">Saving&hellip;</div>';
  try {
    const data = await post('/save', entry);
    // Once the entry is saved on this laptop it must not be written twice, so the
    // boxes empty even if sending to GitHub has to wait.
    if (data.saved) {
      FIELDS.concat('sources').forEach(id => { el(id).value = ''; localStorage.removeItem('log.' + id); });
      localStorage.removeItem('log.kind');
      kind = null;
      picks.forEach(r => r.checked = false);
    }
    handle(data, entry.author);
    if (data.synced) result.innerHTML += '<div class="done">All done. Nice work today!</div>';
  } catch (e) {
    result.innerHTML = '<div class="step bad">The tool stopped running. Your typing is still here &mdash; ' +
      'do not close this tab, and ask your coach to start it again.</div>';
  }
  el('save').disabled = false;
};
</script>`;

function blogPage() {
  const entries = readEntries();
  const data = JSON.stringify(entries).replace(/</g, '\\u003c');

  const body = entries.length
    ? `<div class="layout">
         <div class="menu">
           <h4>Jump to an entry</h4>
           <div class="filter">
             <button data-kind="all" class="plain on">All</button>
             <button data-kind="robot" class="plain">Robot</button>
             <button data-kind="mission" class="plain">Mission</button>
             <button data-kind="project" class="plain">Project</button>
             <button data-kind="other" class="plain">Other</button>
           </div>
           ${entries.map((e, i) => `<button data-i="${i}" data-kind="${e.kind}">
               <span class="date">${escape(e.label)}</span>
               ${e.names ? `<span class="names">${escape(e.names)}</span>` : ''}
             </button>`).join('')}
         </div>
         <div class="entry" id="pane"></div>
       </div>`
    : `<div class="empty">No entries yet. Write the first one on the dashboard!</div>`;

  return `<!doctype html>
<meta charset="utf-8"><title>Phoenix engineering blog</title>${FAVICON}
<style>${STYLE}</style>
<div class="bar"><b>Phoenix engineering blog</b><a href="/">&larr; Back to dashboard</a></div>
<div class="wrap wide">
  <p>${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}, newest first.
     Click one on the left to read it.</p>
  ${body}
  <p style="margin-top:26px"><button class="plain" onclick="location.href='/'">Back to dashboard</button></p>
</div>
<script>
const ENTRIES = ${data};
if (ENTRIES.length) {
  const buttons = [...document.querySelectorAll('.menu button[data-i]')];

  // Show only robot entries, only project entries, or everything.
  document.querySelectorAll('.filter button').forEach(f => f.onclick = () => {
    document.querySelectorAll('.filter button').forEach(o => o.classList.toggle('on', o === f));
    buttons.forEach(b => b.hidden = f.dataset.kind !== 'all' && b.dataset.kind !== f.dataset.kind);
  });
  const open = (i) => {
    document.getElementById('pane').innerHTML = ENTRIES[i].html;
    buttons.forEach((b, n) => b.classList.toggle('on', n === i));
    localStorage.setItem('blog.open', ENTRIES[i].name);
  };
  buttons.forEach(b => b.onclick = () => open(Number(b.dataset.i)));

  // Reopen whatever was last being read, otherwise the newest entry.
  const was = ENTRIES.findIndex(e => e.name === localStorage.getItem('blog.open'));
  open(was === -1 ? 0 : was);
}
</script>`;
}

// What each folder in the team repo is for, in words a 10-year-old can use.
const FOLDERS = {
  'missions':         'Robot programs. This is where Pybricks files land when you press Backup.',
  'notebook':         'Every engineering log entry. This is what the judges read.',
  'PhoenixDashboard': 'The team log tool itself - this program you are using right now.',
  'the main folder':  'Notes about the team and the repo.'
};

function filesPage() {
  const tracked = git('ls-files');
  const files = tracked.ok && tracked.out ? tracked.out.split('\n') : [];

  // New, changed or deleted files, plus saved changes that have not reached GitHub yet.
  const waiting = changedFiles().map(f => f.path);
  const unsent = Number(git('rev-list', '--count', '@{u}..HEAD').out) || 0;

  // Group by top folder; anything at the root goes in its own group.
  const groups = {};
  for (const f of files) {
    const top = f.includes('/') ? f.split('/')[0] : 'the main folder';
    (groups[top] = groups[top] || []).push(f);
  }

  const tree = Object.keys(groups).sort().map(folder => `
    <div class="folder">
      <h3>${escape(folder)}${folder === 'the main folder' ? '' : '/'}</h3>
      ${FOLDERS[folder] ? `<p class="what">${FOLDERS[folder]}</p>` : ''}
      <ul>${groups[folder].map(f =>
        `<li>${escape(f.includes('/') ? f.split('/').slice(1).join('/') : f)}</li>`).join('')}</ul>
    </div>`).join('');

  const notSent = waiting.length || unsent
    ? `<div class="folder warn">
         <h3>On this computer only</h3>
         <p class="what">These are not on GitHub yet. They go up the next time someone
            presses <b>Sync with GitHub</b>.</p>
         ${unsent ? `<p class="what">${unsent} saved change${unsent === 1 ? '' : 's'} waiting to be sent.</p>` : ''}
         <ul>${waiting.map(f => `<li>${escape(f)}</li>`).join('')}</ul>
       </div>`
    : `<div class="folder"><h3>On this computer only</h3>
         <p class="what">Nothing waiting. Everything on this laptop is already on GitHub.</p></div>`;

  return `<!doctype html>
<meta charset="utf-8"><title>Phoenix file structure</title>${FAVICON}
<style>${STYLE}</style>
<div class="bar"><b>What is in the team folder</b><a href="/">&larr; Back to dashboard</a></div>
<div class="wrap wide"><div class="layout">

  <div class="side">
    <h4 style="margin:6px 8px 10px;font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:#666">
      What is GitHub?</h4>
    <p class="what" style="margin:0 8px 14px">
      GitHub is a copy of the team folder that lives on the internet instead of on one laptop.</p>
    <p class="what" style="margin:0 8px 14px">
      Every laptop keeps its own copy. When you press <b>Sync with GitHub</b>, your work is
      copied up and everyone else's work is copied down to you. Programs that came down
      still have to be imported into Pybricks - the dashboard lists them.</p>
    <p class="what" style="margin:0 8px 14px">
      It never forgets. Every version of every program is still in there, with the date and
      who saved it - so a mistake can always be undone.</p>
    <p class="what" style="margin:0 8px 14px">
      That history is also the proof the judges want: it shows what the team tried, and when.</p>
    <button class="plain" style="width:100%" onclick="location.href='/'">Back to dashboard</button>
  </div>

  <div class="panel">
    <h1>${files.length} files on GitHub</h1>
    ${tree}
    ${notSent}
  </div>

</div></div>`;
}

// ------------------------------------------------------------------- the server

// Only this laptop may use the tool. Without these checks anyone on the same wifi -
// or a web page open in another tab - could save and push to the team repo.
const ALLOWED_HOSTS = ['localhost:' + PORT, '127.0.0.1:' + PORT];

const oops = (e) => ({ steps: [{ msg: 'Something went wrong. Show this to your coach.', ok: false, details: String(e.message) }] });

http.createServer((req, res) => {
  const send = (type, body) => { res.writeHead(200, { 'Content-Type': type }); res.end(body); };

  if (!ALLOWED_HOSTS.includes(req.headers.host) ||
      (req.method === 'POST' && req.headers.origin !== 'http://' + req.headers.host)) {
    res.writeHead(403);
    return res.end('Only this laptop can use the team log.');
  }

  // Every action is a POST with a small JSON body.
  const actions = {
    '/save':     (b) => saveAndSync(b),
    '/sync':     (b) => sync(b.author, b.decisions || {}),
    '/imported': (b) => markImported(String(b.path)),
    '/state':    ()  => ({ pending: loadState().pending })
  };
  if (req.method === 'POST' && actions[req.url]) {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => {
      let out;
      try { out = actions[req.url](body ? JSON.parse(body) : {}); } catch (e) { out = oops(e); }
      send('application/json', JSON.stringify(out));
    });
    return;
  }

  if (req.url === '/files') return send('text/html; charset=utf-8', filesPage());
  if (req.url === '/blog') return send('text/html; charset=utf-8', blogPage());
  send('text/html; charset=utf-8', DASHBOARD);
}).listen(PORT, '127.0.0.1', () => {
  // Open the page automatically, once the server is actually ready.
  const url = 'http://localhost:' + PORT;
  if (!process.env.NO_BROWSER) try {
    if (process.platform === 'win32') execFileSync('cmd', ['/c', 'start', '', url]);
    else if (process.platform === 'darwin') execFileSync('open', [url]);
    else execFileSync('xdg-open', [url]);
  } catch (e) { /* no browser? the address is printed below anyway */ }

  console.log('');
  console.log('  Phoenix team log is running.');
  console.log('  Open http://localhost:' + PORT + ' in Chrome.');
  console.log('');
  console.log('  Leave this black window open while you work.');
  console.log('  Closing it turns the tool off.');
  console.log('');
});
