/*
 * Success Stack: the prompt fill-in, copy buttons, the print button, and a
 * thin presenting layer for showing the guide in a class.
 * Nothing is stored and nothing is sent anywhere.
 */
(function () {
  'use strict';

  var doc = document.documentElement;
  doc.classList.remove('no-js');
  doc.classList.add('js');

  var live = document.getElementById('live');
  function announce(message) {
    if (!live) return;
    live.textContent = '';
    setTimeout(function () { live.textContent = message; }, 40);
  }

  /* ---------- Fill the prompts in from the form ---------- */

  var form = document.getElementById('fill');
  var EMPTY = { major: '[your major]', year: 'freshman', hours: '[hours]', school: '' };

  function fieldValue(name) {
    if (!form || !form.elements[name]) return '';
    var value = String(form.elements[name].value || '').replace(/\s+/g, ' ').trim();
    if (name === 'hours' && value) {
      var hours = parseInt(value, 10);
      value = hours > 0 && hours <= 80 ? String(hours) : '';
    }
    return value;
  }

  function updateFills() {
    ['major', 'year', 'hours', 'school'].forEach(function (name) {
      var value = fieldValue(name);
      var spans = document.querySelectorAll('.ph[data-field="' + name + '"]');
      for (var i = 0; i < spans.length; i++) {
        var el = spans[i];
        var empty = el.hasAttribute('data-empty') ? el.getAttribute('data-empty') : EMPTY[name];
        el.textContent = value || empty;
        el.classList.toggle('filled', value !== '');
      }
      var optional = document.querySelectorAll('.opt[data-field="' + name + '"]');
      for (var j = 0; j < optional.length; j++) optional[j].hidden = value === '';
    });
  }

  if (form) {
    form.addEventListener('input', updateFills);
    form.addEventListener('change', updateFills);
    form.addEventListener('submit', function (e) { e.preventDefault(); });
    updateFills();
  }

  /* ---------- Copy buttons ---------- */

  function promptText(el) {
    var clone = el.cloneNode(true);
    var hidden = clone.querySelectorAll('[hidden]');
    for (var i = 0; i < hidden.length; i++) hidden[i].parentNode.removeChild(hidden[i]);
    return clone.textContent.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function legacyCopy(text) {
    return new Promise(function (resolve, reject) {
      var area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.className = 'copy-buffer';
      document.body.appendChild(area);
      area.select();
      area.setSelectionRange(0, text.length);
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      document.body.removeChild(area);
      if (ok) resolve(); else reject(new Error('copy failed'));
    });
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(function () { return legacyCopy(text); });
    }
    return legacyCopy(text);
  }

  function selectContents(el) {
    var range = document.createRange();
    range.selectNodeContents(el);
    var selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  document.addEventListener('click', function (e) {
    var button = e.target && e.target.closest ? e.target.closest('.copy-btn') : null;
    if (!button) return;
    var target = document.getElementById(button.getAttribute('data-copy'));
    if (!target) return;
    var label = button.getAttribute('data-label') || button.textContent;
    button.setAttribute('data-label', label);
    copyText(promptText(target)).then(function () {
      button.textContent = 'Copied ✓';
      button.classList.add('copied');
      announce('Copied. Paste it into your AI.');
    }, function () {
      selectContents(target);
      button.textContent = 'Selected: copy it';
      announce('Copying was blocked, so the prompt is selected. Copy it with your device.');
    });
    clearTimeout(button.resetTimer);
    button.resetTimer = setTimeout(function () {
      button.textContent = label;
      button.classList.remove('copied');
    }, 2600);
  });

  /* ---------- Print ---------- */

  var printButton = document.getElementById('print-btn');
  if (printButton) printButton.addEventListener('click', function () { window.print(); });

  /* ---------- Presenting ----------
     The class is one path through the site, in this order. Each entry is a
     page (its body's data-page) and the id of a section on it. The path never
     decides how the site is organized; it only picks sections to show. */

  var TALK = [
    ['index', 'top'], ['index', 'why'], ['index', 'odds'],
    ['index', 'stack'], ['index', 'blocks'], ['index', 'windows'],
    ['index', 'built-by'],
    ['roadmap', 'years'], ['roadmap', 'calendar'], ['roadmap', 'where'],
    ['prompts', 'phone'], ['prompts', 'rules'], ['prompts', 'make-yours'],
    ['prompts', 'prompt-1'], ['prompts', 'prompt-2'], ['prompts', 'prompt-3'], ['prompts', 'prompt-4'],
    ['linkedin', 'setup'], ['linkedin', 'connect'], ['linkedin', 'me'],
    ['index', 'start'], ['index', 'keep']
  ];

  var page = document.body.getAttribute('data-page');
  var steps = [];
  TALK.forEach(function (entry, n) {
    if (entry[0] !== page) return;
    var el = document.getElementById(entry[1]);
    if (el) steps.push({ n: n, el: el });
  });
  if (!steps.length) return;

  var presentButton = document.getElementById('present-btn');
  var count = document.getElementById('deck-count');
  var exitButton = document.getElementById('deck-exit');
  var hint = document.getElementById('deck-hint');
  var black = document.getElementById('blackout');
  var head = document.querySelector('.site-head');
  var current = 0; // index into steps
  var settling = false;
  var hintTimer = null, scrollTimer = null, resizeTimer = null;

  function presenting() { return doc.classList.contains('present'); }
  function topOf(el) { return el.getBoundingClientRect().top + window.pageYOffset; }

  function jumpTo(y) {
    var before = doc.style.scrollBehavior;
    doc.style.scrollBehavior = 'auto';
    window.scrollTo(0, Math.max(0, Math.round(y)));
    doc.style.scrollBehavior = before;
  }

  // Sections that aren't on the path are hidden while presenting.
  function markPath() {
    var onPath = steps.map(function (s) { return s.el; });
    var sections = document.querySelectorAll('main > section');
    for (var i = 0; i < sections.length; i++) {
      sections[i].classList.toggle('off-path', onPath.indexOf(sections[i]) < 0);
    }
  }

  // The last step whose top is at or above the given line (-1 if none).
  function stepAbove(line) {
    var found = -1;
    for (var i = 0; i < steps.length; i++) {
      if (topOf(steps[i].el) <= line) found = i; else break;
    }
    return found;
  }

  function showCount() {
    if (count) count.textContent = (steps[current].n + 1) + ' / ' + TALK.length;
  }

  function show(i) {
    var before = current;
    current = Math.max(0, Math.min(steps.length - 1, i));
    jumpTo(topOf(steps[current].el));
    showCount();
    if (before !== current) replayIn(steps[current].el);
  }

  // Coming back to a section with an animation (like the hero) plays it again.
  function replayIn(el) {
    var art = el.querySelector('.hero-art');
    if (!art || !art.getAnimations) return;
    art.getAnimations({ subtree: true }).forEach(function (a) { a.cancel(); a.play(); });
  }

  // Go to a step anywhere on the path, opening its page if it's elsewhere.
  function goTo(n) {
    if (n < 0 || n >= TALK.length) return;
    var entry = TALK[n];
    if (entry[0] === page) {
      for (var i = 0; i < steps.length; i++) if (steps[i].n === n) { show(i); return; }
      return;
    }
    window.location.href = entry[0] + '.html?present#' + entry[1];
  }

  function setBlack(on) { if (black) black.hidden = !on; }

  function next() {
    setBlack(false);
    var i = stepAbove(window.pageYOffset + 4);
    if (i < 0) { show(0); return; }
    var el = steps[i].el;
    var bottom = topOf(el) + el.offsetHeight;
    var viewBottom = window.pageYOffset + window.innerHeight;
    if (bottom > viewBottom + 4) {
      // Taller than the screen: show the rest of it before moving on.
      jumpTo(window.pageYOffset + Math.min(window.innerHeight * 0.85, bottom - viewBottom));
      current = i;
      showCount();
    } else {
      goTo(steps[i].n + 1);
    }
  }

  function prev() {
    setBlack(false);
    var i = stepAbove(window.pageYOffset + 4);
    if (i < 0) { goTo(steps[0].n - 1); return; }
    var top = topOf(steps[i].el);
    if (top < window.pageYOffset - 4) {
      jumpTo(Math.max(top, window.pageYOffset - window.innerHeight * 0.85));
      current = i;
      showCount();
    } else {
      goTo(steps[i].n - 1);
    }
  }

  function showHint() {
    if (!hint) return;
    hint.hidden = false;
    clearTimeout(hintTimer);
    hintTimer = setTimeout(function () { hint.hidden = true; }, 4500);
  }

  function enter(i) {
    markPath();
    doc.classList.add('present');
    if (presentButton) presentButton.setAttribute('aria-pressed', 'true');
    show(i);
  }

  function start() {
    if (presenting()) return;
    var i = stepAbove(window.pageYOffset + window.innerHeight * 0.35);
    enter(i < 0 ? 0 : i);
    showHint();
  }

  function stop() {
    if (!presenting()) return;
    var i = stepAbove(window.pageYOffset + 4);
    doc.classList.remove('present');
    if (presentButton) presentButton.setAttribute('aria-pressed', 'false');
    setBlack(false);
    if (hint) hint.hidden = true;
    if (/[?&]present/.test(window.location.search)) {
      try { history.replaceState(null, '', window.location.pathname + window.location.hash); } catch (err) { /* file:// may refuse */ }
    }
    var offset = head && getComputedStyle(head).position === 'sticky' ? head.offsetHeight : 0;
    jumpTo(topOf(steps[i < 0 ? 0 : i].el) - offset);
  }

  if (presentButton) presentButton.addEventListener('click', start);
  if (exitButton) exitButton.addEventListener('click', stop);
  if (black) black.addEventListener('click', function () { setBlack(false); });

  window.addEventListener('resize', function () {
    if (!presenting()) return;
    settling = true;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { show(current); settling = false; }, 150);
  });

  // A link to another section of the same page while presenting.
  window.addEventListener('hashchange', function () {
    if (!presenting()) return;
    var wanted = window.location.hash.slice(1);
    for (var k = 0; k < steps.length; k++) if (steps[k].el.id === wanted) { show(k); return; }
  });

  window.addEventListener('scroll', function () {
    if (!presenting() || settling) return;
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(function () {
      var i = stepAbove(window.pageYOffset + 4);
      current = i < 0 ? 0 : i;
      showCount();
    }, 120);
  }, { passive: true });

  document.addEventListener('keydown', function (e) {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    var target = e.target, tag = target && target.tagName;
    var typing = !!target && (target.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT');
    var key = e.key;

    if (!presenting()) {
      if (typing) return;
      if (key === 'F5' || key === 'p' || key === 'P') { e.preventDefault(); start(); }
      return;
    }

    if (typing) {
      // A clicker still moves on while a form field has focus.
      if (key === 'PageDown' || key === 'PageUp') {
        e.preventDefault();
        target.blur();
        if (key === 'PageDown') next(); else prev();
      } else if (key === 'Escape') {
        target.blur();
      }
      return;
    }

    var onControl = tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY';
    switch (key) {
      case 'ArrowRight': case 'ArrowDown': case 'PageDown': case 'Right': case 'Down':
        e.preventDefault(); next(); break;
      case 'ArrowLeft': case 'ArrowUp': case 'PageUp': case 'Left': case 'Up':
        e.preventDefault(); prev(); break;
      case ' ': case 'Spacebar':
        if (onControl) return;
        e.preventDefault();
        if (e.shiftKey) prev(); else next();
        break;
      case 'Home': e.preventDefault(); setBlack(false); goTo(0); break;
      case 'End': e.preventDefault(); setBlack(false); goTo(TALK.length - 1); break;
      case 'b': case 'B': case '.':
        e.preventDefault();
        if (black) black.hidden = !black.hidden;
        break;
      case 'Escape':
        if (black && !black.hidden) setBlack(false); else stop();
        break;
      case 'F5': e.preventDefault(); break;
      case 'p': case 'P': e.preventDefault(); stop(); break;
    }
  });

  // page.html?present#id arrives from the previous page of the talk.
  if (/[?&]present(=|&|$)/.test(window.location.search)) {
    var wanted = window.location.hash.slice(1), first = 0;
    for (var s = 0; s < steps.length; s++) if (steps[s].el.id === wanted) first = s;
    enter(first);
    setTimeout(function () { show(first); }, 0);
  }
})();
