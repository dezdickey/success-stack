(function () {
  'use strict';
  var targets = [
    { file: 'qr-site.svg', text: 'https://dezdickey.github.io/success-stack/',
      label: 'QR code for dezdickey.github.io/success-stack' },
    { file: 'qr-linkedin.svg', text: 'https://www.linkedin.com/in/desmond-dickey',
      label: 'QR code for linkedin.com/in/desmond-dickey' },
    { file: 'qr-prompts.svg', text: 'https://dezdickey.github.io/success-stack/prompts.html',
      label: 'QR code for dezdickey.github.io/success-stack/prompts.html' }
  ];
  var out = [], failures = 0;
  function line(s) { out.push(s); }

  // Reed-Solomon against the published HELLO WORLD 1-M example.
  var ec = QR._test.rsRemainder([32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17],
    QR._test.rsDivisor(10));
  var rsOk = ec.join(',') === '196,35,39,119,235,215,231,226,93,23';
  if (!rsOk) failures++;
  line('RS-VECTOR ' + (rsOk ? 'OK' : 'FAIL ' + ec.join(',')));

  // Round trips across every version and level this encoder supports.
  var alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789-./:?=&_~ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  var seed = 12345;
  function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
  var tried = 0, seen = {};
  ['L', 'M', 'Q', 'H'].forEach(function (level) {
    for (var len = 1; len <= 150; len += 1) {
      var s = '';
      for (var i = 0; i < len; i++) s += alphabet.charAt(Math.floor(rnd() * alphabet.length));
      var qr;
      try { qr = QR.encode(s, level); } catch (e) { break; }
      var problems = QRCheck.check(qr, s, QR._test);
      tried++;
      seen['v' + qr.version + '-' + qr.level] = true;
      if (problems.length) { failures++; line('ROUNDTRIP FAIL ' + level + ' len ' + len + ': ' + problems.join('; ')); }
    }
  });
  line('ROUNDTRIPS ' + tried + ' codes, ' + Object.keys(seen).length + ' version/level pairs: ' +
    Object.keys(seen).sort().join(' '));

  targets.forEach(function (t) {
    var qr = QR.encode(t.text, 'M');
    var problems = QRCheck.check(qr, t.text, QR._test);
    if (problems.length) failures++;
    line('QR ' + t.file + ' version ' + qr.version + '-' + qr.level + ' mask ' + qr.mask + ' ' +
      (problems.length ? 'FAIL ' + problems.join('; ') : 'OK'));
    line('SVG ' + t.file + ' ' + QR.toSvg(qr, { label: t.label }));
  });
  line(failures ? 'RESULT FAIL (' + failures + ')' : 'RESULT ALL OK');
  document.getElementById('out').textContent = out.join('\n');
})();
