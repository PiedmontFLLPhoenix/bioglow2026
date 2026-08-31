// Phoenix team log - barebones.
// Writes an engineering log entry into notebook/ and pushes it to GitHub.
// No dependencies. Run with: node server.js

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const NOTEBOOK = path.join(REPO, 'notebook');
const PORT = 4545;

function git(...args) {
  try {
    const out = execFileSync('git', args, { cwd: REPO, encoding: 'utf8' });
    return { ok: true, out: (out || '').trim() };
  } catch (e) {
    const out = ((e.stdout || '') + (e.stderr || '')).trim();
    return { ok: false, out };
  }
}

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'entry';
}

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function writeEntry(f) {
  fs.mkdirSync(NOTEBOOK, { recursive: true });
  const base = `${today()}-${slug(f.mission)}`;
  let name = `${base}.md`;
  let n = 2;
  while (fs.existsSync(path.join(NOTEBOOK, name))) name = `${base}-${n++}.md`;

  const md = [
    `# ${today()} - ${f.mission}`,
    ``,
    `**Who was here:** ${f.who}`,
    `**Written by:** ${f.author}`,
    ``,
    `## What we tried`,
    f.tried,
    ``,
    `## What happened`,
    f.happened,
    ``,
    `## What next`,
    f.next,
    ``
  ].join('\n');

  fs.writeFileSync(path.join(NOTEBOOK, name), md);
  return `notebook/${name}`;
}

function saveAndPush(f) {
  const steps = [];
  const file = writeEntry(f);
  steps.push({ step: `Wrote ${file}`, ok: true, out: '' });

  const summary = (f.happened.split('\n')[0] || '').slice(0, 60);
  const msg = `${f.mission}: ${summary} (${f.author})`;

  const add = git('add', '-A');
  steps.push({ step: 'git add', ok: add.ok, out: add.out });
  if (!add.ok) return { steps, pushed: false };

  const commit = git('commit', '-m', msg);
  steps.push({ step: 'git commit', ok: commit.ok, out: commit.out });
  if (!commit.ok) return { steps, pushed: false };

  const pull = git('pull', '--rebase');
  steps.push({ step: 'git pull --rebase', ok: pull.ok, out: pull.out });
  if (!pull.ok) {
    git('rebase', '--abort');
    steps.push({
      step: 'Stopped safely',
      ok: false,
      out: 'Could not combine with GitHub. Your entry IS saved on this laptop. Get the coach.'
    });
    return { steps, pushed: false };
  }

  const push = git('push');
  steps.push({ step: 'git push', ok: push.ok, out: push.out });
  if (!push.ok) {
    steps.push({
      step: 'Not on GitHub yet',
      ok: false,
      out: 'Your entry IS saved on this laptop. Press the button again later to send it.'
    });
    return { steps, pushed: false };
  }

  return { steps, pushed: true };
}

const PAGE = `<!doctype html>
<meta charset="utf-8">
<title>Phoenix team log</title>
<style>
  body { font: 16px system-ui, sans-serif; max-width: 620px; margin: 32px auto; padding: 0 16px; }
  h1 { font-size: 22px; }
  label { display: block; margin: 16px 0 4px; font-weight: 600; }
  input, textarea { width: 100%; font: inherit; padding: 8px; box-sizing: border-box; }
  textarea { min-height: 70px; }
  button { font: inherit; padding: 12px 20px; margin-top: 20px; cursor: pointer; }
  #result { margin-top: 20px; white-space: pre-wrap; font-family: ui-monospace, monospace; font-size: 13px; }
  .ok { color: #146c2e; } .bad { color: #a3000f; }
</style>
<h1>Phoenix team log</h1>
<p><a href="https://code.pybricks.com" target="_blank">Open Pybricks</a></p>

<label>Who was here</label><input id="who">
<label>Which mission</label><input id="mission">
<label>What did we try</label><textarea id="tried"></textarea>
<label>What happened</label><textarea id="happened"></textarea>
<label>What next</label><textarea id="next"></textarea>
<label>Your name</label><input id="author">

<button id="go">Push your update to GitHub</button>
<div id="result"></div>

<script>
const ids = ['who','mission','tried','happened','next','author'];
const el = id => document.getElementById(id);
const result = el('result');

// Keep the typing safe if the page reloads or the server dies.
ids.forEach(id => {
  el(id).value = localStorage.getItem('log.' + id) || '';
  el(id).addEventListener('input', () => localStorage.setItem('log.' + id, el(id).value));
});

el('go').onclick = async () => {
  const f = {};
  for (const id of ids) f[id] = el(id).value.trim();
  const missing = ids.filter(id => !f[id]);
  if (missing.length) {
    result.innerHTML = '<span class="bad">Please fill in: ' + missing.join(', ') + '</span>';
    return;
  }
  el('go').disabled = true;
  result.textContent = 'Saving...';
  try {
    const res = await fetch('/save', { method: 'POST', body: JSON.stringify(f) });
    const data = await res.json();
    result.innerHTML = data.steps
      .map(s => '<span class="' + (s.ok ? 'ok' : 'bad') + '">' + (s.ok ? 'OK  ' : 'X   ') + s.step + '</span>' + (s.out ? '\\n    ' + s.out.replace(/</g,'&lt;') : ''))
      .join('\\n');
    if (data.pushed) {
      ids.forEach(id => { el(id).value = ''; localStorage.removeItem('log.' + id); });
      result.innerHTML += '\\n\\n<span class="ok">Your entry is on GitHub.</span>';
    }
  } catch (e) {
    result.innerHTML = '<span class="bad">Lost the connection to the tool. Your typing is still here - do not close this tab.</span>';
  }
  el('go').disabled = false;
};
</script>`;

http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/save') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      let out;
      try {
        out = saveAndPush(JSON.parse(body));
      } catch (e) {
        out = { steps: [{ step: 'Something went wrong', ok: false, out: String(e.message) }], pushed: false };
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out));
    });
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(PAGE);
}).listen(PORT, () => console.log(`Team log running. Open http://localhost:${PORT}`));
