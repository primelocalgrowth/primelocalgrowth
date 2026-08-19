/**
 * Scorecard quiz engine.
 *
 * Drives both /ai-visibility-scorecard and /gbp-scorecard. The markup and CSS
 * for these tools shipped without any behaviour: answer buttons had no
 * handlers, so both pages were dead on arrival and could not produce a lead.
 *
 * Contract with the markup:
 *   #questions           wrapper
 *   .question-block[data-q]        one per question, optional data-weight
 *                                  data-gap  = what is wrong when answered "no"
 *                                  data-win  = what is right when answered "yes"
 *   .answer-btn[data-value=yes|no] answers within a block
 *   .next-btn                      advances (revealed once answered)
 *   #progress-bar, #results, #score-num, #score-arc, #score-label,
 *   #score-summary, #gap-list
 */
(function () {
  'use strict';

  var root = document.getElementById('questions');
  if (!root) return;

  var blocks = Array.prototype.slice.call(root.querySelectorAll('.question-block'));
  if (!blocks.length) return;

  var results = document.getElementById('results');
  var progress = document.getElementById('progress-bar');
  var scoreNum = document.getElementById('score-num');
  var scoreArc = document.getElementById('score-arc');
  var scoreLabel = document.getElementById('score-label');
  var scoreSummary = document.getElementById('score-summary');
  var gapList = document.getElementById('gap-list');

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var ARC = 326.73; // matches stroke-dasharray in the markup
  var answers = {};
  var current = 0;

  function weightOf(block) {
    var w = parseFloat(block.getAttribute('data-weight'));
    return isNaN(w) ? 1 : w;
  }

  function show(index) {
    blocks.forEach(function (b, i) { b.classList.toggle('active', i === index); });
    current = index;
    setProgress(index / blocks.length);
    var active = blocks[index];
    if (active) {
      var focusTarget = active.querySelector('.answer-btn');
      if (focusTarget) focusTarget.focus({ preventScroll: true });
    }
  }

  function setProgress(fraction) {
    if (progress) progress.style.width = Math.round(fraction * 100) + '%';
  }

  blocks.forEach(function (block, index) {
    var q = block.getAttribute('data-q') || String(index);
    var next = block.querySelector('.next-btn');

    block.querySelectorAll('.answer-btn').forEach(function (btn) {
      btn.setAttribute('type', 'button');
      btn.setAttribute('aria-pressed', 'false');

      btn.addEventListener('click', function () {
        block.querySelectorAll('.answer-btn').forEach(function (sibling) {
          sibling.classList.remove('selected');
          sibling.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('selected');
        btn.setAttribute('aria-pressed', 'true');
        answers[q] = btn.getAttribute('data-value') === 'yes';
        if (next) next.classList.add('show');
      });
    });

    if (next) {
      next.setAttribute('type', 'button');
      next.addEventListener('click', function () {
        if (!(q in answers)) return;
        if (index + 1 < blocks.length) show(index + 1);
        else finish();
      });
    }
  });

  function computeScore() {
    var earned = 0;
    var total = 0;
    blocks.forEach(function (block, index) {
      var q = block.getAttribute('data-q') || String(index);
      var w = weightOf(block);
      total += w;
      if (answers[q]) earned += w;
    });
    return total ? Math.round((earned / total) * 100) : 0;
  }

  function band(score) {
    if (score >= 90) return { label: 'Strong', summary: 'You are in good shape. The work now is holding the position while competitors catch up.' };
    if (score >= 70) return { label: 'Visible', summary: 'You are showing up, but there are gaps a competitor can exploit. Closing them is straightforward.' };
    if (score >= 40) return { label: 'Partially visible', summary: 'You are findable some of the time. The gaps below are the ones costing you calls right now.' };
    return { label: 'Invisible', summary: 'Customers searching for what you do are being shown someone else. Every gap below is fixable.' };
  }

  function renderGaps() {
    if (!gapList) return;
    gapList.innerHTML = '';
    // Failed items first: the gaps are the point of the tool.
    var ordered = blocks.slice().sort(function (a, b) {
      var qa = a.getAttribute('data-q'), qb = b.getAttribute('data-q');
      var fa = answers[qa] ? 1 : 0, fb = answers[qb] ? 1 : 0;
      if (fa !== fb) return fa - fb;
      return weightOf(b) - weightOf(a);
    });

    ordered.forEach(function (block) {
      var q = block.getAttribute('data-q');
      var passed = !!answers[q];
      var text = passed
        ? (block.getAttribute('data-win') || 'This one is already working.')
        : (block.getAttribute('data-gap') || 'This needs attention.');

      var item = document.createElement('div');
      item.className = 'gap-item';

      var icon = document.createElement('span');
      icon.className = 'gap-icon ' + (passed ? 'good' : 'bad');
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = passed ? '✓' : '!';

      var label = document.createElement('span');
      label.className = 'gap-text';
      label.textContent = text;

      item.appendChild(icon);
      item.appendChild(label);
      gapList.appendChild(item);
    });
  }

  function animateScore(target) {
    if (scoreArc) scoreArc.style.transition = reduce ? 'none' : 'stroke-dashoffset 900ms cubic-bezier(.22,1,.36,1)';
    var setArc = function (value) {
      if (scoreArc) scoreArc.style.strokeDashoffset = String(ARC - (ARC * value) / 100);
    };
    if (reduce) {
      if (scoreNum) scoreNum.textContent = String(target);
      setArc(target);
      return;
    }
    setArc(target);
    var start = null;
    var duration = 900;
    var settled = false;
    function tick(ts) {
      if (settled) return;
      if (start === null) start = ts;
      var p = Math.min((ts - start) / duration, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      if (scoreNum) scoreNum.textContent = String(Math.round(target * eased));
      if (p < 1) requestAnimationFrame(tick);
      else settled = true;
    }
    requestAnimationFrame(tick);
    // requestAnimationFrame does not run in a hidden or non-compositing tab, so
    // without this the ring would show the score while the number stayed at 0.
    setTimeout(function () {
      settled = true;
      if (scoreNum) scoreNum.textContent = String(target);
    }, duration + 100);
  }

  /** Carries the result into the lead record so Adam sees it with the email. */
  function attachResultToLeadForm(score, info) {
    var form = document.querySelector('form[data-lead-form]');
    if (!form) return;
    var failed = blocks
      .filter(function (b) { return !answers[b.getAttribute('data-q')]; })
      .map(function (b) { return b.getAttribute('data-gap'); })
      .filter(Boolean);

    var field = form.querySelector('input[name="situation"]');
    if (!field) {
      field = document.createElement('input');
      field.type = 'hidden';
      field.name = 'situation';
      form.appendChild(field);
    }
    field.value = 'Score ' + score + '/100 (' + info.label + '). ' +
      (failed.length ? 'Gaps: ' + failed.join(' | ') : 'No gaps reported.');
  }

  function finish() {
    var score = computeScore();
    var info = band(score);

    blocks.forEach(function (b) { b.classList.remove('active'); });
    setProgress(1);

    if (results) results.classList.add('show');
    if (scoreLabel) scoreLabel.textContent = info.label;
    if (scoreSummary) scoreSummary.textContent = info.summary;

    renderGaps();
    animateScore(score);
    attachResultToLeadForm(score, info);

    if (results && results.scrollIntoView) {
      results.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }
    document.dispatchEvent(new CustomEvent('scorecard:complete', { detail: { score: score, band: info.label } }));
  }

  /**
   * Optional second step: an objective scan of the visitor's website.
   *
   * The quiz above is self-reported. This measures the site for real and
   * returns a shareable /s/<id> link, which is what turns a run into something
   * that can be passed around instead of a number that disappears on refresh.
   */
  function initScan() {
    var form = document.getElementById('scan-form');
    var output = document.getElementById('scan-result');
    if (!form || !output) return;

    var submit = document.getElementById('scan-submit');
    var urlInput = document.getElementById('scan-url');
    var bizInput = document.getElementById('scan-biz');
    var consent = document.getElementById('scan-consent');

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var url = (urlInput.value || '').trim();
      output.className = 'scan-result';
      if (!url) {
        output.classList.add('err');
        output.textContent = 'Add your website address first.';
        return;
      }

      submit.disabled = true;
      var original = submit.textContent;
      submit.textContent = 'Checking…';
      output.textContent = 'Reading your site the way an AI engine would. This takes a few seconds.';

      fetch('/api/scorecard-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url,
          businessName: (bizInput && bizInput.value || '').trim(),
          publicConsent: !!(consent && consent.checked)
        })
      })
        .then(function (r) { return r.json().then(function (b) { return { status: r.status, body: b }; }); })
        .then(function (res) {
          submit.disabled = false;
          submit.textContent = original;
          var body = res.body || {};

          if (res.status === 503) {
            output.classList.add('err');
            output.textContent = 'Shareable reports are not switched on yet. Your score above still stands.';
            return;
          }
          if (!body.ok) {
            output.classList.add('err');
            output.textContent = body.reason || body.error || 'We could not read that site. Check the address and try again.';
            return;
          }
          renderScanResult(output, body);
        })
        .catch(function () {
          submit.disabled = false;
          submit.textContent = original;
          output.classList.add('err');
          output.textContent = 'Something went wrong reaching the scanner. Please try again.';
        });
    });
  }

  function renderScanResult(output, body) {
    var link = window.location.origin + body.shareUrl;
    output.textContent = '';

    var score = document.createElement('div');
    score.className = 'scan-score';
    score.textContent = 'Measured score: ' + body.score + '/100 — ' + body.band;

    var note = document.createElement('p');
    note.textContent = 'Your report is ready. Anyone with this link can read it.';

    var row = document.createElement('div');
    row.className = 'scan-link-row';

    var field = document.createElement('input');
    field.type = 'text';
    field.readOnly = true;
    field.value = link;
    field.setAttribute('aria-label', 'Your report link');

    var copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'scan-copy';
    copy.textContent = 'Copy link';
    copy.addEventListener('click', function () {
      var done = function () { copy.textContent = 'Copied'; setTimeout(function () { copy.textContent = 'Copy link'; }, 2000); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(link).then(done, function () { field.select(); });
      } else {
        field.select();
        done();
      }
    });

    var open = document.createElement('a');
    open.className = 'scan-copy';
    open.href = body.shareUrl;
    open.textContent = 'Open report';

    row.appendChild(field);
    row.appendChild(copy);
    row.appendChild(open);
    output.appendChild(score);
    output.appendChild(note);
    output.appendChild(row);

    document.dispatchEvent(new CustomEvent('scorecard:scanned', { detail: { score: body.score, id: body.id } }));
  }

  initScan();
  show(0);
})();
