/* eslint-disable @typescript-eslint/no-explicit-any */
/* ================================================================
   MathViz cho "Đỉnh Cao Trí Tuệ" V17
   Dựng bảng biến thiên / bảng xét dấu / đồ thị thành SVG.
   Dùng: import { renderAll } from "./mathviz";  rồi renderAll(phanTuGoc)
   Cú pháp mô tả giữ nguyên như bản V14/V15 nên các câu hỏi cũ
   trong ngân hàng không phải sửa lại.
   ================================================================ */

/* ---------- 1. Đọc biểu thức toán, ví dụ "x^3-3x^2+2" ---------- */

const FUNCS: Record<string, (v: number) => number> = {
  sqrt: Math.sqrt, abs: Math.abs, sin: Math.sin, cos: Math.cos,
  tan: Math.tan, exp: Math.exp, ln: Math.log, log: Math.log10,
  asin: Math.asin, acos: Math.acos, atan: Math.atan, cbrt: Math.cbrt
};

export function compile(expr: string): (x: number) => number {
  const s = String(expr || "").replace(/\s+/g, "").replace(/−/g, "-").replace(/,/g, ".");
  let i = 0;

  const isDigit = (c: string) => c >= "0" && c <= "9";
  const isAlpha = (c: string) => /[a-zA-Z]/.test(c);

  function parseExpr(): (x: number) => number {
    let neg = false;
    if (s[i] === "+") i++;
    else if (s[i] === "-") { neg = true; i++; }
    let left = parseTerm();
    if (neg) { const a = left; left = (x) => -a(x); }
    while (i < s.length && (s[i] === "+" || s[i] === "-")) {
      const op = s[i++];
      const right = parseTerm();
      const a = left;
      left = op === "+" ? (x) => a(x) + right(x) : (x) => a(x) - right(x);
    }
    return left;
  }

  function parseTerm(): (x: number) => number {
    let left = parsePower();
    for (;;) {
      const c = s[i];
      if (c === "*" || c === "/") {
        i++;
        const right = parsePower();
        const a = left;
        left = c === "*" ? (x) => a(x) * right(x) : (x) => a(x) / right(x);
      } else if (c && (isDigit(c) || isAlpha(c) || c === "(")) {
        const right = parsePower();       // nhân ngầm: 3x, 2(x+1), x(x-1)
        const a = left;
        left = (x) => a(x) * right(x);
      } else break;
    }
    return left;
  }

  function parsePower(): (x: number) => number {
    const base = parsePrimary();
    if (s[i] === "^") {
      i++;
      let neg = false;
      if (s[i] === "-") { neg = true; i++; }
      const e = parsePower();
      return neg ? (x) => Math.pow(base(x), -e(x)) : (x) => Math.pow(base(x), e(x));
    }
    return base;
  }

  function parsePrimary(): (x: number) => number {
    if (s[i] === "-") { i++; const v = parsePrimary(); return (x) => -v(x); }
    if (s[i] === "+") { i++; return parsePrimary(); }
    if (s[i] === "(") {
      i++;
      const v = parseExpr();
      if (s[i] === ")") i++;
      return v;
    }
    if (isDigit(s[i]) || s[i] === ".") {
      let j = i;
      while (j < s.length && (isDigit(s[j]) || s[j] === ".")) j++;
      const n = parseFloat(s.slice(i, j));
      i = j;
      return () => n;
    }
    if (isAlpha(s[i])) {
      let j = i;
      while (j < s.length && isAlpha(s[j])) j++;
      const word = s.slice(i, j);
      if (s[j] === "(" && FUNCS[word]) {
        i = j + 1;
        const arg = parseExpr();
        if (s[i] === ")") i++;
        const f = FUNCS[word];
        return (x) => f(arg(x));
      }
      if (word === "pi" || word === "PI") { i = j; return () => Math.PI; }
      if (word === "e") { i = j; return () => Math.E; }
      i = i + 1;                            // biến x (mọi chữ cái đơn coi là x)
      return (x) => x;
    }
    i++;
    return () => NaN;
  }

  try {
    const f = parseExpr();
    return (x) => { const v = f(x); return typeof v === "number" ? v : NaN; };
  } catch {
    return () => NaN;
  }
}

/* ---------- 2. Tiện ích dựng SVG ---------- */

const C = {
  line: "#1e293b",   // nét bảng, trục, chữ
  soft: "#94a3b8",   // nét đứt, tiệm cận, ghi chú
  curve: "#1d4ed8",  // đường cong đồ thị
  pos: "#0e7c86",    // dấu +
  neg: "#d9821a",    // dấu −
  grid: "#e2e8f0"    // lưới ô vuông
};

const esc = (t: any) =>
  String(t == null ? "" : t)
    .replace(/&(?!#?\w+;)/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

// "-oo" -> "−∞", "+oo" -> "+∞", dấu trừ thường -> dấu trừ toán học
const nice = (t: any) =>
  esc(t).replace(/\+oo|\+inf(inity)?/gi, "+∞").replace(/-oo|-inf(inity)?/gi, "−∞").replace(/^-(?=\d)/, "−");

const L = (x1: number, y1: number, x2: number, y2: number, o: any = {}) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${o.color || C.line}" stroke-width="${o.w || 1.1}"` +
  `${o.dash ? ` stroke-dasharray="${o.dash}"` : ""}${o.arrow ? ` marker-end="url(#${o.arrow})"` : ""} />`;

const T = (x: number, y: number, t: any, o: any = {}) =>
  `<text x="${x}" y="${y}" text-anchor="${o.anchor || "middle"}" font-size="${o.size || 14}"` +
  ` font-family="'Times New Roman',serif" fill="${o.fill || C.line}"` +
  `${o.bold ? ' font-weight="700"' : ""}${o.italic ? ' font-style="italic"' : ""}>${t}</text>`;

function wrap(w: number, h: number, body: string, cls: string, id: string, defsThem = "") {
  return (
    `<svg class="${cls}" viewBox="0 0 ${w} ${h}" width="100%" style="max-width:${w}px;height:auto;display:block;margin:10px auto" xmlns="http://www.w3.org/2000/svg">` +
    `<defs><marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">` +
    `<path d="M0,0 L10,5 L0,10 z" fill="${C.line}"/></marker>${defsThem}</defs>` +
    body +
    `</svg>`
  );
}

const num = (v: any, d: number) => (typeof v === "number" && isFinite(v) ? v : d);

// Mỗi hình phải có id riêng: nếu hai SVG trên cùng trang dùng chung một id,
// khi React gỡ hình thứ nhất thì đầu mũi tên của các hình còn lại biến mất.
let idDem = 0;
const idMoi = () => "mv" + (++idDem) + "-" + Math.random().toString(36).slice(2, 7);

/* ---------- 3. Bảng biến thiên ---------- */

function viTri(txt: any, mac: "t" | "b"): "t" | "b" {
  const s = String(txt || "");
  if (/^\s*\+?\s*(oo|∞)/.test(s.replace("+", "+"))) return "t";
  if (/^\s*[-−]\s*(oo|∞)/.test(s)) return "b";
  return mac;
}

function renderBBT(sp: any) {
  const nodes: any[] = sp.nodes || [];
  const n = nodes.length;
  if (n < 2) return `<div style="color:#b91c1c">MathViz: bảng biến thiên cần ít nhất 2 mốc.</div>`;

  const LW = 52, colW = Math.max(74, num(sp.colW, 92));
  const W = LW + colW * (n - 1) + 26;
  const rX = 34, rD = 34, rY = 86;
  const H = rX + rD + rY + 6;
  const nx = (k: number) => LW + colW * k + 13;
  const AR = idMoi();

  let s = "";
  const yX = 0, yD = rX, yY = rX + rD;

  // khung
  s += L(0, yX, W, yX) + L(0, yD, W, yD) + L(0, yY, W, yY) + L(0, H, W, H);
  s += L(0, yX, 0, H) + L(LW, yX, LW, H) + L(W, yX, W, H);

  s += T(LW / 2, yX + 22, "x", { italic: true, size: 16 });
  s += T(LW / 2, yD + 23, nice(sp.dlabel || "y'"), { italic: true, size: 16 });
  s += T(LW / 2, yY + 50, nice(sp.flabel || "y"), { italic: true, size: 16 });

  // dòng x
  nodes.forEach((v, k) => { s += T(nx(k), yX + 22, nice(v), { size: 15 }); });

  // dòng dấu đạo hàm
  (sp.signs || []).forEach((sg: any, k: number) => {
    if (!sg) return;
    const col = String(sg).indexOf("+") === 0 ? C.pos : C.neg;
    s += T((nx(k) + nx(k + 1)) / 2, yD + 23, String(sg).replace(/^-$/, "−"), { size: 18, bold: true, fill: col });
  });
  (sp.marks || []).forEach((m: any, k: number) => {
    if (!m) return;
    if (m === "||" || m === "‖") {
      s += L(nx(k) - 3, yD, nx(k) - 3, yD + rD, { w: 1.2 }) + L(nx(k) + 3, yD, nx(k) + 3, yD + rD, { w: 1.2 });
    } else s += T(nx(k), yD + 23, nice(m), { size: 15, bold: true });
  });

  // dòng giá trị
  const yTop = yY + 22, yBot = yY + rY - 12;
  const vals: any[] = sp.vals || [];
  const posOut: ("t" | "b")[] = [], posIn: ("t" | "b")[] = [];

  vals.forEach((v: any, k: number) => {
    if (v && (v.l !== undefined || v.r !== undefined)) {
      const pl = viTri(v.l, "t"), pr = viTri(v.r, "b");
      posIn[k] = pl; posOut[k] = pr;
      s += T(nx(k) - 16, pl === "t" ? yTop : yBot, nice(v.l), { size: 14, anchor: "end" });
      s += T(nx(k) + 16, pr === "t" ? yTop : yBot, nice(v.r), { size: 14, anchor: "start" });
      s += L(nx(k), yY + 4, nx(k), yY + rY - 4, { w: 1.2 });
    } else {
      const p: "t" | "b" = v && v.p === "b" ? "b" : "t";
      posIn[k] = p; posOut[k] = p;
      s += T(nx(k), p === "t" ? yTop : yBot, nice(v && v.t !== undefined ? v.t : v), { size: 15 });
    }
  });

  // mũi tên tự nối theo vị trí trên/dưới
  for (let k = 0; k < n - 1; k++) {
    const y1 = posOut[k] === "t" ? yTop + 8 : yBot - 16;
    const y2 = posIn[k + 1] === "t" ? yTop + 8 : yBot - 16;
    s += L(nx(k) + 22, y1, nx(k + 1) - 22, y2, { arrow: AR, w: 1.3 });
  }

  if (sp.note) s += T(W / 2, H - 2, nice(sp.note), { size: 12, fill: C.soft });
  return wrap(W, H + (sp.note ? 8 : 0), s, "mathviz-bbt", AR);
}

/* ---------- 4. Bảng xét dấu ---------- */

function renderXetDau(sp: any) {
  const nodes: any[] = sp.nodes || [];
  const rows: any[] = sp.rows || [];
  const n = nodes.length;
  if (n < 2 || !rows.length) return `<div style="color:#b91c1c">MathViz: bảng xét dấu thiếu mốc hoặc thiếu dòng.</div>`;

  const LW = 74, colW = Math.max(74, num(sp.colW, 92)), rh = 34;
  const W = LW + colW * (n - 1) + 26;
  const H = rh * (rows.length + 1);
  const nx = (k: number) => LW + colW * k + 13;

  let s = "";
  s += L(0, 0, W, 0) + L(0, 0, 0, H) + L(LW, 0, LW, H) + L(W, 0, W, H) + L(0, H, W, H);
  s += T(LW / 2, 22, "x", { italic: true, size: 16 });
  nodes.forEach((v, k) => { s += T(nx(k), 22, nice(v), { size: 15 }); });

  rows.forEach((row, r) => {
    const y = rh * (r + 1);
    s += L(0, y, W, y, { w: row.strong ? 1.4 : 1 });
    s += T(LW / 2, y + 23, nice(row.label || ""), { bold: !!row.strong, size: 14 });
    (row.signs || []).forEach((sg: any, k: number) => {
      if (!sg) return;
      const col = String(sg).indexOf("+") === 0 ? C.pos : C.neg;
      s += T((nx(k) + nx(k + 1)) / 2, y + 23, String(sg).replace(/^-$/, "−"), { size: 17, bold: true, fill: col });
    });
    (row.marks || []).forEach((m: any, k: number) => {
      if (!m) return;
      if (m === "||" || m === "‖") {
        s += L(nx(k) - 3, y, nx(k) - 3, y + rh, { w: 1.2 }) + L(nx(k) + 3, y, nx(k) + 3, y + rh, { w: 1.2 });
      } else s += T(nx(k), y + 23, nice(m), { size: 15, bold: true });
    });
  });

  return wrap(W, H, s, "mathviz-xetdau", idMoi());
}

/* ---------- 5. Đồ thị hàm số ---------- */

function renderDoThi(sp: any) {
  const xmin = num(sp.xmin, -5), xmax = num(sp.xmax, 5);
  const ymin = num(sp.ymin, -5), ymax = num(sp.ymax, 5);
  if (!(xmax > xmin) || !(ymax > ymin)) return `<div style="color:#b91c1c">MathViz: khoảng vẽ đồ thị không hợp lệ.</div>`;

  const W = num(sp.width, 460), H = num(sp.height, 340), m = 20;
  const px = (x: number) => m + ((x - xmin) / (xmax - xmin)) * (W - 2 * m);
  const py = (y: number) => H - m - ((y - ymin) / (ymax - ymin)) * (H - 2 * m);
  const x0 = px(0), y0 = py(0);
  const AR = idMoi(), CLIP = "clip-" + AR;

  let s = "";

  if (sp.grid) {
    const step = (v: number) => (v >= 1 ? Math.round(v) : 1);
    for (let x = Math.ceil(xmin); x <= xmax; x += step(1)) if (x !== 0) s += L(px(x), m, px(x), H - m, { color: C.grid, w: 1 });
    for (let y = Math.ceil(ymin); y <= ymax; y += step(1)) if (y !== 0) s += L(m, py(y), W - m, py(y), { color: C.grid, w: 1 });
  }

  // tiệm cận
  const asy = sp.asymptotes || {};
  (asy.v || []).forEach((x: number) => { s += L(px(x), m, px(x), H - m, { dash: "6 4", color: C.soft, w: 1.2 }); });
  (asy.h || []).forEach((y: number) => { s += L(m, py(y), W - m, py(y), { dash: "6 4", color: C.soft, w: 1.2 }); });

  // trục
  s += L(m - 4, y0, W - m + 6, y0, { arrow: AR, w: 1.2 });
  s += L(x0, H - m + 4, x0, m - 6, { arrow: AR, w: 1.2 });
  s += T(W - m + 10, y0 + 5, "x", { italic: true, size: 15 });
  s += T(x0 - 10, m - 8, "y", { italic: true, size: 15 });
  s += T(x0 - 9, y0 + 15, "O", { size: 14 });

  // vạch chia
  (sp.xticks || []).forEach((x: number) => {
    if (x === 0) return;
    s += L(px(x), y0 - 4, px(x), y0 + 4, { w: 1.1 });
    s += T(px(x), y0 + 18, nice(x), { size: 13 });
  });
  (sp.yticks || []).forEach((y: number) => {
    if (y === 0) return;
    s += L(x0 - 4, py(y), x0 + 4, py(y), { w: 1.1 });
    s += T(x0 - 10, py(y) + 5, nice(y), { size: 13, anchor: "end" });
  });

  // nét đứt gióng xuống hai trục
  (sp.dashTo || []).forEach((p: any) => {
    s += L(px(p.x), py(p.y), px(p.x), y0, { dash: "4 4", color: C.soft, w: 1 });
    s += L(px(p.x), py(p.y), x0, py(p.y), { dash: "4 4", color: C.soft, w: 1 });
  });

  // đường cong
  const pieces = sp.pieces && sp.pieces.length ? sp.pieces : [{ fn: sp.fn, from: xmin, to: xmax }];
  pieces.forEach((pc: any) => {
    if (!pc || !pc.fn) return;
    const f = compile(pc.fn);
    const a = num(pc.from, xmin), b = num(pc.to, xmax);
    const N = 500;
    let d = "", ve = false;
    for (let k = 0; k <= N; k++) {
      const x = a + ((b - a) * k) / N;
      const y = f(x);
      // Ngắt nét khi hàm vọt quá xa (tiệm cận đứng) để không nối hai nhánh với nhau.
      if (!isFinite(y) || Math.abs(y) > 40 * (ymax - ymin)) { ve = false; continue; }
      const X = px(x), Y = py(y);
      d += (ve ? "L" : "M") + X.toFixed(1) + " " + Y.toFixed(1) + " ";
      ve = true;
    }
    if (d) s += `<path d="${d}" fill="none" stroke="${C.curve}" stroke-width="2.1" stroke-linejoin="round" stroke-linecap="round" clip-path="url(#${CLIP})"/>`;
  });

  // điểm đánh dấu
  (sp.points || []).forEach((p: any) => {
    s += `<circle cx="${px(p.x)}" cy="${py(p.y)}" r="3.4" fill="${C.curve}"/>`;
    if (p.label) s += T(px(p.x) + 12, py(p.y) - 8, nice(p.label), { size: 13, anchor: "start" });
  });

  if (sp.label) {
    const at = sp.labelAt || {};
    s += T(px(num(at.x, xmin + (xmax - xmin) * 0.72)), py(num(at.y, ymax * 0.82)), nice(sp.label), { size: 14, fill: C.curve, anchor: "start" });
  }
  if (sp.caption) s += T(W / 2, H - 2, nice(sp.caption), { size: 12, fill: C.soft });

  const defs = `<clipPath id="${CLIP}"><rect x="${m - 6}" y="${m - 6}" width="${W - 2 * m + 12}" height="${H - 2 * m + 12}"/></clipPath>`;
  return wrap(W, H, s, "mathviz-dothi", AR, defs);
}

/* ---------- 6. Đầu mối ---------- */

export function render(spec: any): string {
  if (!spec || typeof spec !== "object") return "";
  switch (spec.type) {
    case "bbt": return renderBBT(spec);
    case "xetdau": return renderXetDau(spec);
    case "dothi": case "graph": return renderDoThi(spec);
    default: return `<div style="color:#b91c1c">MathViz: không hiểu loại hình "${esc(spec.type)}".</div>`;
  }
}

/** Quét một vùng của trang và dựng hình cho mọi thẻ data-mathviz chưa vẽ. */
export function renderAll(root?: Element | Document | null): number {
  const scope: any = root || (typeof document !== "undefined" ? document : null);
  if (!scope || !scope.querySelectorAll) return 0;
  const list = scope.querySelectorAll("[data-mathviz]:not([data-mv-done])");
  let dem = 0;
  list.forEach((el: Element) => {
    const raw = el.getAttribute("data-mathviz") || "";
    try {
      el.innerHTML = render(JSON.parse(raw));
    } catch {
      el.innerHTML = `<div style="color:#b91c1c;font-size:13px">MathViz: mô tả hình sai cú pháp JSON.</div>`;
    }
    el.setAttribute("data-mv-done", "1");
    dem++;
  });
  return dem;
}

if (typeof window !== "undefined") {
  (window as any).MathViz = { render, renderAll, compile };
}

export default { render, renderAll, compile };
