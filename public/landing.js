// Landing page behaviour. Everything here is decoration: the page reads fully without it.
// No inline scripts or styles are allowed by the CSP, so all motion is driven from this file
// (setting properties through element.style is CSSOM, which the CSP permits).

import { mountScenes } from './scenes.js';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

// ---------- Intro curtain: once per browser session ----------

const playIntro = () => {
  let seen = false;
  try { seen = sessionStorage.getItem('pil-intro') === '1'; sessionStorage.setItem('pil-intro', '1'); } catch { /* storage blocked */ }
  if (reduceMotion || seen) return Promise.resolve();
  const intro = document.createElement('div');
  intro.className = 'intro';
  intro.setAttribute('aria-hidden', 'true');
  const word = document.createElement('div');
  word.className = 'intro-word';
  let i = 0;
  for (const [text, italic] of [['Safe', false], ['Pay', true]]) {
    for (const ch of text) {
      const s = document.createElement('span');
      s.textContent = ch;
      s.style.setProperty('--i', i++);
      if (italic) { const em = document.createElement('em'); em.append(s); word.append(em); } else word.append(s);
    }
  }
  intro.append(word);
  document.body.append(intro);
  return wait(1150).then(() => {
    intro.classList.add('lift');
    setTimeout(() => intro.remove(), 1100);
    return wait(350);
  });
};

// ---------- Top bar and scroll progress ----------

const topbar = $('[data-topbar]');
const progress = $('[data-progress]');
let lastY = window.scrollY;

// ---------- Nav: a pill slides under the section in view ----------

const navLinks = $$('[data-nav] a');
const pill = $('[data-nav-pill]');
const placePill = () => {
  const a = navLinks.find((l) => l.classList.contains('active'));
  pill.classList.toggle('on', Boolean(a));
  if (!a) return;
  pill.style.width = `${a.offsetWidth}px`;
  pill.style.transform = `translateX(${a.offsetLeft}px)`;
};
const sections = navLinks.map((a) => $(a.getAttribute('href'))).filter(Boolean);
if (sections.length) {
  const spy = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      for (const a of navLinks) a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id);
      placePill();
    }
  }, { rootMargin: '-40% 0px -55% 0px' });
  for (const s of sections) spy.observe(s);
}

// ---------- Text splitting ----------

// Wrap each word of el in spans; `make` builds the wrapper for one word.
const eachWord = (el, make) => {
  const walk = (parent) => {
    for (const child of [...parent.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        for (const part of child.textContent.split(/(\s+)/)) {
          if (!part) continue;
          frag.append(/^\s+$/.test(part) ? ' ' : make(document.createTextNode(part)));
        }
        child.replaceWith(frag);
      } else if (child.classList?.contains('rotator')) {
        const holder = document.createElement('span');
        child.replaceWith(holder);
        holder.replaceWith(make(child)); // the rotating word moves as one unit
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        walk(child);
      }
    }
  };
  walk(el);
};

const splitHeading = (el) => {
  let i = 0;
  eachWord(el, (node) => {
    const w = document.createElement('span');
    const wi = document.createElement('span');
    w.className = 'w';
    wi.className = 'wi';
    wi.style.setProperty('--i', i++);
    wi.append(node);
    w.append(wi);
    return w;
  });
};

// ---------- Scroll reveal, staggered among siblings ----------

const reveals = $$('.reveal, .reveal-clip');
const splits = $$('.split');
const startReveals = () => {
  if (reduceMotion || !('IntersectionObserver' in window)) {
    for (const el of [...reveals, ...splits]) el.classList.add('in');
    return;
  }
  // A fully clipped element has no visible area, so clip reveals are watched through their parent.
  const watched = new Map();
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const el = watched.get(e.target);
      el.classList.add('in');
      io.unobserve(e.target);
      // Once revealed, drop the delay so hover transitions respond instantly.
      if (el.style.getPropertyValue('--d')) setTimeout(() => el.style.removeProperty('--d'), 1800);
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  for (const el of [...reveals, ...splits]) {
    const target = el.classList.contains('reveal-clip') ? el.parentElement : el;
    watched.set(target, el);
    io.observe(target);
  }
};
if (!reduceMotion) {
  for (const el of splits) splitHeading(el);
  for (const el of reveals) {
    const siblings = [...el.parentElement.children].filter((c) => c.classList.contains('reveal'));
    const idx = siblings.indexOf(el);
    if (idx > 0) el.style.setProperty('--d', `${Math.min(idx, 6) * 0.09}s`);
  }
}

// ---------- Rotating word in the headline ----------

const rotator = $('.rotator');
if (rotator && !reduceMotion) {
  const words = rotator.dataset.words.split(',').map((w) => w.trim());
  let i = 0;
  const swap = async () => {
    rotator.classList.add('out');
    await wait(420);
    i = (i + 1) % words.length;
    rotator.textContent = words[i];
    rotator.classList.remove('out');
    rotator.classList.add('in');
    // Two frames so the "in" start state is painted before transitioning to rest.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    rotator.classList.remove('in');
  };
  setInterval(swap, 3000);
}

// ---------- Mission statement: words fill in as it scrolls past ----------

const statement = $('[data-highlight]');
const statementWords = [];
if (statement && !reduceMotion) {
  eachWord(statement, (node) => {
    const s = document.createElement('span');
    s.className = 'hw';
    s.append(node);
    statementWords.push(s);
    return s;
  });
}

// ---------- Marquee: seamless loop that speeds up with scroll velocity ----------

const marquee = $('[data-marquee]');
const mTrack = marquee && $('.marquee-track', marquee);
let mX = 0;
let mBoost = 0;
let mVisible = false;
if (marquee && !reduceMotion) {
  const copy = mTrack.cloneNode(true);
  copy.setAttribute('aria-hidden', 'true');
  marquee.append(copy);
  new IntersectionObserver(([e]) => { mVisible = e.isIntersecting; }).observe(marquee);
  const tracks = [mTrack, copy];
  const tick = () => {
    if (mVisible) {
      const w = mTrack.offsetWidth;
      mX -= 0.6 + mBoost;
      mBoost *= 0.92;
      if (mX <= -w) mX += w;
      if (mX > 0) mX -= w;
      for (const t of tracks) t.style.transform = `translate3d(${mX}px,0,0)`;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// ---------- Scroll-linked effects, all computed in one frame ----------

const expand = $('[data-expand]');
const expandFrame = $('[data-expand-frame]');
const parallax = $$('[data-parallax]');
const cta = $('.cta[data-clip]');

const update = () => {
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const y = window.scrollY;

  const max = document.documentElement.scrollHeight - vh;
  progress.style.transform = `scaleX(${max > 0 ? clamp(y / max) : 0})`;
  topbar.classList.toggle('scrolled', y > 40);
  topbar.classList.toggle('hide', y > lastY + 4 && y > 900);
  if (y < lastY - 4) topbar.classList.remove('hide');
  mBoost = Math.min(14, mBoost + Math.abs(y - lastY) * 0.04);
  lastY = y;

  if (reduceMotion) return;

  // Hero scene: inset and rounded at rest, full-bleed once scrolled into view.
  if (expand) {
    const r = expand.getBoundingClientRect();
    const p = clamp((vh - r.top) / vh);
    const maxInset = Math.min(96, vw * 0.06);
    expandFrame.style.setProperty('--inset', `${((1 - p) * maxInset).toFixed(1)}px`);
    expandFrame.style.setProperty('--round', `${((1 - p) * 32).toFixed(1)}px`);
    expandFrame.style.setProperty('--zoom', (1.18 - p * 0.18).toFixed(3));
  }

  for (const el of parallax) {
    const r = el.parentElement.getBoundingClientRect();
    if (r.bottom < -200 || r.top > vh + 200) continue;
    const offset = (r.top + r.height / 2 - vh / 2) * Number(el.dataset.parallax);
    el.style.translate = `0 ${offset.toFixed(1)}px`;
  }

  if (statementWords.length) {
    const r = statement.getBoundingClientRect();
    const p = clamp((vh * 0.82 - r.top) / (r.height + vh * 0.3));
    const lit = Math.round(p * statementWords.length);
    statementWords.forEach((w, i) => w.classList.toggle('on', i < lit));
  }


  if (cta) {
    const r = cta.getBoundingClientRect();
    const p = clamp((vh - r.top) / (vh * 0.75));
    cta.style.setProperty('--inset', `${((1 - p) * Math.min(80, vw * 0.06)).toFixed(1)}px`);
  }
};

let ticking = false;
const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(() => { ticking = false; update(); }); } };
window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', () => { placePill(); update(); });
update();

// ---------- Magnetic buttons ----------

if (finePointer && !reduceMotion) {
  for (const el of $$('.magnetic')) {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      el.style.translate = `${(dx * 0.22).toFixed(1)}px ${(dy * 0.3).toFixed(1)}px`;
    });
    el.addEventListener('pointerleave', () => { el.style.translate = '0 0'; });
  }
}

mountScenes({ reduceMotion });
playIntro().then(startReveals);

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
