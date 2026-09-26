/*!
 * MathViz 1.0 — dựng bảng biến thiên, bảng xét dấu và đồ thị hàm số bằng SVG.
 * Không phụ thuộc thư viện ngoài. Dùng được trực tiếp trong trình duyệt.
 *
 *   <div data-mathviz='{"type":"bbt", ...}'></div>
 *   MathViz.auto();            // quét và dựng toàn trang, tự bắt nội dung nạp sau
 *   MathViz.render(spec);      // -> chuỗi SVG
 *
 * Màu sắc lấy từ biến CSS, đặt trên :root để đổi theo giao diện:
 *   --mv-ink, --mv-line, --mv-label-bg, --mv-curve, --mv-pos, --mv-neg, --mv-accent
 */
(function (root, factory) {
  var lib = factory();
  if (typeof module === "object" && module.exports) module.exports = lib;
  if (root) root.MathViz = lib;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ─────────────────────────── tiện ích ─────────────────────────── */

  var uidCounter = 0;
  function uid() { return "mv" + (++uidCounter) + "-" + Math.floor(Math.random() * 1e6); }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // Chuẩn hoá dấu trừ/vô cực người dùng hay gõ bằng kí tự Unicode
  function nice(s) {
    return String(s == null ? "" : s)
      .replace(/-inf|-oo/gi, "−∞").replace(/\+inf|\+oo|inf|oo/gi, "+∞")
      .replace(/(^|[\s(\[])-(?=[\d.])/g, "$1−")
      .replace(/(\s)-(\s)/g, "$1−$2")
      .replace(/^-$/, "−");
  }

  function attr(o) {
    var out = "";
    for (var k in o) if (o[k] !== undefined && o[k] !== null && o[k] !== "") out += " " + k + '="' + o[k] + '"';
    return out;
  }

  function T(x, y, s, o) {
    o = o || {};
    // Nền sáng quanh chữ: vẽ hai lớp (tương thích mọi trình duyệt, không cần paint-order)
    if (o.halo) {
      var back = {}; for (var k in o) back[k] = o[k];
      back.halo = false; back.haloLayer = true;
      return T(x, y, s, back) + T(x, y, s, (function () { var f = {}; for (var j in o) f[j] = o[j]; f.halo = false; return f; })());
    }
    return "<text" + attr({
      x: r2(x), y: r2(y), "text-anchor": o.anchor || "middle",
      "font-size": o.size || 15, "font-style": o.italic ? "italic" : null,
      "font-weight": o.bold ? "600" : null, fill: o.haloLayer ? "var(--mv-bg, #ffffff)" : (o.fill || "var(--mv-ink, #14343a)"),
      "font-family": o.mono ? "ui-monospace, monospace" : "Cambria, Georgia, 'Times New Roman', serif",
      stroke: o.haloLayer ? "var(--mv-bg, #ffffff)" : null,
      "stroke-width": o.haloLayer ? 3.5 : null,
      "stroke-linejoin": o.haloLayer ? "round" : null
    }) + ">" + esc(s) + "</text>";
  }

  function L(x1, y1, x2, y2, o) {
    o = o || {};
    return "<line" + attr({
      x1: r2(x1), y1: r2(y1), x2: r2(x2), y2: r2(y2),
      stroke: o.stroke || "var(--mv-line, #94adb0)", "stroke-width": o.w || 1,
      "stroke-dasharray": o.dash || null, "marker-end": o.marker || null,
      "stroke-linecap": o.cap || null
    }) + "/>";
  }

  function r2(n) { n = Number(n); return isFinite(n) ? Math.round(n * 100) / 100 : 0; }

  // Ép về số trong khoảng cho phép — chặn giá trị rác làm vỡ hình hoặc treo trình duyệt
  function nnum(v, d, min, max) {
    var n = typeof v === "number" ? v : parseFloat(v);
    if (!isFinite(n)) n = d;
    if (min !== undefined && n < min) n = min;
    if (max !== undefined && n > max) n = max;
    return n;
  }
  // Chỉ nhận mã màu dạng #hex hoặc tên màu — chặn chèn thuộc tính lạ vào thẻ SVG
  function safeColor(c, d) {
    c = String(c == null ? "" : c).trim();
    return (/^#[0-9a-fA-F]{3,8}$/.test(c) || /^[a-zA-Z]{3,20}$/.test(c)) ? c : d;
  }
  function capArr(arr, n) { return Array.isArray(arr) ? arr.slice(0, n) : []; }

  function wrap(w, h, body, cls) {
    w = nnum(w, 500, 120, 3000); h = nnum(h, 300, 80, 3000);
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + r2(w) + " " + r2(h) +
      '" width="100%" style="max-width:' + Math.round(w) + 'px;height:auto;display:block" ' +
      'class="mathviz ' + (cls || "") + '" role="img">' + body + "</svg>";
  }

  function arrowDefs(id, color) {
    return '<defs><marker id="' + id + '" viewBox="0 0 10 10" refX="9" refY="5" ' +
      'markerWidth="7" markerHeight="7" orient="auto-start-reverse">' +
      '<path d="M0,1 L10,5 L0,9 z" fill="' + color + '"/></marker></defs>';
  }

  /* ────────────────── bộ đọc biểu thức (không dùng eval) ────────────────── */

  var FUNCS = {
    sqrt: Math.sqrt, abs: Math.abs, sin: Math.sin, cos: Math.cos, tan: Math.tan,
    asin: Math.asin, acos: Math.acos, atan: Math.atan, exp: Math.exp,
    ln: Math.log, log: function (v) { return Math.log(v) / Math.LN10; },
    sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
    cbrt: Math.cbrt, sign: Math.sign, floor: Math.floor, ceil: Math.ceil
  };
  var CONSTS = { pi: Math.PI, e: Math.E };

  function tokenize(src) {
    var s = String(src)
      .replace(/[−–—]/g, "-").replace(/[×·]/g, "*").replace(/[÷]/g, "/")
      .replace(/√/g, "sqrt").replace(/π/g, "pi").replace(/,/g, ".")
      .replace(/\s+/g, "");
    var t = [], i = 0;
    while (i < s.length) {
      var c = s[i];
      if (/[0-9.]/.test(c)) {
        var j = i; while (j < s.length && /[0-9.]/.test(s[j])) j++;
        t.push({ k: "num", v: parseFloat(s.slice(i, j)) }); i = j;
      } else if (/[a-zA-Z]/.test(c)) {
        var k = i; while (k < s.length && /[a-zA-Z]/.test(s[k])) k++;
        t.push({ k: "id", v: s.slice(i, k) }); i = k;
      } else if ("+-*/^()".indexOf(c) >= 0) {
        t.push({ k: c }); i++;
      } else throw new Error("Kí tự không hiểu: " + c);
    }
    // nhân ngầm: 2x, 3(x+1), (x+1)(x-2), 2sqrt(x)
    var out = [];
    for (var n = 0; n < t.length; n++) {
      out.push(t[n]);
      var a = t[n], b = t[n + 1];
      if (!b) continue;
      var aEnd = a.k === "num" || a.k === ")" || (a.k === "id" && !FUNCS[a.v]);
      var bStart = b.k === "num" || b.k === "(" || b.k === "id";
      if (aEnd && bStart) out.push({ k: "*" });
    }
    return out;
  }

  function compile(src) {
    var t = tokenize(src), p = 0;
    function peek() { return t[p]; }
    function eat(k) { if (t[p] && t[p].k === k) { p++; return true; } return false; }
    function expr() {
      var v = term();
      while (peek() && (peek().k === "+" || peek().k === "-")) {
        var op = t[p++].k, r = term();
        v = op === "+" ? add(v, r) : sub(v, r);
      }
      return v;
    }
    function term() {
      var v = unary();
      while (peek() && (peek().k === "*" || peek().k === "/")) {
        var op = t[p++].k, r = unary();
        v = op === "*" ? mul(v, r) : div(v, r);
      }
      return v;
    }
    function unary() {
      if (eat("-")) { var u = unary(); return function (x) { return -u(x); }; }
      if (eat("+")) return unary();
      return power();
    }
    function power() {
      var b = atom();
      if (eat("^")) { var e = unary(); return function (x) { return Math.pow(b(x), e(x)); }; }
      return b;
    }
    function atom() {
      var tk = t[p];
      if (!tk) throw new Error("Biểu thức thiếu vế");
      if (tk.k === "num") { p++; return function () { return tk.v; }; }
      if (tk.k === "(") { p++; var v = expr(); if (!eat(")")) throw new Error("Thiếu dấu )"); return v; }
      if (tk.k === "id") {
        p++;
        var name = tk.v;
        if (FUNCS[name]) {
          if (!eat("(")) throw new Error("Hàm " + name + " thiếu dấu (");
          var a = expr(); if (!eat(")")) throw new Error("Thiếu dấu )");
          return function (x) { return FUNCS[name](a(x)); };
        }
        if (CONSTS[name] !== undefined) return function () { return CONSTS[name]; };
        if (name === "x" || name === "t") return function (x) { return x; };
        throw new Error("Không hiểu kí hiệu: " + name);
      }
      throw new Error("Biểu thức sai ở vị trí " + p);
    }
    function add(a, b) { return function (x) { return a(x) + b(x); }; }
    function sub(a, b) { return function (x) { return a(x) - b(x); }; }
    function mul(a, b) { return function (x) { return a(x) * b(x); }; }
    function div(a, b) { return function (x) { return a(x) / b(x); }; }

    var f = expr();
    if (p < t.length) throw new Error("Thừa kí tự ở cuối biểu thức");
    return f;
  }

  /* ─────────────────────── bảng biến thiên ─────────────────────── */
  /*
    { type:"bbt",
      nodes:["-oo","-1","1","3","+oo"],
      marks:["","0","||","0",""],          // ô trên dòng y' tại mốc: "0" | "||" | ""
      signs:["+","-","-","+"],             // dấu y' giữa hai mốc (n-1 phần tử)
      vals:[ {t:"-oo",p:"b"}, {t:"-4",p:"t"},
             {l:"-oo", r:"+oo"},           // mốc gián đoạn: giá trị trái/phải
             {t:"4",p:"b"}, {t:"+oo",p:"t"} ],
      rowLabels:["x","y'","y"], note:"(Cực tiểu tại x = 3)" }
  */
  function renderBBT(sp) {
    var nodes = capArr(sp.nodes, 12), n = nodes.length;
    if (n < 2) throw new Error("bbt cần ít nhất 2 mốc trong 'nodes'");
    var labels = capArr(sp.rowLabels, 3); if (labels.length < 3) labels = ["x", "y′", "y"];
    var W = nnum(sp.width, Math.max(420, 130 * (n - 1) + 90), 240, 2400);
    var LW = nnum(sp.labelW, 62, 30, 200);
    var h1 = 32, h2 = 32, h3 = nnum(sp.rowH3, 96, 50, 260);
    var top = 2, H = top + h1 + h2 + h3 + (sp.note ? 26 : 0) + 2;
    var yA = top, yB = yA + h1, yC = yB + h2, yD = yC + h3;

    var X0 = LW, VW = W - LW - 2;
    var gap0 = VW / (n - 1);
    var pad = Math.min(34, gap0 * 0.22);
    var gap = (VW - 2 * pad) / (n - 1);
    var INS = Math.min(38, gap * 0.28), INS2 = Math.min(56, gap * 0.42);
    var nx = function (i) { return X0 + pad + i * gap; };

    var id = uid(), curve = "var(--mv-curve, #0e7c86)";
    var s = arrowDefs(id, curve);

    s += "<rect" + attr({ x: 1, y: yA, width: LW - 1, height: yD - yA, fill: "var(--mv-label-bg, #e3f1f2)" }) + "/>";
    s += "<rect" + attr({
      x: 1, y: yA, width: W - 2, height: yD - yA, fill: "none",
      stroke: "var(--mv-line, #94adb0)", "stroke-width": 1.2
    }) + "/>";
    s += L(1, yB, W - 1, yB) + L(1, yC, W - 1, yC) + L(LW, yA, LW, yD);

    var rowsY = [yA + h1 / 2, yB + h2 / 2, yC + h3 / 2];
    for (var i = 0; i < 3; i++)
      s += T(LW / 2, rowsY[i] + 5, labels[i], { bold: true, size: 15 });

    for (i = 0; i < n; i++) s += T(nx(i), yA + h1 / 2 + 5, nice(nodes[i]), { size: 15 });

    var signs = sp.signs || [];
    for (i = 0; i < n - 1; i++) {
      var sg = signs[i] == null ? "" : String(signs[i]);
      if (!sg) continue;
      var col = sg.indexOf("+") === 0 ? "var(--mv-pos, #0e7c86)"
        : (sg.indexOf("-") === 0 || sg.indexOf("−") === 0 ? "var(--mv-neg, #d9821a)" : "var(--mv-ink, #14343a)");
      s += T((nx(i) + nx(i + 1)) / 2, yB + h2 / 2 + 6, sg.replace(/^-$/, "−"), { size: 17, bold: true, fill: col });
    }

    var marks = sp.marks || [];
    for (i = 0; i < n; i++) {
      var m = marks[i];
      if (!m) continue;
      if (m === "||" || m === "‖") {
        s += L(nx(i) - 2.5, yB, nx(i) - 2.5, yD, { w: 1.2 }) + L(nx(i) + 2.5, yB, nx(i) + 2.5, yD, { w: 1.2 });
      } else {
        s += T(nx(i), yB + h2 / 2 + 6, nice(m), { size: 15, bold: true });
      }
    }

    var yTop = yC + 26, yBot = yD - 26;
    var pos = function (p) { return p === "t" ? yTop : yBot; };
    var vals = sp.vals || [], outP = [], inP = [];
    for (i = 0; i < n; i++) {
      var v = vals[i] || {};
      if (v.l !== undefined || v.r !== undefined) {
        var lp = v.lp || "b", rp = v.rp || "t";
        if (v.l !== undefined && v.l !== "") s += T(nx(i) - 8, pos(lp) + 5, nice(v.l), { anchor: "end", size: 15 });
        if (v.r !== undefined && v.r !== "") s += T(nx(i) + 8, pos(rp) + 5, nice(v.r), { anchor: "start", size: 15 });
        inP[i] = lp; outP[i] = rp;
      } else {
        if (v.t) s += T(nx(i), pos(v.p || "t") + 5, nice(v.t), { size: 15 });
        inP[i] = outP[i] = v.p || "t";
      }
    }
    for (i = 0; i < n - 1; i++) {
      var a = vals[i] || {}, b = vals[i + 1] || {};
      var ia = (a.l !== undefined || a.r !== undefined) ? INS2 : INS;
      var ib = (b.l !== undefined || b.r !== undefined) ? INS2 : INS;
      var x1 = nx(i) + ia, x2 = nx(i + 1) - ib;
      if (x2 - x1 < 8) continue;
      s += L(x1, pos(outP[i]), x2, pos(inP[i + 1]), { stroke: curve, w: 1.7, marker: "url(#" + id + ")" });
    }

    if (sp.note) s += T(W / 2, yD + 19, sp.note, { size: 13, italic: true, fill: "var(--mv-accent, #d9821a)" });
    return wrap(W, H, s, "mathviz-bbt");
  }

  /* ─────────────────────── bảng xét dấu ─────────────────────── */
  /*
    { type:"xetdau",
      nodes:["-oo","-1","2","+oo"],
      rows:[ {label:"x + 1", signs:["-","+","+"], marks:["","0","",""]},
             {label:"x − 2", signs:["-","-","+"], marks:["","","0",""]},
             {label:"f′(x)", signs:["+","-","+"], marks:["","0","0",""], strong:true} ] }
  */
  function renderXetDau(sp) {
    var nodes = capArr(sp.nodes, 12), n = nodes.length, rows = capArr(sp.rows, 10);
    if (n < 2) throw new Error("xetdau cần ít nhất 2 mốc trong 'nodes'");
    var W = nnum(sp.width, Math.max(400, 120 * (n - 1) + 100), 240, 2400);
    var LW = nnum(sp.labelW, 82, 30, 240), rh = 34;
    var top = 2, H = top + rh * (rows.length + 1) + 4;
    var X0 = LW, VW = W - LW - 2;
    var gap0 = VW / (n - 1), pad = Math.min(34, gap0 * 0.22);
    var gap = (VW - 2 * pad) / (n - 1);
    var nx = function (i) { return X0 + pad + i * gap; };
    var yEnd = top + rh * (rows.length + 1);

    var s = "<rect" + attr({ x: 1, y: top, width: LW - 1, height: yEnd - top, fill: "var(--mv-label-bg, #e3f1f2)" }) + "/>";
    s += "<rect" + attr({
      x: 1, y: top, width: W - 2, height: yEnd - top, fill: "none",
      stroke: "var(--mv-line, #94adb0)", "stroke-width": 1.2
    }) + "/>";
    s += L(LW, top, LW, yEnd);

    s += T(LW / 2, top + rh / 2 + 5, sp.varName || "x", { bold: true });
    for (var i = 0; i < n; i++) s += T(nx(i), top + rh / 2 + 5, nice(nodes[i]));

    rows.forEach(function (row, ri) {
      var y = top + rh * (ri + 1);
      s += L(1, y, W - 1, y, { w: row.strong ? 1.4 : 1 });
      s += T(LW / 2, y + rh / 2 + 5, nice(row.label || ""), { bold: !!row.strong, size: 14 });
      (row.signs || []).forEach(function (sg, k) {
        if (!sg) return;
        var col = String(sg).indexOf("+") === 0 ? "var(--mv-pos, #0e7c86)" : "var(--mv-neg, #d9821a)";
        s += T((nx(k) + nx(k + 1)) / 2, y + rh / 2 + 6, String(sg).replace(/^-$/, "−"),
          { size: 17, bold: true, fill: col });
      });
      (row.marks || []).forEach(function (m, k) {
        if (!m) return;
        if (m === "||" || m === "‖") {
          s += L(nx(k) - 2.5, y, nx(k) - 2.5, y + rh, { w: 1.2 }) + L(nx(k) + 2.5, y, nx(k) + 2.5, y + rh, { w: 1.2 });
        } else s += T(nx(k), y + rh / 2 + 6, nice(m), { size: 15, bold: true });
      });
    });
    return wrap(W, H, s, "mathviz-xetdau");
  }

  /* ─────────────────────── đồ thị hàm số ─────────────────────── */
  /*
    { type:"dothi", fn:"x^3-3x^2+2", xmin:-1.5, xmax:3.5, ymin:-3, ymax:3,
      xticks:[-1,1,2,3], yticks:[-2,2], grid:true,
      pieces:[{fn:"-x",from:-3,to:-1}, ...],       // thay cho fn nếu hàm nhiều nhánh
      asymptotes:{v:[1], h:[2]},
      points:[{x:0,y:2,label:"CĐ"},{x:2,y:-2}],
      dashTo:[{x:0,y:2}],                          // kẻ nét đứt xuống hai trục
      label:"y = x³ − 3x² + 2", caption:"Hình 1.5" }
  */
  function renderDoThi(sp) {
    var xmin = num(sp.xmin, -5), xmax = num(sp.xmax, 5);
    var ymin = num(sp.ymin, -5), ymax = num(sp.ymax, 5);
    var W = nnum(sp.width, 460, 200, 1600), H = nnum(sp.height, 340, 160, 1400);
    var m = 16, cap = sp.caption ? 22 : 0;
    var px0 = m, py0 = m, pw = W - 2 * m, ph = H - 2 * m - cap;

    var PX = function (x) { return px0 + ((x - xmin) / (xmax - xmin)) * pw; };
    var PY = function (y) { return py0 + ((ymax - y) / (ymax - ymin)) * ph; };

    var id = uid(), curve = "var(--mv-curve, #d9821a)";
    var s = arrowDefs(id, "var(--mv-line, #7d979a)");
    var body = "";

    var xAxis = PY(0), yAxis = PX(0);
    var xIn = 0 >= ymin && 0 <= ymax, yIn = 0 >= xmin && 0 <= xmax;
    if (!xIn) xAxis = PY(Math.min(Math.max(0, ymin), ymax));
    if (!yIn) yAxis = PX(Math.min(Math.max(0, xmin), xmax));

    if (sp.grid) {
      for (var gx = Math.ceil(xmin); gx <= xmax; gx++)
        body += L(PX(gx), py0, PX(gx), py0 + ph, { stroke: "var(--mv-grid, #dcebec)", w: 1 });
      for (var gy = Math.ceil(ymin); gy <= ymax; gy++)
        body += L(px0, PY(gy), px0 + pw, PY(gy), { stroke: "var(--mv-grid, #dcebec)", w: 1 });
    }

    body += L(px0, xAxis, px0 + pw, xAxis, { w: 1.2, stroke: "var(--mv-line, #7d979a)", marker: "url(#" + id + ")" });
    body += L(yAxis, py0 + ph, yAxis, py0, { w: 1.2, stroke: "var(--mv-line, #7d979a)", marker: "url(#" + id + ")" });
    body += T(px0 + pw - 2, xAxis - 8, "x", { italic: true, size: 13, fill: "var(--mv-line, #7d979a)", anchor: "end" });
    body += T(yAxis + 12, py0 + 10, "y", { italic: true, size: 13, fill: "var(--mv-line, #7d979a)", anchor: "start" });
    body += T(yAxis - 9, xAxis + 15, "O", { size: 12, fill: "var(--mv-line, #7d979a)", anchor: "end" });

    (sp.xticks || []).forEach(function (t) {
      body += L(PX(t), xAxis - 4, PX(t), xAxis + 4, { w: 1, stroke: "var(--mv-line, #7d979a)" });
      body += T(PX(t), xAxis + 17, nice(t), { size: 12, halo: true, fill: "var(--mv-line, #6c8689)" });
    });
    (sp.yticks || []).forEach(function (t) {
      body += L(yAxis - 4, PY(t), yAxis + 4, PY(t), { w: 1, stroke: "var(--mv-line, #7d979a)" });
      body += T(yAxis - 9, PY(t) + 4, nice(t), { size: 12, halo: true, anchor: "end", fill: "var(--mv-line, #6c8689)" });
    });

    var asy = sp.asymptotes || {};
    (asy.v || []).forEach(function (v) {
      body += L(PX(v), py0, PX(v), py0 + ph, { dash: "5 4", stroke: "var(--mv-accent, #b1c4c6)", w: 1.2 });
    });
    (asy.h || []).forEach(function (v) {
      body += L(px0, PY(v), px0 + pw, PY(v), { dash: "5 4", stroke: "var(--mv-accent, #b1c4c6)", w: 1.2 });
    });

    var pieces = capArr(sp.pieces, 12);
    if (!pieces.length && sp.fn) pieces = [{ fn: sp.fn, from: xmin, to: xmax }];
    pieces.forEach(function (pc) {
      var f = compile(pc.fn);
      var a = num(pc.from, xmin), b = num(pc.to, xmax);
      var N = nnum(pc.samples, 400, 20, 1500), path = "", pen = false, prevY = null;
      for (var i = 0; i <= N; i++) {
        var x = a + ((b - a) * i) / N, y;
        try { y = f(x); } catch (e) { y = NaN; }
        var ok = isFinite(y) && y >= ymin && y <= ymax;
        var jump = prevY !== null && Math.abs(y - prevY) > (ymax - ymin) * 0.8;
        if (ok && !jump) { path += (pen ? "L" : "M") + r2(PX(x)) + " " + r2(PY(y)) + " "; pen = true; }
        else pen = false;
        prevY = isFinite(y) ? y : null;
      }
      if (path) body += "<path" + attr({
        d: path.trim(), fill: "none", stroke: safeColor(pc.color, curve),
        "stroke-width": nnum(sp.strokeWidth, 2.2, 0.5, 8), "stroke-linejoin": "round", "stroke-linecap": "round"
      }) + "/>";
    });

    (sp.dashTo || []).forEach(function (p) {
      body += L(PX(p.x), PY(p.y), PX(p.x), xAxis, { dash: "4 4", stroke: "var(--mv-line, #a9c0c2)" });
      body += L(PX(p.x), PY(p.y), yAxis, PY(p.y), { dash: "4 4", stroke: "var(--mv-line, #a9c0c2)" });
    });

    capArr(sp.points, 30).forEach(function (p) {
      var x = Array.isArray(p) ? p[0] : p.x, y = Array.isArray(p) ? p[1] : p.y;
      body += "<circle" + attr({
        cx: r2(PX(x)), cy: r2(PY(y)), r: 4,
        fill: safeColor(p.color, "var(--mv-curve, #0e7c86)"), stroke: "var(--mv-bg, #fff)", "stroke-width": 1.5
      }) + "/>";
      if (p.label) body += T(PX(x), PY(y) - 12, p.label, { size: 12, bold: true, halo: true, fill: "var(--mv-curve, #0e7c86)" });
    });

    if (sp.label) {
      var lx = sp.labelAt ? PX(sp.labelAt.x) : px0 + pw - 8;
      var ly = sp.labelAt ? PY(sp.labelAt.y) : py0 + 16;
      body += T(lx, ly, sp.label, { size: 13, italic: true, halo: true, anchor: sp.labelAt ? "middle" : "end", fill: curve });
    }
    if (sp.caption) body += T(W / 2, H - 6, sp.caption, { size: 12, italic: true, fill: "var(--mv-accent, #d9821a)" });

    return wrap(W, H, s + body, "mathviz-dothi");
  }

  function num(v, d) { return typeof v === "number" && isFinite(v) ? v : (v == null ? d : parseFloat(v)); }

  /* ─────────────────────── điều phối ─────────────────────── */

  var RENDERERS = { bbt: renderBBT, bienthien: renderBBT, xetdau: renderXetDau, dau: renderXetDau, dothi: renderDoThi, graph: renderDoThi };

  function render(spec) {
    if (typeof spec === "string") spec = JSON.parse(spec);
    var fn = RENDERERS[(spec.type || "").toLowerCase()];
    if (!fn) throw new Error('type phải là "bbt", "xetdau" hoặc "dothi"');
    return fn(spec);
  }

  function errorBox(msg) {
    return '<div class="mathviz-error" style="border:1px solid #d68c86;background:#fdf2f1;' +
      'color:#8a2b22;padding:8px 10px;border-radius:6px;font:13px/1.5 system-ui,sans-serif">' +
      "Không dựng được hình: " + esc(msg) + "</div>";
  }

  function renderInto(el) {
    if (el.getAttribute("data-mv-done") === "1") return;
    var raw = el.getAttribute("data-mathviz") || el.textContent || "";
    try {
      el.innerHTML = render(raw.trim());
    } catch (e) {
      el.innerHTML = errorBox(e.message);
    }
    el.setAttribute("data-mv-done", "1");
  }

  function renderAll(rootEl) {
    var scope = rootEl || (typeof document !== "undefined" ? document : null);
    if (!scope || !scope.querySelectorAll) return 0;
    var list = scope.querySelectorAll("[data-mathviz]:not([data-mv-done='1'])");
    for (var i = 0; i < list.length; i++) renderInto(list[i]);
    return list.length;
  }

  // Tự động: dựng ngay khi trang mở và mỗi khi có nội dung mới được nạp vào DOM.
  var observing = false;
  function auto() {
    if (typeof document === "undefined") return;
    renderAll(document);
    if (observing || typeof MutationObserver === "undefined") return;
    observing = true;
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var added = muts[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var nd = added[j];
          if (nd.nodeType !== 1) continue;
          if (nd.hasAttribute && nd.hasAttribute("data-mathviz")) renderInto(nd);
          if (nd.querySelectorAll) renderAll(nd);
        }
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  // Đặt window.MATHVIZ_NO_AUTO = true trước khi nạp thư viện để tự gọi render lấy
  if (typeof document !== "undefined" && !(typeof self !== "undefined" && self.MATHVIZ_NO_AUTO)) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", auto);
    else auto();
  }

  /* Xuất PNG (dán vào Word, in đề giấy) */
  function toPNG(spec, scale) {
    scale = scale || 3;
    return new Promise(function (resolve, reject) {
      var svg = render(spec);
      var mW = /max-width:(\d+)px/.exec(svg), mV = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
      var w = mW ? +mW[1] : (mV ? +mV[1] : 600), h = mV ? (w * mV[2]) / mV[1] : 400;
      var img = new Image();
      img.onload = function () {
        var c = document.createElement("canvas");
        c.width = w * scale; c.height = h * scale;
        var g = c.getContext("2d");
        g.fillStyle = "#ffffff"; g.fillRect(0, 0, c.width, c.height);
        g.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/png"));
      };
      img.onerror = function () { reject(new Error("Không chuyển được SVG sang PNG")); };
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    });
  }

  // Sinh thẻ dán vào nội dung câu hỏi. Dấu nháy đơn trong nhãn (ví dụ f'(x))
  // được đổi thành &#39; để không làm đứt thuộc tính HTML.
  function tag(spec) {
    if (typeof spec === "string") spec = JSON.parse(spec);
    render(spec); // ném lỗi ngay nếu mô tả sai, để không dán nhầm thẻ hỏng
    return "<div data-mathviz='" + JSON.stringify(spec)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/'/g, "&#39;") + "'></div>";
  }

  return {
    version: "1.1", tag: tag,
    render: render, renderAll: renderAll, renderInto: renderInto, auto: auto,
    bbt: renderBBT, xetdau: renderXetDau, dothi: renderDoThi,
    compile: compile, toPNG: toPNG
  };
});
