'use strict';

const REPO = 'https://github.com/rohansangal1/payment-integration-lab/blob/main/';
const VIEWS = ['overview', 'benchmark', 'sandbox', 'roadmap', 'library', 'docs'];
const VERDICTS = {
  'assessed': 'Assessed',
  'insufficient-evidence': 'Insufficient evidence',
  'critical-failure': 'Critical failure',
  'not-applicable': 'Not applicable',
};
const MILESTONE_STATUS = { 'done': 'Done', 'in-progress': 'In progress', 'not-started': 'Not started' };
const DOCS = [
  ['docs/RESEARCH_PLAN.md', 'Research protocol', 'Questions, threat model, datasets and study design.'],
  ['docs/METRIC.md', 'Score specification', 'PIAS definition, control catalog, weights and gates.'],
  ['docs/LITERATURE.md', 'Related work', 'Prior research and primary provider sources.'],
  ['docs/SAFETY.md', 'Safety and compliance', 'Authorization rules, data handling and PCI boundaries.'],
  ['docs/DATA_AND_TOOLS.md', 'Dataset and tooling', 'Dataset structure, splits and planned tooling.'],
  ['docs/GITHUB_SETUP.md', 'Repository setup', 'Repository settings and the initial backlog.'],
];

const $ = id => document.getElementById(id);
const round = n => (n === null ? '—' : Math.round(n));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

let controls = [];
let fixtures = [];
let milestones = [];
let library = [];
let sandbox = {};

// ---------- Data ----------

async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error('Could not load ' + path);
  return res.json();
}

// Deterministic synthetic outcomes: same pattern as before so fixture IDs stay stable.
function syntheticResults(i) {
  return Object.fromEntries(controls.map((c, j) => {
    const status = i === 0 ? 'pass' : (i + j) % 7 === 0 ? 'fail' : (i + j) % 5 === 0 ? 'unknown' : 'pass';
    return [c.id, { status, evidence: `synthetic:F${String(i + 1).padStart(2, '0')}:${c.id}` }];
  }));
}

function buildFixtures(assessments) {
  // Lab runs come from `npm run assess` against the local reference checkout.
  const lab = (assessments ? assessments.runs : []).map(run => ({
    id: run.id,
    label: run.label,
    source: 'lab',
    provider: 'Local lab',
    architecture: 'Custom',
    results: run.results,
    score: PIL.score(controls, run.results),
  }));
  const synthetic = Array.from({ length: 12 }, (_, i) => {
    const results = syntheticResults(i);
    return {
      id: 'F' + String(i + 1).padStart(2, '0'),
      label: 'Illustrative example',
      source: 'synthetic',
      provider: i % 2 ? 'Square' : 'Stripe',
      architecture: ['Hosted', 'Embedded', 'Custom'][i % 3],
      results,
      score: PIL.score(controls, results),
    };
  });
  return [...lab, ...synthetic];
}

const SOURCES = { lab: 'Lab run', synthetic: 'Synthetic' };
const NOT_ASSESSED = { status: 'unknown', evidence: 'No check yet' };

// ---------- Routing ----------

let currentView = null;

function route() {
  const view = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'overview';
  if (view === currentView) return;
  currentView = view;
  document.querySelectorAll('.view').forEach(s => { s.hidden = s.id !== view; });
  document.querySelectorAll('nav a').forEach(a => {
    a.classList.toggle('active', a.getAttribute('href') === '#' + view);
  });
  window.scrollTo(0, 0);
}

// ---------- Tooltip ----------

function attachTooltip(el, html) {
  const tip = $('tooltip');
  el.addEventListener('mouseenter', () => { tip.innerHTML = html; tip.hidden = false; });
  el.addEventListener('mousemove', e => {
    const x = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
    tip.style.left = x + 'px';
    tip.style.top = (e.clientY + 14) + 'px';
  });
  el.addEventListener('mouseleave', () => { tip.hidden = true; });
}

// ---------- Overview ----------

function renderOverview() {
  const critical = controls.filter(c => c.critical).length;
  $('stat-controls').textContent = controls.length;
  $('stat-critical').textContent = `${critical} critical gates`;

  const done = milestones.filter(m => m.status === 'done').length;
  const active = milestones.filter(m => m.status === 'in-progress').length;
  $('stat-milestones').textContent = `${done} / ${milestones.length}`;
  $('stat-milestones-sub').textContent = `${active} in progress`;

  // Assurance range chart
  const range = $('range-chart');
  range.innerHTML = `<div class="axis"><span>0</span><span>50</span><span>100</span></div>` +
    fixtures.map(f => `
      <a class="range-row" href="#benchmark" data-id="${f.id}">
        <span class="range-label">${f.id}</span>
        <span class="range-track"><span class="range-bar ${f.score.gate}" style="left:${f.score.lower}%;width:${Math.max(f.score.upper - f.score.lower, 1)}%"></span></span>
        <span class="range-verdict">${VERDICTS[f.score.gate]}</span>
      </a>`).join('');
  range.querySelectorAll('.range-row').forEach(row => {
    const f = fixtures.find(x => x.id === row.dataset.id);
    attachTooltip(row, `<b>${f.id}</b> · ${f.provider} / ${f.architecture}<br>Range ${round(f.score.lower)}–${round(f.score.upper)} · Coverage ${round(f.score.coverage)}%<br>${VERDICTS[f.score.gate]}`);
    row.addEventListener('click', e => {
      e.preventDefault();
      $('tooltip').hidden = true;
      location.hash = 'benchmark';
      route();
      showFixture(f.id);
    });
  });

  // Control weight chart
  const maxWeight = Math.max(...controls.map(c => c.weight));
  const weights = $('weight-chart');
  weights.innerHTML = controls.map(c => `
    <div class="bar-row" data-id="${c.id}">
      <span class="bar-label">${esc(c.title)}${c.critical ? ' <em class="tag">critical</em>' : ''}</span>
      <span class="bar-track"><span class="bar" style="width:${(c.weight / maxWeight) * 100}%"></span></span>
      <span class="bar-value">${c.weight}</span>
    </div>`).join('');
  weights.querySelectorAll('.bar-row').forEach(row => {
    const c = controls.find(x => x.id === row.dataset.id);
    attachTooltip(row, `<b>${esc(c.title)}</b> · weight ${c.weight}${c.critical ? ' · critical' : ''}<br>${esc(c.description)}`);
  });

  // Roadmap progress
  $('progress-fill').style.width = (done / milestones.length) * 100 + '%';
  const phases = [...new Set(milestones.map(m => m.phase))];
  $('phase-summary').innerHTML = phases.map(p => {
    const items = milestones.filter(m => m.phase === p);
    const d = items.filter(m => m.status === 'done').length;
    return `<div><span>${esc(p)}</span><b>${d} / ${items.length}</b></div>`;
  }).join('');
}

// ---------- Benchmark ----------

function renderFixtures() {
  const provider = $('f-provider').value;
  const arch = $('f-arch').value;
  const verdict = $('f-verdict').value;
  const source = $('f-source').value;
  const rows = fixtures.filter(f =>
    (source === 'all' || f.source === source) &&
    (provider === 'all' || f.provider === provider) &&
    (arch === 'all' || f.architecture === arch) &&
    (verdict === 'all' || f.score.gate === verdict));
  $('f-count').textContent = `${rows.length} of ${fixtures.length} fixtures`;
  $('fixture-rows').innerHTML = rows.map(f => `
    <tr data-id="${f.id}" tabindex="0">
      <td><b>${f.id}</b><small class="sub">${esc(f.label)}</small></td>
      <td><span class="tag">${SOURCES[f.source]}</span></td>
      <td>${f.provider}</td>
      <td>${f.architecture}</td>
      <td class="num">${round(f.score.lower)}–${round(f.score.upper)}</td>
      <td class="num">${round(f.score.coverage)}%</td>
      <td><span class="verdict ${f.score.gate}">${VERDICTS[f.score.gate]}</span></td>
    </tr>`).join('') || '<tr><td colspan="7" class="muted">No fixtures match these filters.</td></tr>';
  $('fixture-rows').querySelectorAll('tr[data-id]').forEach(tr => {
    tr.addEventListener('click', () => showFixture(tr.dataset.id));
    tr.addEventListener('keydown', e => { if (e.key === 'Enter') showFixture(tr.dataset.id); });
  });
}

function showFixture(id) {
  const f = fixtures.find(x => x.id === id);
  if (!f) return;
  const panel = $('fixture-detail');
  panel.hidden = false;
  panel.innerHTML = `
    <div class="card-head">
      <h2>${f.id} · ${esc(f.label)}</h2>
      <span class="verdict ${f.score.gate}">${VERDICTS[f.score.gate]}</span>
    </div>
    <p class="muted">${f.source === 'lab'
      ? 'Checks run by <code>npm run assess</code> against the local reference checkout. A lab fixture, not a merchant assessment.'
      : 'Synthetic outcomes that demonstrate traceability. Not assessment results.'}</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Control</th><th class="num">Weight</th><th>Outcome</th><th>Evidence</th></tr></thead>
      <tbody>${controls.map(c => {
        const r = f.results[c.id] || NOT_ASSESSED;
        const checks = (r.checks || []).map(k =>
          `<li class="${k.pass ? 'ok' : 'bad'}">${k.pass ? '✓' : '✗'} ${esc(k.description)}${k.pass ? '' : ` <span class="muted">(expected ${esc(k.expected)}, observed ${esc(k.observed)})</span>`}</li>`).join('');
        return `<tr><td>${esc(c.title)}${c.critical ? ' <em class="tag">critical</em>' : ''}</td><td class="num">${c.weight}</td><td><span class="outcome ${r.status}">${r.status}</span></td><td><code>${esc(r.evidence)}</code>${checks ? `<ul class="checks">${checks}</ul>` : ''}</td></tr>`;
      }).join('')}</tbody>
    </table></div>`;
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- Sandbox ----------

function renderControls() {
  $('control-list').innerHTML = controls.map(c => `
    <div class="control">
      <div>
        <span class="control-name">${esc(c.title)}</span>
        <small>${c.weight} weight${c.critical ? ' · critical' : ''}</small>
      </div>
      <div class="segmented" role="group" aria-label="${esc(c.title)}" id="o-${c.id}">
        ${['pass', 'fail', 'unknown'].map(s => `<button type="button" data-control="${c.id}" data-status="${s}" class="${s}">${s[0].toUpperCase() + s.slice(1)}</button>`).join('')}
      </div>
    </div>`).join('');
  $('control-list').querySelectorAll('button[data-control]').forEach(b => {
    b.addEventListener('click', () => {
      sandbox[b.dataset.control] = { status: b.dataset.status, evidence: 'synthetic:sandbox:' + b.dataset.control };
      renderScore();
    });
  });
}

function renderScore() {
  controls.forEach(c => {
    $('o-' + c.id).querySelectorAll('button').forEach(b => {
      const on = b.dataset.status === sandbox[c.id].status;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on);
    });
  });
  const s = PIL.score(controls, sandbox);
  $('s-range').textContent = `${round(s.lower)}–${round(s.upper)}`;
  $('s-track-fill').style.left = (s.lower ?? 0) + '%';
  $('s-track-fill').style.width = ((s.upper ?? 0) - (s.lower ?? 0)) + '%';
  $('s-coverage').textContent = round(s.coverage) + '%';
  $('s-observed').textContent = s.observed === null ? 'Unassessed' : round(s.observed) + '%';
  const detail = s.criticalFailures.length
    ? ` · ${s.criticalFailures.length} critical failed`
    : s.criticalUnknown.length ? ' · critical evidence missing' : '';
  $('s-gate').className = 'verdict ' + s.gate;
  $('s-gate').textContent = VERDICTS[s.gate] + detail;
}

function resetSandbox() {
  sandbox = structuredClone(fixtures.find(f => f.id === 'F03').results);
  renderScore();
}

// ---------- Roadmap ----------

function renderRoadmap() {
  $('milestone-board').innerHTML = Object.entries(MILESTONE_STATUS).map(([key, label]) => {
    const items = milestones.filter(m => m.status === key);
    return `
      <div class="column">
        <h2>${label} <span class="count">${items.length}</span></h2>
        ${items.map(m => `
          <div class="milestone ${key}">
            <div class="milestone-head"><span class="phase">${esc(m.phase)}</span><span class="muted">#${m.id}</span></div>
            <b>${esc(m.title)}</b>
            <p>${esc(m.detail)}</p>
          </div>`).join('') || '<p class="muted empty">Nothing here yet.</p>'}
      </div>`;
  }).join('');
}

// ---------- Library & docs ----------

function renderLibrary(category = 'All') {
  const categories = ['All', ...new Set(library.map(x => x.category))];
  $('library-filters').innerHTML = categories.map(c =>
    `<button type="button" class="chip${c === category ? ' on' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
  $('library-filters').querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => renderLibrary(b.dataset.cat)));
  $('library-list').innerHTML = library
    .filter(x => category === 'All' || x.category === category)
    .map(x => `
      <a class="item" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">
        <div class="item-meta"><span class="tag">${esc(x.category)}</span><span class="muted">${esc(x.source)}</span></div>
        <b>${esc(x.title)} ↗</b>
        <p>${esc(x.note)}</p>
      </a>`).join('');
}

function renderDocs() {
  $('doc-list').innerHTML = DOCS.map(([path, title, desc]) => `
    <a class="item" href="${REPO}${path}" target="_blank" rel="noopener noreferrer">
      <div class="item-meta"><code>${path}</code></div>
      <b>${title} ↗</b>
      <p>${desc}</p>
    </a>`).join('');
}

// ---------- Init ----------

async function init() {
  let assessments;
  try {
    [controls, milestones, library, assessments] = await Promise.all([
      loadJSON('data/controls.json'),
      loadJSON('data/milestones.json'),
      loadJSON('data/library.json'),
      loadJSON('data/assessments.json').catch(() => null), // optional until `npm run assess` has run
    ]);
  } catch (err) {
    document.querySelector('main').innerHTML =
      '<p class="banner error">Could not load data. Serve this folder over HTTP (see README) instead of opening the file directly.</p>';
    console.error(err);
    return;
  }
  fixtures = buildFixtures(assessments);
  $('stat-lab').textContent = fixtures.filter(f => f.source === 'lab').length;

  renderOverview();
  renderFixtures();
  ['f-source', 'f-provider', 'f-arch', 'f-verdict'].forEach(id => $(id).addEventListener('change', renderFixtures));
  renderControls();
  $('reset').addEventListener('click', resetSandbox);
  resetSandbox();
  renderRoadmap();
  renderLibrary();
  renderDocs();

  window.addEventListener('hashchange', route);
  route();
}

init();
