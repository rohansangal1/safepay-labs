// Landing page behaviour. Everything here is decoration: the page reads fully without it.
// No inline scripts or styles are allowed by the CSP, so all motion is driven from this file.

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Top bar: shadow once scrolled, highlight the section in view ----------

const topbar = $('[data-topbar]');
const onScroll = () => topbar.classList.toggle('scrolled', window.scrollY > 8);
onScroll();
window.addEventListener('scroll', onScroll, { passive: true });

const navLinks = $$('[data-nav] a');
const sections = navLinks.map((a) => $(a.getAttribute('href'))).filter(Boolean);
if (sections.length) {
  const spy = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      for (const a of navLinks) a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id);
    }
  }, { rootMargin: '-40% 0px -55% 0px' });
  for (const s of sections) spy.observe(s);
}

// ---------- Scroll reveal ----------

const reveals = $$('.reveal');
if (reduceMotion || !('IntersectionObserver' in window)) {
  for (const el of reveals) el.classList.add('in');
} else {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('in');
      io.unobserve(e.target);
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  for (const el of reveals) io.observe(el);
}

// ---------- Rotating word in the headline ----------

const rotator = $('.rotator');
if (rotator && !reduceMotion) {
  const words = rotator.dataset.words.split(',').map((w) => w.trim());
  let i = 0;
  const swap = async () => {
    rotator.classList.add('out');
    await wait(380);
    i = (i + 1) % words.length;
    rotator.textContent = words[i];
    rotator.classList.remove('out');
    rotator.classList.add('in');
    // Two frames so the "in" start state is painted before transitioning to rest.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    rotator.classList.remove('in');
  };
  setInterval(swap, 3200);
}

// ---------- Demo: press "Pay now", then watch the checkout's chain of checks ----------

const demo = $('[data-demo]');
if (demo) {
  const stage = $('.demo-stage', demo);
  const checkout = $('[data-checkout]', demo);
  const pay = $('[data-paybtn]', demo);
  const cursor = $('[data-cursor]', demo);
  const forged = $('[data-forged]', demo);
  const status = $('[data-status]', demo);
  const steps = Object.fromEntries($$('[data-step]', demo).map((li) => [li.dataset.step, li]));
  const order = Object.keys(steps);

  let run = 0;          // incremented to cancel an in-flight timeline
  let running = false;  // a timeline is in progress
  let visible = false;  // the demo is on screen; the loop pauses when it isn't

  const say = (text, tone = '') => { status.textContent = text; status.className = 'demo-status ' + tone; };
  const reset = () => {
    for (const li of Object.values(steps)) { li.className = li.classList.contains('gate') ? 'gate' : ''; $('.verdict', li) && ($('.verdict', li).textContent = ''); }
    pay.className = 'paybtn';
    checkout.className = 'checkout';
    cursor.className = 'cursor';
    forged.className = 'forged';
  };
  const moveCursorTo = (el, dx = 0, dy = 0) => {
    const s = stage.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    const x = b.left - s.left + b.width * 0.62 + dx;
    const y = b.top - s.top + b.height * 0.55 + dy;
    cursor.style.transform = `translate(${x}px, ${y}px)`;
  };
  const activate = (key) => { steps[key].classList.add('active'); };
  const finish = (key, verdict, ok = true) => {
    const li = steps[key];
    li.classList.remove('active');
    li.classList.add(ok ? 'done' : 'rejected');
    const v = $('.verdict', li);
    if (v) v.textContent = verdict;
  };
  const stepThrough = async (keys, delay, token) => {
    for (const k of keys) {
      if (token !== run) return false;
      activate(k);
      await wait(delay);
      if (token !== run) return false;
      finish(k, steps[k].classList.contains('gate') ? 'OK' : '');
    }
    return true;
  };

  const timeline = async () => {
    const token = ++run;
    const guard = () => token === run;
    running = true;
    try { await play(token, guard); } finally { if (token === run) running = false; }
    if (token === run && visible) timeline();
  };

  const play = async (token, guard) => {
    reset();

    // Act 1: a genuine purchase.
    say('A customer is about to pay.');
    await wait(600); if (!guard()) return;
    // Cursor starts off to the bottom-right, then glides to the button.
    cursor.style.transform = 'translate(85%, 115%)';
    moveCursorTo(stage, 140, 120);
    cursor.classList.add('show');
    await wait(300); if (!guard()) return;
    moveCursorTo(pay);
    await wait(1000); if (!guard()) return;
    pay.classList.add('hover');
    checkout.classList.add('lifted');
    say('Hovering over Pay now…');
    await wait(900); if (!guard()) return;
    cursor.classList.add('press');
    pay.classList.add('pressed');
    await wait(140); if (!guard()) return;
    pay.classList.remove('pressed');
    cursor.classList.remove('press');
    pay.classList.add('busy');
    say('Pay now pressed. The checkout starts its chain of checks.');
    activate('press');
    await wait(700); if (!guard()) return;
    finish('press');
    activate('charge');
    await wait(900); if (!guard()) return;
    finish('charge');
    activate('send');
    await wait(900); if (!guard()) return;
    finish('send');
    cursor.classList.remove('show');
    if (!(await stepThrough(['verify', 'match', 'dedupe'], 850, token))) return;
    activate('record');
    await wait(800); if (!guard()) return;
    finish('record');
    activate('ship');
    pay.classList.remove('busy', 'hover');
    pay.classList.add('done');
    checkout.classList.remove('lifted');
    say('Every check passed. The order ships exactly once.', 'ok');
    await wait(900); if (!guard()) return;
    finish('ship');
    await wait(2200); if (!guard()) return;

    // Act 2: an attacker sends a forged message straight to the app.
    for (const li of Object.values(steps)) li.className = li.classList.contains('gate') ? 'gate' : '';
    for (const li of Object.values(steps)) { const v = $('.verdict', li); if (v) v.textContent = ''; }
    checkout.classList.add('aside');
    say('Now someone who never paid sends the app a fake “order paid” message.');
    forged.classList.add('show');
    await wait(1600); if (!guard()) return;
    forged.classList.add('sent');
    await wait(500); if (!guard()) return;
    activate('verify');
    await wait(1000); if (!guard()) return;
    finish('verify', 'Rejected', false);
    for (const k of order) if (k !== 'verify') steps[k].classList.add('blocked');
    say('The signature doesn’t match. Nothing is recorded and nothing ships.', 'bad');
    await wait(3200); if (!guard()) return;
    checkout.classList.remove('aside');
  };

  if (reduceMotion) {
    // Static end state: the genuine payment passed every check.
    for (const k of order) finish(k, steps[k].classList.contains('gate') ? 'OK' : '');
    pay.classList.add('done');
    say('Every check passed. The order ships exactly once.', 'ok');
  } else {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        visible = e.isIntersecting;
        if (visible && !running) timeline();
      }
    }, { threshold: 0.35 });
    io.observe(demo);
  }

  $('[data-replay]', demo).addEventListener('click', () => timeline());
  pay.addEventListener('click', () => timeline());
}
