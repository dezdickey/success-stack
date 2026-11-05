/*
 * An independent QR decoder, used only to check the codes tools/qr.js makes.
 *
 * It is written a different way on purpose: it reads the format bits from
 * both copies using the bit positions as the standard lists them, builds its
 * own map of the fixed patterns, walks the zigzag with its own loop, uses log
 * and exp tables instead of bitwise multiplication, and checks every block by
 * computing Reed-Solomon syndromes (all must be zero) rather than redoing the
 * division. Then it decodes the bytes and compares them with the input text.
 */
(function (root) {
  'use strict';

  var EXP = [], LOG = [];
  (function () {
    var x = 1;
    for (var i = 0; i < 255; i++) {
      EXP[i] = x; LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11D;
    }
    for (i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();
  function mul(a, b) { return (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]]; }

  var ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
    [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

  // The standard's mask conditions, written with i = row and j = column.
  function maskHit(mask, i, j) {
    switch (mask) {
      case 0: return (i + j) % 2 === 0;
      case 1: return i % 2 === 0;
      case 2: return j % 3 === 0;
      case 3: return (i + j) % 3 === 0;
      case 4: return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
      case 5: return (i * j) % 2 + (i * j) % 3 === 0;
      case 6: return ((i * j) % 2 + (i * j) % 3) % 2 === 0;
      case 7: return ((i * j) % 3 + (i + j) % 2) % 2 === 0;
    }
  }

  function check(qr, expectedText, tables) {
    var m = qr.modules, n = m.length, problems = [];
    var v = (n - 17) / 4;
    if (v !== Math.floor(v) || v < 1 || v > 10) return ['odd size ' + n];
    function dark(r, c) { return m[r][c] === true; }

    // 1. Finder patterns: a 7x7 ring, a light ring, a 3x3 centre, and a light separator.
    [[0, 0], [0, n - 7], [n - 7, 0]].forEach(function (o) {
      for (var r = -1; r <= 7; r++) {
        for (var c = -1; c <= 7; c++) {
          var rr = o[0] + r, cc = o[1] + c;
          if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
          var ring = Math.max(Math.abs(r - 3), Math.abs(c - 3));
          var want = ring === 3 || ring <= 1; // ring 4 is the separator, ring 2 is light
          if (dark(rr, cc) !== want) { problems.push('finder at ' + o + ' wrong at ' + rr + ',' + cc); return; }
        }
      }
    });

    // 2. Timing patterns.
    for (var t = 8; t < n - 8; t++) {
      if (dark(6, t) !== (t % 2 === 0)) problems.push('row timing at ' + t);
      if (dark(t, 6) !== (t % 2 === 0)) problems.push('column timing at ' + t);
    }

    // 3. Format information, most significant bit first, from both copies.
    var copy1 = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
      [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
    var copy2 = [[n - 1, 8], [n - 2, 8], [n - 3, 8], [n - 4, 8], [n - 5, 8], [n - 6, 8], [n - 7, 8],
      [8, n - 8], [8, n - 7], [8, n - 6], [8, n - 5], [8, n - 4], [8, n - 3], [8, n - 2], [8, n - 1]];
    function readFormat(list) {
      var val = 0;
      list.forEach(function (p) { val = (val << 1) | (dark(p[0], p[1]) ? 1 : 0); });
      return val;
    }
    var f1 = readFormat(copy1), f2 = readFormat(copy2);
    if (f1 !== f2) problems.push('format copies differ');
    if (!dark(n - 8, 8)) problems.push('dark module missing');
    var unmasked = f1 ^ 0x5412;
    var fdata = unmasked >>> 10;
    // Check the BCH(15,5) code by polynomial division.
    var rem = unmasked;
    for (var b = 14; b >= 10; b--) if ((rem >>> b) & 1) rem ^= 0x537 << (b - 10);
    if (rem !== 0) problems.push('format BCH check failed');
    var levelName = { 1: 'L', 0: 'M', 3: 'Q', 2: 'H' }[fdata >>> 3];
    var mask = fdata & 7;
    if (levelName !== qr.level) problems.push('level in format bits ' + levelName + ' vs ' + qr.level);
    if (mask !== qr.mask) problems.push('mask in format bits ' + mask + ' vs ' + qr.mask);

    // 4. Map of the fixed patterns, built separately.
    var fixed = [];
    for (var r0 = 0; r0 < n; r0++) { fixed.push([]); for (var c0 = 0; c0 < n; c0++) fixed[r0].push(false); }
    function mark(r1, r2, c1, c2) { for (var r = r1; r <= r2; r++) for (var c = c1; c <= c2; c++) fixed[r][c] = true; }
    mark(0, 8, 0, 8);           // top-left finder, separator, format bits
    mark(0, 8, n - 8, n - 1);   // top-right
    mark(n - 8, n - 1, 0, 8);   // bottom-left, with the dark module
    mark(6, 6, 0, n - 1);       // timing row
    mark(0, n - 1, 6, 6);       // timing column
    var al = ALIGN[v];
    al.forEach(function (ar) {
      al.forEach(function (ac) {
        var overlapsFinder = (ar <= 8 && ac <= 8) || (ar <= 8 && ac >= n - 9) || (ar >= n - 9 && ac <= 8);
        if (!overlapsFinder) mark(ar - 2, ar + 2, ac - 2, ac + 2);
      });
    });
    if (v >= 7) { mark(0, 5, n - 11, n - 9); mark(n - 11, n - 9, 0, 5); }

    var free = 0;
    for (r0 = 0; r0 < n; r0++) for (c0 = 0; c0 < n; c0++) if (!fixed[r0][c0]) free++;
    if (free !== tables.rawModules(v)) problems.push('free modules ' + free + ' vs ' + tables.rawModules(v));

    // 5. Read the bits back: two-column strips from the right, alternating up and down.
    var bits = [];
    var upward = true;
    for (var col = n - 1; col > 0; col -= 2) {
      if (col === 6) col = 5;
      for (var k = 0; k < n; k++) {
        var row = upward ? n - 1 - k : k;
        for (var s = 0; s < 2; s++) {
          var cc2 = col - s;
          if (fixed[row][cc2]) continue;
          bits.push((dark(row, cc2) !== maskHit(mask, row, cc2)) ? 1 : 0);
        }
      }
      upward = !upward;
    }
    var nCodewords = Math.floor(free / 8);
    var codewords = [];
    for (var w = 0; w < nCodewords; w++) {
      var byte = 0;
      for (var q = 0; q < 8; q++) byte = (byte << 1) | bits[w * 8 + q];
      codewords.push(byte);
    }

    // 6. Undo the interleaving and check each block's syndromes.
    var li = ['L', 'M', 'Q', 'H'].indexOf(levelName);
    if (li < 0) return problems.concat(['unknown level']);
    var nBlocks = tables.BLOCKS[v][li], ecLen = tables.EC_PER_BLOCK[v][li];
    var shortTotal = Math.floor(nCodewords / nBlocks);
    var nLong = nCodewords % nBlocks;
    var dataLens = [];
    for (var bl = 0; bl < nBlocks; bl++) dataLens.push(shortTotal - ecLen + (bl >= nBlocks - nLong ? 1 : 0));
    var blocksData = dataLens.map(function () { return []; });
    var blocksEc = dataLens.map(function () { return []; });
    var pos = 0, maxLen = Math.max.apply(null, dataLens);
    for (var i2 = 0; i2 < maxLen; i2++) {
      for (bl = 0; bl < nBlocks; bl++) if (i2 < dataLens[bl]) blocksData[bl].push(codewords[pos++]);
    }
    for (i2 = 0; i2 < ecLen; i2++) for (bl = 0; bl < nBlocks; bl++) blocksEc[bl].push(codewords[pos++]);
    if (pos !== nCodewords) problems.push('codeword count mismatch');
    for (bl = 0; bl < nBlocks; bl++) {
      var word = blocksData[bl].concat(blocksEc[bl]);
      for (var e = 0; e < ecLen; e++) {
        var syn = 0, alpha = EXP[e];
        for (var z = 0; z < word.length; z++) syn = mul(syn, alpha) ^ word[z]; // Horner's rule
        if (syn !== 0) { problems.push('block ' + bl + ' syndrome ' + e + ' is not zero'); break; }
      }
    }

    // 7. Decode the data: byte mode, count, bytes, terminator, padding.
    var dataBytes = [];
    blocksData.forEach(function (d) { dataBytes = dataBytes.concat(d); });
    var stream = [];
    dataBytes.forEach(function (d) { for (var y = 7; y >= 0; y--) stream.push((d >>> y) & 1); });
    var p2 = 0;
    function take(len) { var val = 0; for (var y = 0; y < len; y++) val = (val << 1) | stream[p2++]; return val; }
    var modeBits = take(4);
    if (modeBits !== 4) problems.push('mode is ' + modeBits + ', not byte mode');
    var count = take(v <= 9 ? 8 : 16);
    var out = [];
    for (var y3 = 0; y3 < count; y3++) out.push(take(8));
    var decoded;
    try { decoded = decodeURIComponent(out.map(function (x) { return '%' + (x < 16 ? '0' : '') + x.toString(16); }).join('')); }
    catch (err) { decoded = null; }
    if (decoded !== expectedText) problems.push('decoded "' + decoded + '" instead of "' + expectedText + '"');
    var term = Math.min(4, stream.length - p2);
    if (take(term) !== 0) problems.push('terminator not zero');
    while (p2 % 8 !== 0) if (stream[p2++] !== 0) problems.push('bit padding not zero');
    var padByte = 0xEC;
    while (p2 < stream.length) {
      var got = take(8);
      if (got !== padByte) { problems.push('pad byte ' + got); break; }
      padByte = padByte === 0xEC ? 0x11 : 0xEC;
    }
    return problems;
  }

  root.QRCheck = { check: check };
})(this);
