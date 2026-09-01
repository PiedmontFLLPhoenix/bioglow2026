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
const PORT = 4545;

// ---------------------------------------------------------------- git helpers

function git(...args) {
  try {
    const out = execFileSync('git', args, { cwd: REPO, encoding: 'utf8' });
    return { ok: true, out: (out || '').trim() };
  } catch (e) {
    return { ok: false, out: ((e.stdout || '') + (e.stderr || '')).trim() };
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

// Each step reports a kid-facing message plus the raw git output for the coach.
function saveAndPush(f) {
  const steps = [];
  const say = (msg, ok, details) => steps.push({ msg, ok, details: details || '' });

  const file = writeEntry(f);
  say(`Your log entry is saved on this computer (${file})`, true);

  const summary = (f.happened.split('\n')[0] || '').slice(0, 60);
  const kindLabel = KINDS[f.kind] ? KINDS[f.kind].label : KINDS.robot.label;
  const commitMessage = `${kindLabel} - ${f.mission}: ${summary} (${f.author})`;

  const add = git('add', '-A');
  if (!add.ok) { say(explain(add.out), false, add.out); return { steps, pushed: false }; }

  const commit = git('commit', '-m', commitMessage);
  if (!commit.ok) { say(explain(commit.out), false, commit.out); return { steps, pushed: false }; }
  say(f.kind === 'robot' || f.kind === 'mission'
        ? 'Your entry and your Pybricks code are packed up together'
        : 'Your entry is packed up, ready to send', true, commit.out);

  const pull = git('pull', '--rebase');
  if (!pull.ok) {
    git('rebase', '--abort');
    say('Someone else changed the same file. Your work is safe on this computer - ask your coach.', false, pull.out);
    return { steps, pushed: false };
  }
  say('Checked GitHub for the rest of the team’s work', true, pull.out);

  const push = git('push');
  if (!push.ok) {
    say(explain(push.out), false, push.out);
    say('Your work is safe on this computer. Press the button again later to send it.', false);
    return { steps, pushed: false };
  }
  say('Sent to GitHub. The whole team can see it now.', true, push.out);

  return { steps, pushed: true };
}

// Pulls the rest of the team's work down onto this computer.
function updateFromGitHub() {
  const steps = [];
  const say = (msg, ok, details) => steps.push({ msg, ok, details: details || '' });

  // Only changes to files Git already knows about can break the update.
  // A brand new Pybricks export is untracked and harmless, so it does not block anything.
  const dirty = git('status', '--porcelain', '--untracked-files=no');
  if (dirty.ok && dirty.out) {
    say('You have changes on this computer that are not saved yet. Write your log entry and press ' +
        '"Save and send to GitHub" first, then update.', false, dirty.out);
    return { steps };
  }

  const before = git('rev-parse', 'HEAD');
  const pull = git('pull', '--rebase');
  if (!pull.ok) {
    git('rebase', '--abort');
    say(explain(pull.out), false, pull.out);
    return { steps };
  }
  const after = git('rev-parse', 'HEAD');

  if (before.out === after.out) {
    say('Your folders were already up to date. Nothing new from the team.', true);
    return { steps };
  }

  const log = git('log', '--oneline', `${before.out}..${after.out}`);
  const lines = log.ok && log.out ? log.out.split('\n') : [];
  say(`Updated. You got ${lines.length} new change${lines.length === 1 ? '' : 's'} from the team.`, true);
  lines.forEach(l => say('  ' + l.replace(/^\S+\s/, ''), true));

  if (fs.statSync(__filename).mtimeMs !== RUNNING_VERSION) {
    say('The team log tool itself was updated. Close the black window and start Team log ' +
        'again to get the new version. Your work is safe either way.', 'warn');
  }
  return { steps };
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

const STYLE = `
  :root { color-scheme: light; }
  body { font: 16px/1.5 system-ui, sans-serif; margin: 0; color: #1a1a1a; background: #fbfbfa; }
  .bar { background: #16233a; color: #fff; padding: 14px 20px; display: flex; align-items: center; gap: 20px; }
  .bar b { font-size: 18px; }
  .bar a { color: #9fd0ff; text-decoration: none; font-weight: 600; }
  .wrap { max-width: 720px; margin: 0 auto; padding: 24px 20px 60px; }
  label { display: block; margin: 18px 0 5px; font-weight: 600; }
  .hint { font-weight: 400; color: #666; font-size: 14px; }
  input, textarea { width: 100%; font: inherit; padding: 9px; box-sizing: border-box;
                    border: 1px solid #c3c3bd; border-radius: 6px; background: #fff; }
  textarea { min-height: 78px; resize: vertical; }
  button { font: inherit; font-weight: 600; padding: 13px 22px; border: 0; border-radius: 8px;
           background: #1f6feb; color: #fff; cursor: pointer; }
  button.plain { background: #e6e6e1; color: #1a1a1a; }
  button:disabled { opacity: .5; cursor: default; }
  #save { margin-top: 26px; font-size: 17px; }
  .step { padding: 9px 12px; border-radius: 6px; margin: 7px 0; background: #e8f4ea; }
  .step.bad { background: #fdeaea; }
  .step.warn { background: #fff5db; }
  .step .more { display: block; margin-top: 5px; font: 12px ui-monospace, monospace;
                color: #555; white-space: pre-wrap; }
  .done { margin-top: 16px; padding: 14px; border-radius: 8px; background: #16233a; color: #fff; font-weight: 600; }
  .modal { position: fixed; inset: 0; background: rgba(0,0,0,.55); display: flex;
           align-items: center; justify-content: center; padding: 20px; }
  .card { background: #fff; border-radius: 12px; padding: 26px; max-width: 440px; text-align: center; }
  .card p { font-size: 19px; font-weight: 600; margin: 0 0 22px; }
  .card .row { display: flex; gap: 12px; justify-content: center; }
  [hidden] { display: none !important; }
  .layout { display: grid; grid-template-columns: 270px 1fr; gap: 26px; align-items: start; }
  .wide { max-width: 1040px; }
  .menu { background: #fff; border: 1px solid #e4e4de; border-radius: 10px; padding: 12px;
          position: sticky; top: 18px; max-height: calc(100vh - 130px); overflow-y: auto; }
  .menu h4 { margin: 6px 8px 10px; font-size: 13px; text-transform: uppercase;
             letter-spacing: .05em; color: #666; }
  .menu button { display: block; width: 100%; text-align: left; background: none; color: #1a1a1a;
                 border-radius: 7px; padding: 9px 10px; font-weight: 500; font-size: 15px; }
  .menu button:hover { background: #f0f0ec; }
  .menu button.on { background: #16233a; color: #fff; }
  .menu .date { display: block; font-weight: 600; }
  .menu .names { display: block; font-size: 13px; color: #666; }
  .menu button.on .names { color: #b9c9e2; }
  .folder { margin-bottom: 22px; }
  .folder h3 { margin: 0 0 3px; font: 600 16px ui-monospace, monospace; }
  .folder .what { margin: 0 0 8px; color: #555; font-size: 14px; }
  .folder ul { margin: 0; padding-left: 22px; }
  .folder li { font: 14px ui-monospace, monospace; padding: 1px 0; }
  .folder.warn h3 { color: #8a5a00; }
  .side .what { font-size: 14px; color: #444; line-height: 1.55; }
  .picks { display: flex; flex-wrap: wrap; gap: 22px; margin: 8px 0 4px; }
  .pick { display: flex; align-items: center; gap: 9px; cursor: pointer; }
  .pick input { position: absolute; opacity: 0; }
  .pick .box { flex: none; width: 20px; height: 20px; border: 2px solid #9a9a92; border-radius: 5px; }
  .pick input:checked + .box { background: #16233a; border-color: #16233a; }
  .pick input:checked + .box::after { content: '\\2713'; display: block; color: #fff;
          text-align: center; line-height: 19px; font-size: 14px; font-weight: 700; }
  .pick:has(input:checked) { font-weight: 600; }
  .tag { display: inline-block; font-size: 11px; font-weight: 700; padding: 1px 7px;
         border-radius: 20px; background: #e4e9f1; color: #16233a; vertical-align: 2px; }
  .tag.project { background: #e6f0e3; color: #24521a; }
  .filter { display: flex; gap: 6px; margin-bottom: 12px; }
  .filter button { flex: 1; text-align: center; padding: 7px 2px; font-size: 12px; }
  .filter button.on { background: #16233a; color: #fff; }
  .side { background: #fff; border: 1px solid #e4e4de; border-radius: 10px; padding: 14px;
          position: sticky; top: 18px; }
  .side button { display: block; width: 100%; text-align: left; margin-bottom: 8px; }
  .side .hint { display: block; margin: -2px 4px 16px; }
  .panel { background: #fff; border: 1px solid #e4e4de; border-radius: 10px; padding: 6px 26px 26px; }
  .panel h1 { font-size: 21px; }
  .entry { background: #fff; border: 1px solid #e4e4de; border-radius: 10px; padding: 4px 26px 22px; }
  .entry h2 { font-size: 21px; } .entry h3 { font-size: 15px; color: #444; margin-bottom: 2px; }
  .empty { background: #fff; border: 1px dashed #c3c3bd; border-radius: 10px; padding: 30px; text-align: center; color: #666; }
`;

const DASHBOARD = `<!doctype html>
<meta charset="utf-8"><title>Phoenix team log</title>
<style>${STYLE}</style>
<div class="bar"><b>Phoenix team log</b></div>
<div class="wrap wide"><div class="layout">

  <div class="side">
    <button id="update">Download latest missions</button>
    <button class="plain" onclick="location.href='/blog'">Read engineering blog</button>
    <button class="plain" onclick="location.href='/files'">File structure</button>
    <button class="plain" onclick="window.open('https://code.pybricks.com', '_blank')">Open Pybricks</button>
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
  <div id="result"></div>
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

function show(steps) {
  result.innerHTML = steps.map(s =>
    '<div class="step' + (s.ok === true ? '' : s.ok === 'warn' ? ' warn' : ' bad') + '">' + s.msg +
    (s.details && s.ok !== true ? '<span class="more">' + s.details + '</span>' : '') + '</div>'
  ).join('');
}

el('update').onclick = async () => {
  el('update').disabled = true;
  result.innerHTML = '<div class="step">Checking GitHub&hellip;</div>';
  try {
    const res = await fetch('/update', { method: 'POST' });
    show((await res.json()).steps);
  } catch (e) {
    result.innerHTML = '<div class="step bad">The tool stopped running. Ask your coach to start it again.</div>';
  }
  el('update').disabled = false;
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
    const res = await fetch('/save', { method: 'POST', body: JSON.stringify(entry) });
    const data = await res.json();
    show(data.steps);
    if (data.pushed) {
      FIELDS.concat('sources').forEach(id => { el(id).value = ''; localStorage.removeItem('log.' + id); });
      localStorage.removeItem('log.kind');
      kind = null;
      picks.forEach(r => r.checked = false);
      result.innerHTML += '<div class="done">All done. Nice work today!</div>';
    }
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
<meta charset="utf-8"><title>Phoenix engineering blog</title>
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
  'PhoenixDashboard': 'The team log tool itself - this program you are using right now.'
};

function filesPage() {
  const tracked = git('ls-files');
  const files = tracked.ok && tracked.out ? tracked.out.split('\n') : [];

  const untracked = git('status', '--porcelain', '--untracked-files=all');
  const waiting = untracked.ok && untracked.out
    ? untracked.out.split('\n').filter(l => l.startsWith('??')).map(l => l.slice(3))
    : [];

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

  const notSent = waiting.length
    ? `<div class="folder warn">
         <h3>On this computer only</h3>
         <p class="what">These are not on GitHub yet. They go up the next time someone
            presses <b>Save and send to GitHub</b>.</p>
         <ul>${waiting.map(f => `<li>${escape(f)}</li>`).join('')}</ul>
       </div>`
    : `<div class="folder"><h3>On this computer only</h3>
         <p class="what">Nothing waiting. Everything on this laptop is already on GitHub.</p></div>`;

  return `<!doctype html>
<meta charset="utf-8"><title>Phoenix file structure</title>
<style>${STYLE}</style>
<div class="bar"><b>What is in the team folder</b><a href="/">&larr; Back to dashboard</a></div>
<div class="wrap wide"><div class="layout">

  <div class="side">
    <h4 style="margin:6px 8px 10px;font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:#666">
      What is GitHub?</h4>
    <p class="what" style="margin:0 8px 14px">
      GitHub is a copy of the team folder that lives on the internet instead of on one laptop.</p>
    <p class="what" style="margin:0 8px 14px">
      Every laptop keeps its own copy. When you press <b>Save and send to GitHub</b>, your
      work is copied up. When you press <b>Download latest missions</b>, everyone else's
      work is copied down to you.</p>
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

http.createServer((req, res) => {
  const send = (type, body) => { res.writeHead(200, { 'Content-Type': type }); res.end(body); };

  if (req.method === 'POST' && req.url === '/save') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      let out;
      try {
        out = saveAndPush(JSON.parse(body));
      } catch (e) {
        out = { steps: [{ msg: 'Something went wrong. Show this to your coach.', ok: false, details: String(e.message) }], pushed: false };
      }
      send('application/json', JSON.stringify(out));
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/update') {
    let out;
    try {
      out = updateFromGitHub();
    } catch (e) {
      out = { steps: [{ msg: 'Something went wrong. Show this to your coach.', ok: false, details: String(e.message) }] };
    }
    return send('application/json', JSON.stringify(out));
  }

  if (req.url === '/files') return send('text/html; charset=utf-8', filesPage());
  if (req.url === '/blog') return send('text/html; charset=utf-8', blogPage());
  send('text/html; charset=utf-8', DASHBOARD);
}).listen(PORT, () => {
  // Open the page automatically, once the server is actually ready.
  const url = 'http://localhost:' + PORT;
  try {
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
