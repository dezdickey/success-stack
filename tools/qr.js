/*
 * QR code encoder for the Success Stack site.
 *
 * Written for this site so that no QR service, CDN or library is needed:
 * the codes are made on this computer and saved as SVG files in img/.
 * Byte mode, versions 1-10, error correction L/M/Q/H (ISO/IEC 18004).
 * The structure follows Project Nayuki's QR Code generator (MIT licence),
 * which was used as the reference for the algorithm.
 *
 * tools/make-qr.html runs this, checks every code with the separate
 * decoder in tools/qr-check.js, and prints the SVG to save.
 */
(function (root) {
  'use strict';

  var LEVEL_NAMES = ['L', 'M', 'Q', 'H'];
  var LEVEL_FORMAT_BITS = [1, 0, 3, 2];
  var MAX_VERSION = 10;

  // Error correction codewords per block, and number of blocks, [L, M, Q, H].
  var EC_PER_BLOCK = [null,
    [7, 10, 13, 17], [10, 16, 22, 28], [15, 26, 18, 22], [20, 18, 26, 16], [26, 24, 18, 22],
    [18, 16, 24, 28], [20, 18, 18, 26], [24, 22, 22, 26], [30, 22, 20, 24], [18, 26, 24, 28]];
  var BLOCKS = [null,
    [1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 2, 2], [1, 2, 2, 4], [1, 2, 4, 4],
    [2, 4, 4, 4], [2, 4, 6, 5], [2, 4, 6, 6], [2, 5, 8, 8], [4, 5, 8, 8]];
  var ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
    [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

  function sizeOf(version) { return 17 + 4 * version; }

  // Modules left for data and error correction once the fixed patterns are drawn.
  function rawModules(version) {
    var n = (16 * version + 128) * version + 64;
    if (version >= 2) {
      var a = Math.floor(version / 7) + 2;
      n -= (25 * a - 10) * a - 55;
      if (version >= 7) n -= 36;
    }
    return n;
  }

  function dataCodewords(version, level) {
    return Math.floor(rawModules(version) / 8) -
      EC_PER_BLOCK[version][level] * BLOCKS[version][level];
  }

  // Multiplication in GF(256) with the QR polynomial x^8 + x^4 + x^3 + x^2 + 1.
  function gfMul(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }

  // Reed-Solomon generator polynomial (highest power first, leading 1 left out).
  function rsDivisor(degree) {
    var r = [];
    for (var i = 0; i < degree - 1; i++) r.push(0);
    r.push(1);
    var rootValue = 1;
    for (i = 0; i < degree; i++) {
      for (var j = 0; j < r.length; j++) {
        r[j] = gfMul(r[j], rootValue);
        if (j + 1 < r.length) r[j] ^= r[j + 1];
      }
      rootValue = gfMul(rootValue, 0x02);
    }
    return r;
  }

  function rsRemainder(data, divisor) {
    var r = divisor.map(function () { return 0; });
    data.forEach(function (b) {
      var factor = b ^ r.shift();
      r.push(0);
      for (var i = 0; i < divisor.length; i++) r[i] ^= gfMul(divisor[i], factor);
    });
    return r;
  }

  function toUtf8(text) {
    if (typeof TextEncoder !== 'undefined') return Array.prototype.slice.call(new TextEncoder().encode(text));
    var s = unescape(encodeURIComponent(text)), out = [];
    for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
    return out;
  }

  // Split the data into blocks, add error correction to each, and interleave.
  function addErrorCorrection(data, version, level) {
    var nBlocks = BLOCKS[version][level];
    var ecLen = EC_PER_BLOCK[version][level];
    var raw = Math.floor(rawModules(version) / 8);
    var nShort = nBlocks - raw % nBlocks;
    var shortLen = Math.floor(raw / nBlocks);
    var divisor = rsDivisor(ecLen);
    var blocks = [];
    for (var i = 0, k = 0; i < nBlocks; i++) {
      var len = shortLen - ecLen + (i < nShort ? 0 : 1);
      var dat = data.slice(k, k + len);
      k += len;
      var ec = rsRemainder(dat, divisor);
      if (i < nShort) dat.push(0);
      blocks.push(dat.concat(ec));
    }
    var out = [];
    for (i = 0; i < blocks[0].length; i++) {
      for (var j = 0; j < nBlocks; j++) {
        if (i !== shortLen - ecLen || j >= nShort) out.push(blocks[j][i]);
      }
    }
    return out;
  }

  function maskHit(mask, x, y) {
    switch (mask) {
      case 0: return (x + y) % 2 === 0;
      case 1: return y % 2 === 0;
      case 2: return x % 3 === 0;
      case 3: return (x + y) % 3 === 0;
      case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
      case 5: return x * y % 2 + x * y % 3 === 0;
      case 6: return (x * y % 2 + x * y % 3) % 2 === 0;
      case 7: return ((x + y) % 2 + x * y % 3) % 2 === 0;
    }
    throw new Error('bad mask');
  }

  function buildMatrix(version, level, codewords) {
    var n = sizeOf(version);
    var mod = [], fn = [];
    for (var r = 0; r < n; r++) {
      mod.push([]); fn.push([]);
      for (var c = 0; c < n; c++) { mod[r].push(false); fn[r].push(false); }
    }
    function set(x, y, dark) { mod[y][x] = dark; fn[y][x] = true; }

    // Timing patterns.
    for (var i = 0; i < n; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }

    // Finder patterns with their separators.
    [[3, 3], [n - 4, 3], [3, n - 4]].forEach(function (centre) {
      for (var dy = -4; dy <= 4; dy++) {
        for (var dx = -4; dx <= 4; dx++) {
          var x = centre[0] + dx, y = centre[1] + dy;
          if (x < 0 || y < 0 || x >= n || y >= n) continue;
          var d = Math.max(Math.abs(dx), Math.abs(dy));
          set(x, y, d !== 2 && d !== 4);
        }
      }
    });

    // Alignment patterns, skipping the three finder corners.
    var al = ALIGN[version], na = al.length;
    for (var a = 0; a < na; a++) {
      for (var b = 0; b < na; b++) {
        if ((a === 0 && b === 0) || (a === 0 && b === na - 1) || (a === na - 1 && b === 0)) continue;
        for (var dy2 = -2; dy2 <= 2; dy2++) {
          for (var dx2 = -2; dx2 <= 2; dx2++) {
            set(al[a] + dx2, al[b] + dy2, Math.max(Math.abs(dx2), Math.abs(dy2)) !== 1);
          }
        }
      }
    }

    function drawFormat(mask) {
      var data = LEVEL_FORMAT_BITS[level] << 3 | mask;
      var rem = data;
      for (var k = 0; k < 10; k++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      var bits = (data << 10 | rem) ^ 0x5412;
      function bit(k2) { return ((bits >>> k2) & 1) !== 0; }
      for (k = 0; k <= 5; k++) set(8, k, bit(k));
      set(8, 7, bit(6));
      set(8, 8, bit(7));
      set(7, 8, bit(8));
      for (k = 9; k < 15; k++) set(14 - k, 8, bit(k));
      for (k = 0; k < 8; k++) set(n - 1 - k, 8, bit(k));
      for (k = 8; k < 15; k++) set(8, n - 15 + k, bit(k));
      set(8, n - 8, true);
    }
    drawFormat(0); // reserve the format areas

    if (version >= 7) {
      var vrem = version;
      for (i = 0; i < 12; i++) vrem = (vrem << 1) ^ ((vrem >>> 11) * 0x1F25);
      var vbits = version << 12 | vrem;
      for (i = 0; i < 18; i++) {
        var on = ((vbits >>> i) & 1) !== 0;
        var p = n - 11 + i % 3, q = Math.floor(i / 3);
        set(p, q, on);
        set(q, p, on);
      }
    }

    // Data and error correction bits, in the zigzag order.
    var bitIndex = 0, total = codewords.length * 8;
    for (var right = n - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < n; vert++) {
        for (var j = 0; j < 2; j++) {
          var x = right - j;
          var upward = ((right + 1) & 2) === 0;
          var y = upward ? n - 1 - vert : vert;
          if (!fn[y][x] && bitIndex < total) {
            mod[y][x] = ((codewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1) !== 0;
            bitIndex++;
          }
        }
      }
    }

    function applyMask(mask) {
      for (var yy = 0; yy < n; yy++) {
        for (var xx = 0; xx < n; xx++) {
          if (!fn[yy][xx] && maskHit(mask, xx, yy)) mod[yy][xx] = !mod[yy][xx];
        }
      }
    }

    function penalty() {
      var score = 0, x2, y2, run, colour;
      for (y2 = 0; y2 < n; y2++) { // runs of five or more in a row
        run = 0; colour = null;
        for (x2 = 0; x2 < n; x2++) {
          if (mod[y2][x2] === colour) { run++; if (run === 5) score += 3; else if (run > 5) score++; }
          else { colour = mod[y2][x2]; run = 1; }
        }
      }
      for (x2 = 0; x2 < n; x2++) { // and in a column
        run = 0; colour = null;
        for (y2 = 0; y2 < n; y2++) {
          if (mod[y2][x2] === colour) { run++; if (run === 5) score += 3; else if (run > 5) score++; }
          else { colour = mod[y2][x2]; run = 1; }
        }
      }
      for (y2 = 0; y2 < n - 1; y2++) { // 2x2 blocks of one colour
        for (x2 = 0; x2 < n - 1; x2++) {
          var cc = mod[y2][x2];
          if (cc === mod[y2][x2 + 1] && cc === mod[y2 + 1][x2] && cc === mod[y2 + 1][x2 + 1]) score += 3;
        }
      }
      var pat = [true, false, true, true, true, false, true, false, false, false, false];
      var rev = pat.slice().reverse();
      function matches(get, start, pattern) {
        for (var t = 0; t < 11; t++) if (get(start + t) !== pattern[t]) return false;
        return true;
      }
      for (y2 = 0; y2 < n; y2++) { // finder-like patterns
        var rowGet = function (yy) { return function (xx) { return mod[yy][xx]; }; }(y2);
        for (x2 = 0; x2 + 11 <= n; x2++) {
          if (matches(rowGet, x2, pat)) score += 40;
          if (matches(rowGet, x2, rev)) score += 40;
        }
      }
      for (x2 = 0; x2 < n; x2++) {
        var colGet = function (xx) { return function (yy) { return mod[yy][xx]; }; }(x2);
        for (y2 = 0; y2 + 11 <= n; y2++) {
          if (matches(colGet, y2, pat)) score += 40;
          if (matches(colGet, y2, rev)) score += 40;
        }
      }
      var dark = 0;
      for (y2 = 0; y2 < n; y2++) for (x2 = 0; x2 < n; x2++) if (mod[y2][x2]) dark++;
      score += Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n)) * 10;
      return score;
    }

    var best = 0, bestScore = Infinity;
    for (var m = 0; m < 8; m++) {
      applyMask(m);
      drawFormat(m);
      var s = penalty();
      if (s < bestScore) { best = m; bestScore = s; }
      applyMask(m); // XOR again to undo
    }
    applyMask(best);
    drawFormat(best);
    return { modules: mod, mask: best };
  }

  function encode(text, minLevel) {
    var bytes = toUtf8(text);
    var level = LEVEL_NAMES.indexOf(minLevel || 'M');
    if (level < 0) throw new Error('level must be L, M, Q or H');
    function bitsNeeded(v) { return 4 + (v <= 9 ? 8 : 16) + 8 * bytes.length; }
    var version;
    for (version = 1; version <= MAX_VERSION; version++) {
      if (bitsNeeded(version) <= dataCodewords(version, level) * 8) break;
    }
    if (version > MAX_VERSION) throw new Error('text too long for this encoder');
    for (var k = level + 1; k < 4; k++) { // stronger correction if the size stays the same
      if (bitsNeeded(version) <= dataCodewords(version, k) * 8) level = k;
    }

    var capacity = dataCodewords(version, level) * 8;
    var bits = [];
    function put(value, len) { for (var i = len - 1; i >= 0; i--) bits.push((value >>> i) & 1); }
    put(0x4, 4); // byte mode
    put(bytes.length, version <= 9 ? 8 : 16);
    bytes.forEach(function (b) { put(b, 8); });
    put(0, Math.min(4, capacity - bits.length));
    put(0, (8 - bits.length % 8) % 8);
    for (var pad = 0xEC; bits.length < capacity; pad ^= 0xEC ^ 0x11) put(pad, 8);

    var data = [];
    for (var i = 0; i < bits.length; i += 8) {
      var byte = 0;
      for (var j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
      data.push(byte);
    }
    var codewords = addErrorCorrection(data, version, level);
    var built = buildMatrix(version, level, codewords);
    return {
      text: text,
      version: version,
      level: LEVEL_NAMES[level],
      mask: built.mask,
      size: sizeOf(version),
      modules: built.modules
    };
  }

  function escapeXml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // One path per code; each dark run in a row becomes one rectangle.
  function toSvg(qr, opts) {
    opts = opts || {};
    var border = opts.border == null ? 4 : opts.border;
    var n = qr.size, dim = n + 2 * border, d = [];
    for (var y = 0; y < n; y++) {
      var x = 0;
      while (x < n) {
        if (qr.modules[y][x]) {
          var start = x;
          while (x < n && qr.modules[y][x]) x++;
          d.push('M' + (start + border) + ' ' + (y + border) + 'h' + (x - start) + 'v1h-' + (x - start) + 'z');
        } else {
          x++;
        }
      }
    }
    var label = opts.label ? escapeXml(opts.label) : '';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + dim + ' ' + dim + '"' +
      ' shape-rendering="crispEdges"' + (label ? ' role="img" aria-label="' + label + '"' : '') + '>' +
      (label ? '<title>' + label + '</title>' : '') +
      '<rect width="' + dim + '" height="' + dim + '" fill="#fff"/>' +
      '<path fill="#000" d="' + d.join('') + '"/></svg>';
  }

  root.QR = {
    encode: encode,
    toSvg: toSvg,
    _test: { rsDivisor: rsDivisor, rsRemainder: rsRemainder, rawModules: rawModules,
      EC_PER_BLOCK: EC_PER_BLOCK, BLOCKS: BLOCKS }
  };
})(this);
