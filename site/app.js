import { score, COVERAGE_THRESHOLD } from './score.js';

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
  ['docs/RESEARCH_PLAN.md', 'Research protocol', 'Research questions, subjects, harm oracle, analysis and milestones.'],
  ['docs/METRIC.md', 'Score specification', 'PIAS definition, control catalog, gates and open questions for v1.'],
  ['docs/LITERATURE.md', 'Related work', 'Prior research, primary sources and the novelty matrix.'],
  ['docs/SAFETY.md', 'Safety and compliance', 'Authorization, untrusted generated code, data handling and disclosure.'],
  ['docs/DATA_AND_TOOLS.md', 'Dataset and tooling', 'Dataset units, evidence records and execution architecture.'],
  ['docs/decisions/README.md', 'Decision records', 'Why the project is shaped the way it is (ADRs).'],
  ['docs/GITHUB_SETUP.md', 'Repository setup', 'CI, repository settings to enable and backlog.'],
  ['docs/PORTAL_ACCESS.md', 'Portal access', 'Getting an account, signing in, and managing researcher accounts from the terminal.'],
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
    defects: run.defects,
    results: run.results,
    score: score(controls, run.results),
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
      score: score(controls, results),
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

const SANDBOX_DEFAULT = 'F03';
const titles = ids => ids.map(id => esc(controls.find(c => c.id === id).title)).join(', ');
// A control's share of the total weight, as points out of 100.
const points = c => Math.round((100 * c.weight) / controls.reduce((sum, x) => sum + x.weight, 0));

function renderControls() {
  // The defect-free lab run shows which checks exist for each control today.
  const baseline = fixtures.find(f => f.source === 'lab' && !f.defects.length);
  $('control-list').innerHTML = controls.map(c => {
    const checks = baseline?.results[c.id]?.checks || [];
    return `
    <div class="control">
      <div class="control-row">
        <button type="button" class="control-toggle" aria-expanded="false" aria-controls="d-${c.id}">
          <span class="control-name">${esc(c.title)}${c.critical ? ' <em class="tag">critical</em>' : ''}</span>
          <small>${c.weight} weight</small>
        </button>
        <div class="segmented" role="group" aria-label="${esc(c.title)}" id="o-${c.id}">
          ${['pass', 'fail', 'unknown'].map(s => `<button type="button" data-control="${c.id}" data-status="${s}" class="${s}">${s[0].toUpperCase() + s.slice(1)}</button>`).join('')}
        </div>
      </div>
      <div class="control-detail" id="d-${c.id}" hidden>
        <p>${esc(c.description)}</p>
        <dl class="facts">
          <div><dt>Without it</dt><dd>${esc(c.risk)}</dd></div>
          <div><dt>Evidence for a pass</dt><dd>${esc(c.requires)}</dd></div>
          <div><dt>Lab checks</dt><dd>${checks.length
            ? `<ul class="checks">${checks.map(k => `<li>${esc(k.description)}</li>`).join('')}</ul>`
            : 'No automated check yet, so lab runs leave this control unknown.'}</dd></div>
          <div><dt>Effect on the score</dt><dd id="e-${c.id}"></dd></div>
        </dl>
      </div>
    </div>`;
  }).join('');
  $('control-list').querySelectorAll('.control-toggle').forEach(b => {
    b.addEventListener('click', () => {
      const open = b.getAttribute('aria-expanded') !== 'true';
      b.setAttribute('aria-expanded', open);
      $(b.getAttribute('aria-controls')).hidden = !open;
    });
  });
  $('control-list').querySelectorAll('button[data-control]').forEach(b => {
    b.addEventListener('click', () => {
      sandbox[b.dataset.control] = { status: b.dataset.status, evidence: 'synthetic:sandbox:' + b.dataset.control };
      renderScore();
    });
  });
}

// What a control's current outcome does to the range and the verdict.
function effectOf(c, status) {
  const p = points(c);
  if (status === 'pass') return `Passing adds ${p} points to both ends of the range.`;
  if (status === 'fail') {
    return `Failing takes ${p} points off the top of the range. ` + (c.critical
      ? 'It is a critical control, so the verdict becomes Critical failure whatever the score.'
      : 'It is not critical, so on its own it does not change the verdict.');
  }
  return `Unknown widens the range by ${p} points: they are not credited at the low end but still possible at the high end. ` + (c.critical
    ? 'It is a critical control, so the verdict cannot be Assessed until it is tested.'
    : `It also lowers coverage, which must reach ${COVERAGE_THRESHOLD}% for an Assessed verdict.`);
}

// Plain-language reading of the verdict and the range.
function explainScore(s, weight) {
  let verdict;
  if (s.gate === 'critical-failure') {
    verdict = `<b>${titles(s.criticalFailures)}</b> failed. A failed critical control overrides the score, however high it is.`;
  } else if (s.gate === 'insufficient-evidence') {
    const why = [];
    if (s.criticalUnknown.length) why.push(`<b>${titles(s.criticalUnknown)}</b> ${s.criticalUnknown.length > 1 ? 'are critical controls' : 'is a critical control'} that ${s.criticalUnknown.length > 1 ? 'have' : 'has'} not been tested.`);
    if (s.coverage < COVERAGE_THRESHOLD) why.push(`Only ${round(s.coverage)}% of the weight has been tested; the threshold is ${COVERAGE_THRESHOLD}%.`);
    verdict = why.join(' ') + ' That is too little evidence to rate this integration.';
  } else {
    const failed = controls.filter(c => sandbox[c.id].status === 'fail').map(c => c.id);
    verdict = `Every critical control passed and at least ${COVERAGE_THRESHOLD}% of the weight has been tested. This does not mean safe or certified.`
      + (failed.length ? ` <b>${titles(failed)}</b> still failed.` : '');
  }
  const range = `${weight.pass} of 100 points are backed by passing evidence.`
    + (weight.fail ? ` ${weight.fail} are lost to failed controls.` : '')
    + (weight.unknown
      ? ` ${weight.unknown} are untested, so the score lies somewhere between ${round(s.lower)} and ${round(s.upper)}.`
      : ' Nothing is untested, so the range is a single number.');
  return `<p>${verdict}</p><p>${range}</p>`;
}

function renderScore() {
  const weight = { pass: 0, fail: 0, unknown: 0 };
  controls.forEach(c => {
    const status = sandbox[c.id].status;
    weight[status] += points(c);
    $('o-' + c.id).querySelectorAll('button').forEach(b => {
      const on = b.dataset.status === status;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on);
    });
    $('e-' + c.id).textContent = effectOf(c, status);
  });
  const s = score(controls, sandbox);
  $('s-range').textContent = `${round(s.lower)}–${round(s.upper)}`;
  // Passed | unknown | failed: the range runs from the end of passed to the end of unknown.
  ['pass', 'unknown', 'fail'].forEach(k => { $('s-' + k).style.width = weight[k] + '%'; });
  $('s-legend').innerHTML = `<span class="outcome pass">Passed ${weight.pass}</span><span class="outcome unknown">Unknown ${weight.unknown}</span><span class="outcome fail">Failed ${weight.fail}</span>`;
  $('s-coverage').textContent = round(s.coverage) + '%';
  $('s-observed').textContent = s.observed === null ? 'Unassessed' : round(s.observed) + '%';
  $('s-gate').className = 'verdict ' + s.gate;
  $('s-gate').textContent = VERDICTS[s.gate];
  $('s-explain').innerHTML = explainScore(s, weight);
}

function resetSandbox() {
  const f = fixtures.find(x => x.id === $('s-preset').value);
  // Lab runs only carry the controls that have checks; the rest start unknown.
  sandbox = Object.fromEntries(controls.map(c => [c.id, structuredClone(f.results[c.id] || { status: 'unknown' })]));
  renderScore();
}

function renderPresets() {
  $('s-preset').innerHTML = fixtures.map(f =>
    `<option value="${f.id}"${f.id === SANDBOX_DEFAULT ? ' selected' : ''}>${f.id} · ${esc(f.label)}</option>`).join('');
  $('s-preset').addEventListener('change', resetSandbox);
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

const UNREVIEWED = 'Unreviewed';
const FLAG_LABELS = { 'new-version': 'New version', 'link-broken': 'Link broken' };

// Included sources by category, plus automated finds awaiting review (see scripts/update-library.ts).
function renderLibrary(category = 'All') {
  const included = library.filter(x => x.status === 'included');
  const candidates = library.filter(x => x.status === 'candidate');
  const categories = ['All', ...new Set(included.map(x => x.category)), ...(candidates.length ? [UNREVIEWED] : [])];
  $('library-filters').innerHTML = categories.map(c =>
    `<button type="button" class="chip${c === category ? ' on' : ''}" data-cat="${esc(c)}">${esc(c)}${c === UNREVIEWED ? ` (${candidates.length})` : ''}</button>`).join('');
  $('library-filters').querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => renderLibrary(b.dataset.cat)));
  const shown = category === UNREVIEWED ? candidates : included.filter(x => category === 'All' || x.category === category);
  $('library-list').innerHTML = shown
    .map(x => `
      <a class="item" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">
        <div class="item-meta">
          <span class="tag">${esc(x.status === 'candidate' ? UNREVIEWED : x.category)}</span>
          ${(x.flags || []).map(f => `<span class="tag flag">${esc(FLAG_LABELS[f] || f)}</span>`).join('')}
          <span class="muted">${esc(x.source)}</span>
        </div>
        <b>${esc(x.title)} ↗</b>
        ${x.authors ? `<p class="muted">${esc(x.authors)}</p>` : ''}
        <p>${esc(x.note || x.abstract || '')}</p>
        ${x.found ? `<p class="muted">Found ${esc(x.found.date)} via ${esc(x.found.via)}</p>` : ''}
      </a>`).join('') || '<p class="muted empty">Nothing here yet.</p>';
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
  renderPresets();
  $('reset').addEventListener('click', resetSandbox);
  resetSandbox();
  renderRoadmap();
  renderLibrary();
  renderDocs();

  window.addEventListener('hashchange', route);
  route();
}

init();
