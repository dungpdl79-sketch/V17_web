/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */
"use client";
import { useEffect, useState, useRef, useMemo, useCallback, memo } from "react";
import { renderAll as veHinhToan } from "./mathviz";

type Data = {
  user: { email: string; name: string; role: "teacher" | "student" | null };
  classes: any[];
  exams: any[];
  attempts: any[];
  hocLieu?: any[];
  links?: any[];
};

// ==========================================
// CẤU HÌNH TÀI KHOẢN QUẢN TRỊ
// Trước đây email/tên giáo viên bị viết cứng giữa file LoginForm, rất khó tìm khi cần đổi.
// ==========================================
const TEACHER_ACCOUNT = { email: "thuyetdung@gmail.com", name: "Hồ Thuyết Dũng" };

// ==========================================
// TIỆN ÍCH CHUNG
// ==========================================

// LỖI CŨ: Xưởng V15 xuất type = 1 | 2 | 3 (số) còn màn hình này chỉ kiểm tra q.type === "mcq".
// Hậu quả: câu trắc nghiệm từ V15 hiện thành ô nhập text, mất hết phương án A/B/C/D.
// Hàm này quy về một chuẩn duy nhất và vẫn đọc được các file JSON đã xuất trước đây.
function questionType(q: any): "mcq" | "tf" | "sa" | "essay" {
  const t = q?.type;
  if (t === 1 || t === "1" || t === "mcq") return "mcq";
  if (t === 2 || t === "2" || t === "tf") return "tf";
  if (t === 3 || t === "3" || t === "sa") return "sa";
  if (t === 4 || t === "4" || t === "essay" || t === "tuluan" || t === "tl") return "essay";
  if (Array.isArray(q?.barem) && q.barem.length) return "essay";
  if (Array.isArray(q?.opts) && q.opts.length) return "mcq";
  if (Array.isArray(q?.stmts) && q.stmts.length) return "tf";
  return "sa";
}

// Ô trả lời ngắn theo quy định thi: tối đa 4 ký tự, chỉ số, một dấu phẩy thập phân,
// dấu trừ nếu có thì phải đứng đầu. Lọc ngay khi gõ để chặn cả trường hợp dán từ nơi khác.
const GIOI_HAN_TRA_LOI_NGAN = 4;
function chuanHoaTraLoiNgan(v: string) {
  let out = String(v ?? "").replace(/[^0-9,.\-]/g, "");
  out = out.replace(/(?!^)-/g, "");
  const phan = out.split(/[.,]/);
  if (phan.length > 2) out = phan[0] + "," + phan.slice(1).join("");
  return out.slice(0, GIOI_HAN_TRA_LOI_NGAN);
}

// =====================================================================
// GIAO DIỆN CO GIÃN THEO MÀN HÌNH
// LỖI CŨ: thanh menu bên trái rộng cố định 270px và không bao giờ ẩn.
// Trên điện thoại (kể cả xoay ngang) phần đề chỉ còn hơn 100px nên mỗi dòng
// chỉ hiện được một chữ, học sinh không đọc nổi đề.
// =====================================================================
const CSS_GIAO_DIEN = `
.v17-main { min-width: 0; }
.v17-fab { display: none !important; }
.v17-overlay { display: none; }
.v17-main mjx-container[display="true"] { overflow-x: auto; overflow-y: hidden; max-width: 100%; }
.v17-main table { max-width: 100%; }
.v17-question img, .v17-question svg, .v17-question canvas { max-width: 100%; height: auto; }
.v17-main img { max-width: 100%; height: auto; border-radius: 8px; }
.v17-question { overflow-wrap: anywhere; }
.v17-de-cuon { max-height: 68vh; overflow-y: auto; overscroll-behavior: contain; }
.v17-de-cuon::-webkit-scrollbar { width: 10px; }
.v17-de-cuon::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 6px; }

@media (max-width: 980px) {
  .app-shell { height: 100dvh !important; }
  .v17-sidebar {
    position: fixed !important; top: 0; left: 0; bottom: 0;
    width: 262px !important; height: 100% !important; z-index: 1200;
    transform: translateX(-100%); transition: transform .25s ease;
    box-shadow: 0 0 30px rgba(0,0,0,.35);
  }
  .v17-sidebar.mo { transform: translateX(0); }
  .v17-overlay { display: block; position: fixed; inset: 0; background: rgba(15,23,42,.5); z-index: 1100; }
  .v17-fab { display: inline-flex !important; }
  .v17-header { padding: 12px 14px !important; }
  .v17-content { padding: 14px 12px !important; }
  .v17-exam-card { padding: 16px 12px !important; border-radius: 12px !important; }
  .v17-question { padding: 14px 12px !important; margin-bottom: 18px !important; }
  .v17-title { font-size: 19px !important; }
  .v17-de-cuon { max-height: 62vh; padding: 10px !important; }
}

@media (max-width: 460px) {
  .v17-content { padding: 12px 8px !important; }
  .v17-exam-card { padding: 14px 10px !important; }
  .v17-question { padding: 12px 10px !important; }
}
`;

// =====================================================================
// DANH MỤC CHƯƠNG / BÀI — giữ đúng mã bài của Xưởng V15 (chuong1_bai1…)
// để học liệu và ngân hàng câu hỏi khớp nhau.
// =====================================================================
type ChuongHoc = { ma: string; so: string; ten: string; bai: string[][] };
// Chương trình Toán THPT (Kết nối tri thức) cho cả 3 khối, lấy đúng mã bài của Xưởng
// (khối 12 giữ mã cũ chuong1_bai1… để học liệu đã soạn không bị mất).
// LỖI CŨ: chỉ có chương trình lớp 12, nên học sinh lớp 10, 11 vào "Bài Cần Làm"
// cũng thấy "Chương I — Ứng dụng đạo hàm…" của lớp 12.
const CHUONG_TRINH_THEO_KHOI: Record<string, ChuongHoc[]> = {
  "10": [
    { ma: "k10_chuong1", so: "I", ten: "Mệnh đề và tập hợp", bai: [["k10_chuong1_bai1", "Bài 1: Mệnh đề"], ["k10_chuong1_bai2", "Bài 2: Tập hợp và các phép toán trên tập hợp"]] },
    { ma: "k10_chuong2", so: "II", ten: "Bất phương trình và hệ bất phương trình bậc nhất hai ẩn", bai: [["k10_chuong2_bai3", "Bài 3: Bất phương trình bậc nhất hai ẩn"], ["k10_chuong2_bai4", "Bài 4: Hệ bất phương trình bậc nhất hai ẩn"]] },
    { ma: "k10_chuong3", so: "III", ten: "Hệ thức lượng trong tam giác", bai: [["k10_chuong3_bai5", "Bài 5: Giá trị lượng giác của một góc từ 0° đến 180°"], ["k10_chuong3_bai6", "Bài 6: Hệ thức lượng trong tam giác"]] },
    { ma: "k10_chuong4", so: "IV", ten: "Vectơ", bai: [["k10_chuong4_bai7", "Bài 7: Các khái niệm mở đầu"], ["k10_chuong4_bai8", "Bài 8: Tổng và hiệu của hai vectơ"], ["k10_chuong4_bai9", "Bài 9: Tích của một vectơ với một số"], ["k10_chuong4_bai10", "Bài 10: Vectơ trong mặt phẳng tọa độ"], ["k10_chuong4_bai11", "Bài 11: Tích vô hướng của hai vectơ"]] },
    { ma: "k10_chuong5", so: "V", ten: "Các số đặc trưng của mẫu số liệu không ghép nhóm", bai: [["k10_chuong5_bai12", "Bài 12: Số gần đúng và sai số"], ["k10_chuong5_bai13", "Bài 13: Các số đặc trưng đo xu thế trung tâm"], ["k10_chuong5_bai14", "Bài 14: Các số đặc trưng đo độ phân tán"]] },
    { ma: "k10_chuong6", so: "VI", ten: "Hàm số, đồ thị và ứng dụng", bai: [["k10_chuong6_bai15", "Bài 15: Hàm số"], ["k10_chuong6_bai16", "Bài 16: Hàm số bậc hai"], ["k10_chuong6_bai17", "Bài 17: Dấu của tam thức bậc hai"], ["k10_chuong6_bai18", "Bài 18: Phương trình quy về phương trình bậc hai"]] },
    { ma: "k10_chuong7", so: "VII", ten: "Phương pháp tọa độ trong mặt phẳng", bai: [["k10_chuong7_bai19", "Bài 19: Phương trình đường thẳng"], ["k10_chuong7_bai20", "Bài 20: Vị trí tương đối giữa hai đường thẳng. Góc và khoảng cách"], ["k10_chuong7_bai21", "Bài 21: Đường tròn trong mặt phẳng tọa độ"], ["k10_chuong7_bai22", "Bài 22: Ba đường conic"]] },
    { ma: "k10_chuong8", so: "VIII", ten: "Đại số tổ hợp", bai: [["k10_chuong8_bai23", "Bài 23: Quy tắc đếm"], ["k10_chuong8_bai24", "Bài 24: Hoán vị, chỉnh hợp và tổ hợp"], ["k10_chuong8_bai25", "Bài 25: Nhị thức Newton"]] },
    { ma: "k10_chuong9", so: "IX", ten: "Tính xác suất theo định nghĩa cổ điển", bai: [["k10_chuong9_bai26", "Bài 26: Biến cố và định nghĩa cổ điển của xác suất"], ["k10_chuong9_bai27", "Bài 27: Thực hành tính xác suất theo định nghĩa cổ điển"]] },
  ],
  "11": [
    { ma: "k11_chuong1", so: "I", ten: "Hàm số lượng giác và phương trình lượng giác", bai: [["k11_chuong1_bai1", "Bài 1: Giá trị lượng giác của góc lượng giác"], ["k11_chuong1_bai2", "Bài 2: Công thức lượng giác"], ["k11_chuong1_bai3", "Bài 3: Hàm số lượng giác"], ["k11_chuong1_bai4", "Bài 4: Phương trình lượng giác cơ bản"]] },
    { ma: "k11_chuong2", so: "II", ten: "Dãy số. Cấp số cộng và cấp số nhân", bai: [["k11_chuong2_bai5", "Bài 5: Dãy số"], ["k11_chuong2_bai6", "Bài 6: Cấp số cộng"], ["k11_chuong2_bai7", "Bài 7: Cấp số nhân"]] },
    { ma: "k11_chuong3", so: "III", ten: "Các số đặc trưng đo xu thế trung tâm của mẫu số liệu ghép nhóm", bai: [["k11_chuong3_bai8", "Bài 8: Mẫu số liệu ghép nhóm"], ["k11_chuong3_bai9", "Bài 9: Các số đặc trưng đo xu thế trung tâm"]] },
    { ma: "k11_chuong4", so: "IV", ten: "Quan hệ song song trong không gian", bai: [["k11_chuong4_bai10", "Bài 10: Đường thẳng và mặt phẳng trong không gian"], ["k11_chuong4_bai11", "Bài 11: Hai đường thẳng song song"], ["k11_chuong4_bai12", "Bài 12: Đường thẳng và mặt phẳng song song"], ["k11_chuong4_bai13", "Bài 13: Hai mặt phẳng song song"], ["k11_chuong4_bai14", "Bài 14: Phép chiếu song song"]] },
    { ma: "k11_chuong5", so: "V", ten: "Giới hạn. Hàm số liên tục", bai: [["k11_chuong5_bai15", "Bài 15: Giới hạn của dãy số"], ["k11_chuong5_bai16", "Bài 16: Giới hạn của hàm số"], ["k11_chuong5_bai17", "Bài 17: Hàm số liên tục"]] },
    { ma: "k11_chuong6", so: "VI", ten: "Hàm số mũ và hàm số lôgarit", bai: [["k11_chuong6_bai18", "Bài 18: Lũy thừa với số mũ thực"], ["k11_chuong6_bai19", "Bài 19: Lôgarit"], ["k11_chuong6_bai20", "Bài 20: Hàm số mũ và hàm số lôgarit"], ["k11_chuong6_bai21", "Bài 21: Phương trình, bất phương trình mũ và lôgarit"]] },
    { ma: "k11_chuong7", so: "VII", ten: "Quan hệ vuông góc trong không gian", bai: [["k11_chuong7_bai22", "Bài 22: Hai đường thẳng vuông góc"], ["k11_chuong7_bai23", "Bài 23: Đường thẳng vuông góc với mặt phẳng"], ["k11_chuong7_bai24", "Bài 24: Phép chiếu vuông góc. Góc giữa đường thẳng và mặt phẳng"], ["k11_chuong7_bai25", "Bài 25: Hai mặt phẳng vuông góc"], ["k11_chuong7_bai26", "Bài 26: Khoảng cách"], ["k11_chuong7_bai27", "Bài 27: Thể tích"]] },
    { ma: "k11_chuong8", so: "VIII", ten: "Các quy tắc tính xác suất", bai: [["k11_chuong8_bai28", "Bài 28: Biến cố hợp, biến cố giao, biến cố độc lập"], ["k11_chuong8_bai29", "Bài 29: Công thức cộng xác suất"], ["k11_chuong8_bai30", "Bài 30: Công thức nhân xác suất cho hai biến cố độc lập"]] },
    { ma: "k11_chuong9", so: "IX", ten: "Đạo hàm", bai: [["k11_chuong9_bai31", "Bài 31: Định nghĩa và ý nghĩa của đạo hàm"], ["k11_chuong9_bai32", "Bài 32: Các quy tắc tính đạo hàm"], ["k11_chuong9_bai33", "Bài 33: Đạo hàm cấp hai"]] },
  ],
  "12": [
    { ma: "chuong1", so: "I", ten: "Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số", bai: [["chuong1_bai1", "Bài 1: Tính đơn điệu và cực trị của hàm số"], ["chuong1_bai2", "Bài 2: Giá trị lớn nhất và giá trị nhỏ nhất của hàm số"], ["chuong1_bai3", "Bài 3: Đường tiệm cận của đồ thị hàm số"], ["chuong1_bai4", "Bài 4: Khảo sát sự biến thiên và vẽ đồ thị của hàm số"], ["chuong1_bai5", "Bài 5: Ứng dụng đạo hàm để giải quyết một số vấn đề liên quan đến thực tiễn"]] },
    { ma: "chuong2", so: "II", ten: "Vectơ và hệ trục tọa độ trong không gian", bai: [["chuong2_bai6", "Bài 6: Vectơ trong không gian"], ["chuong2_bai7", "Bài 7: Hệ trục tọa độ trong không gian"], ["chuong2_bai8", "Bài 8: Biểu thức tọa độ của các phép toán vectơ"]] },
    { ma: "chuong3", so: "III", ten: "Các số đặc trưng đo mức độ phân tán của mẫu số liệu ghép nhóm", bai: [["chuong3_bai9", "Bài 9: Khoảng biến thiên và khoảng tứ phân vị"], ["chuong3_bai10", "Bài 10: Phương sai và độ lệch chuẩn"]] },
    { ma: "chuong4", so: "IV", ten: "Nguyên hàm và tích phân", bai: [["chuong4_bai11", "Bài 11: Nguyên hàm"], ["chuong4_bai12", "Bài 12: Tích phân"], ["chuong4_bai13", "Bài 13: Ứng dụng hình học của tích phân"]] },
    { ma: "chuong5", so: "V", ten: "Phương pháp tọa độ trong không gian", bai: [["chuong5_bai14", "Bài 14: Phương trình mặt phẳng"], ["chuong5_bai15", "Bài 15: Phương trình đường thẳng trong không gian"], ["chuong5_bai16", "Bài 16: Công thức tính góc trong không gian"], ["chuong5_bai17", "Bài 17: Phương trình mặt cầu"]] },
    { ma: "chuong6", so: "VI", ten: "Xác suất có điều kiện", bai: [["chuong6_bai18", "Bài 18: Xác suất có điều kiện"], ["chuong6_bai19", "Bài 19: Công thức xác suất toàn phần và công thức Bayes"]] },
  ],
};
const CHUONG_TRINH: ChuongHoc[] = CHUONG_TRINH_THEO_KHOI["12"];
const TEN_BAI: Record<string, string> = {};
Object.values(CHUONG_TRINH_THEO_KHOI).forEach((ds) => ds.forEach((c) => c.bai.forEach(([ma, ten]) => (TEN_BAI[ma] = ten))));

// Đoán khối từ tên lớp: "11B11" -> 11, "Toán 12A09" -> 12, "10CT2" -> 10. Không đoán được thì coi là 12.
function khoiCuaLop(ten: unknown): string | null {
  const m = String(ten || "").match(/(?:^|[^0-9])(1[0-2])(?![0-9])/);
  return m ? m[1] : null;
}
function khoiCuaHocSinh(classes: any[]): string {
  for (const c of classes || []) { const k = khoiCuaLop(c?.name); if (k) return k; }
  return "12";
}
const chuongTrinhKhoi = (khoi: string) => CHUONG_TRINH_THEO_KHOI[khoi] || CHUONG_TRINH;

// =====================================================================
// PHÂN LOẠI BÀI KIỂM TRA
// Giáo viên tự chọn loại ngay lúc phát bài. Đề phát từ trước khi có tính năng
// này không có sẵn thông tin đó, nên vẫn suy ra từ thời gian làm bài để không
// bài nào bị rơi mất khỏi danh sách của học sinh.
// =====================================================================
const NGUONG_15P = 20;
const NGUONG_NANGLUC = 90;

const DS_LOAI_BAI = [
  { ma: "kt15", ten: "Kiểm tra 15 phút", icon: "⏱️", phut: 15, mota: "Bài ngắn đầu giờ" },
  { ma: "kt1tiet", ten: "Kiểm tra 1 tiết", icon: "📄", phut: 45, mota: "Kiểm tra định kỳ" },
  { ma: "nangluc", ten: "Đánh giá năng lực", icon: "📈", phut: 90, mota: "Thi thử ĐGNL, thi thử TN" },
];
const TEN_LOAI_BAI: Record<string, string> = {};
DS_LOAI_BAI.forEach((x) => (TEN_LOAI_BAI[x.ma] = x.ten));

function loaiBaiKiemTra(e: any): "kt15" | "kt1tiet" | "nangluc" {
  const chon = String(e?.loaiBai || "");
  if (chon === "kt15" || chon === "kt1tiet" || chon === "nangluc") return chon;
  const p = Number(e?.durationMinutes) || 45;
  if (p <= NGUONG_15P) return "kt15";
  if (p >= NGUONG_NANGLUC) return "nangluc";
  return "kt1tiet";
}

const TEN_PHAN: Record<string, string> = { mcq: "Trắc nghiệm", tf: "Đúng – Sai", sa: "Trả lời ngắn", essay: "Tự luận" };
const THU_TU_PHAN = ["mcq", "tf", "sa", "essay"];

function demTungPhan(ds: any[]) {
  const d: Record<string, number> = { mcq: 0, tf: 0, sa: 0, essay: 0 };
  (ds || []).forEach((q) => { d[questionType(q)]++; });
  return d;
}

function toScale10(score: any, maxScore: any): number {
  const s = Number(score);
  const m = Number(maxScore);
  if (!Number.isFinite(s) || !Number.isFinite(m) || m <= 0) return 0;
  return (s / m) * 10;
}
const fmt10 = (score: any, maxScore: any) => toScale10(score, maxScore).toFixed(1);

const safeParse = <T,>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const download = (blobParts: BlobPart[], type: string, filename: string) => {
  const blob = new Blob(blobParts, { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  // LỖI CŨ: Firefox bỏ qua a.click() nếu thẻ <a> chưa được gắn vào DOM -> nút tải im lặng không làm gì
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 2000);
};

// ==========================================
// CẤU TRÚC MENU
// ==========================================
const V15_FEATURES = [
  "Nhập / Sửa Câu Hỏi",
  "Nạp Hàng Loạt (AI)",
  "Xưởng Ảnh → HTML",
  "Đề Tự Soạn",
  "Tạo Đề Bằng AI",
  "Thống Kê Ngân Hàng",
  "Lọc Câu Trùng",
  "Danh Mục Bài Học"
];

// Mỗi nút Xưởng mở thẳng đúng chức năng trong trang /v17.html.
const V15_TARGET: Record<string, string> = {
  "Nhập / Sửa Câu Hỏi": "manual",
  "Nạp Hàng Loạt (AI)": "bulk",
  "Xưởng Ảnh → HTML": "anhhtml",
  "Đề Tự Soạn": "dete",
  "Thống Kê Ngân Hàng": "stats",
  "Lọc Câu Trùng": "duplicates",
  "Danh Mục Bài Học": "curriculum",
};
const openXuong = (id?: string) => {
  if (id === "Tạo Đề Bằng AI") { window.open("/taode.html", "_blank"); return; }
  window.open("/v17.html" + (id && V15_TARGET[id] ? "#" + V15_TARGET[id] : ""), "_blank");
};

const TEACHER_GROUPS = [
  {
    title: "XƯỞNG BIÊN SOẠN (MỞ TAB RIÊNG)",
    items: V15_FEATURES.map((id) => ({
      id,
      icon:
        id === "Nhập / Sửa Câu Hỏi" ? "📝" :
        id === "Nạp Hàng Loạt (AI)" ? "🤖" :
        id === "Xưởng Ảnh → HTML" ? "🖼️" :
        id === "Đề Tự Soạn" ? "🗂️" :
        id === "Tạo Đề Bằng AI" ? "✨" :
        id === "Thống Kê Ngân Hàng" ? "📊" :
        id === "Lọc Câu Trùng" ? "🔍" : "📚"
    }))
  },
  {
    title: "HỆ THỐNG PHÁT ĐỀ ONLINE (V17)",
    items: [
      { id: "Studio đề", label: "Nạp Đề & Phát Bài", icon: "📤" },
      { id: "Lớp học", label: "Quản Lý Lớp Học", icon: "🏫" },
      { id: "Quản lý bài phát", label: "Quản Lý Bài Đã Phát", icon: "📋" },
      { id: "Học liệu", label: "Học Liệu Bài Học", icon: "📘" },
      { id: "Nhúng link", label: "Nhúng Link Bổ Sung", icon: "🔗" },
      { id: "Kết quả", label: "Bảng Điểm & Kết Quả", icon: "🎯" },
      { id: "Tổng quan", label: "Tổng Quan Hệ Thống", icon: "📈" },
      { id: "Sao lưu", label: "Bảo Mật & Sao Lưu", icon: "⚙️" }
    ]
  }
];

// Mục "Lớp Của Em" đã bỏ theo yêu cầu: ô nhập mã lớp chuyển vào ngay đầu
// "Bài Cần Làm" và chỉ hiện khi em chưa vào lớp nào, tên lớp thì hiện luôn
// dưới tên học sinh ở thanh bên nên không cần một trang riêng nữa.
const STUDENT_GROUPS = [
  {
    title: "KHÔNG GIAN HỌC TẬP",
    items: [
      { id: "Bài cần làm", label: "Bài Cần Làm", icon: "📝" },
      { id: "Kết quả", label: "Kết Quả Học Tập", icon: "🎯" },
      { id: "Năng lực", label: "Đánh Giá Năng Lực", icon: "📈" }
    ]
  }
];

// ==========================================
// HIỂN THỊ CÔNG THỨC TOÁN
// ==========================================
const MathText = memo(
  function MathText({ html, style, className }: { html: string; style?: React.CSSProperties; className?: string }) {
    const ref = useRef<HTMLSpanElement>(null);
    const rendered = useRef<string | null>(null);

    useEffect(() => {
      let mounted = true;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const tryTypeset = () => {
        if (!mounted || !ref.current) return;
        if (rendered.current !== html) {
          ref.current.innerHTML = html;
          rendered.current = html;
          veHinhToan(ref.current);   // dựng bảng biến thiên / bảng xét dấu / đồ thị
        }
        const MathJax = (window as any).MathJax;
        if (MathJax && typeof MathJax.typesetPromise === "function") {
          MathJax.typesetPromise([ref.current]).catch(() => {});
        } else {
          timer = setTimeout(tryTypeset, 200);
        }
      };

      tryTypeset();
      return () => {
        mounted = false;
        if (timer) clearTimeout(timer);
      };
    }, [html]);

    return <span ref={ref} style={style} className={className} />;
  },
  (prev, next) => prev.html === next.html
);

const StudentOptionItem = memo(
  function StudentOptionItem({ o, j, examId, qId, isChecked, onAnswerChange }: any) {
    return (
      <label style={{ display: "flex", alignItems: "flex-start", gap: "12px", cursor: "pointer", background: isChecked ? "#eff6ff" : "#fff", padding: "10px 14px", borderRadius: "8px", border: "1px solid", borderColor: isChecked ? "#3b82f6" : "#cbd5e1", transition: "background 0.15s ease, border-color 0.15s ease" }}>
        <input type="radio" name={`${examId}-${qId}`} style={{ marginTop: "4px", width: "18px", height: "18px", accentColor: "#2563eb" }} checked={isChecked} onChange={() => onAnswerChange(examId, qId, String(j))} />
        <MathText html={`<b>${String.fromCharCode(65 + j)}.</b> ${o}`} style={{ fontSize: "16px", lineHeight: "1.5" }} />
      </label>
    );
  },
  (prev, next) => prev.isChecked === next.isChecked && prev.o === next.o
);

// Đáp án Đúng/Sai được mã hóa thành chuỗi 4 ký tự: 'T' = đúng, 'F' = sai, '-' = chưa chọn.
// Ví dụ "TF-T" nghĩa là ý a Đúng, ý b Sai, ý c bỏ trống, ý d Đúng.
const TF_EMPTY = "----";
const tfCharAt = (val: string, j: number) => (val || TF_EMPTY)[j] || "-";
const tfSetChar = (val: string, j: number, ch: string) => {
  const arr = (val || TF_EMPTY).padEnd(4, "-").slice(0, 4).split("");
  arr[j] = ch;
  return arr.join("");
};

// LỖI CŨ NGHIÊM TRỌNG: mỗi ý a) b) c) d) nhận nguyên chuỗi answerValue rồi tự ghép lại.
// React.memo lại bỏ qua việc vẽ lại những ý không đổi, nên các ý đó vẫn giữ chuỗi CŨ
// trong bộ nhớ. Chọn ý a) xong bấm sang ý b) là ý b) ghi đè bằng chuỗi cũ "----"
// -> lựa chọn của ý a) biến mất. Nay mỗi ý chỉ nhận đúng ký tự của mình,
// việc ghép chuỗi chuyển hết về handleTfChange và luôn đọc trạng thái mới nhất.
const StudentTrueFalseItem = memo(
  function StudentTrueFalseItem({ s, j, examId, qId, cur, onTfChange }: any) {
    const nut = (ch: string, nhan: string, mau: string) => (
      <button
        type="button"
        onClick={() => onTfChange(examId, qId, j, ch)}
        style={{
          padding: "8px 18px", borderRadius: "8px", fontWeight: "bold", fontSize: "14px", cursor: "pointer",
          border: cur === ch ? `2px solid ${mau}` : "1px solid #cbd5e1",
          background: cur === ch ? mau : "#fff",
          color: cur === ch ? "#fff" : "#475569",
          minWidth: "72px"
        }}
      >
        {nhan}
      </button>
    );
    return (
      <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "10px 14px", background: "#fff", borderRadius: "8px", border: "1px solid #cbd5e1", flexWrap: "wrap" }}>
        <MathText html={`<b>${String.fromCharCode(97 + j)})</b> ${s?.t ?? s ?? ""}`} style={{ fontSize: "16px", lineHeight: "1.5", flex: "1 1 260px" }} />
        <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
          {nut("T", "Đúng", "#10b981")}
          {nut("F", "Sai", "#ef4444")}
        </div>
      </div>
    );
  },
  (prev, next) => prev.cur === next.cur && prev.s === next.s
);

const StudentQuestionItem = memo(
  function StudentQuestionItem({ q, i, examId, answerValue, onAnswerChange, onTfChange }: any) {
    const loai = questionType(q);
    return (
      <div className="v17-question" style={{ marginBottom: "28px", padding: "20px", background: "#f8fafc", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
        <div style={{ fontSize: "17px", fontWeight: "bold", color: "#1e293b", marginBottom: "16px", lineHeight: "1.6" }}>
          Câu {i + 1}. <MathText html={q.q || ""} />
        </div>
        {loai === "mcq" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginLeft: "10px" }}>
            {(q.opts || []).map((o: string, j: number) => (
              <StudentOptionItem key={j} o={o} j={j} examId={examId} qId={q.id} isChecked={answerValue === String(j)} onAnswerChange={onAnswerChange} />
            ))}
          </div>
        )}
        {/* LỖI CŨ: dạng Đúng/Sai 4 ý hoàn toàn không có giao diện, bị rơi xuống ô nhập text */}
        {loai === "tf" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginLeft: "10px" }}>
            {(q.stmts || []).slice(0, 4).map((s: any, j: number) => (
              <StudentTrueFalseItem key={j} s={s} j={j} examId={examId} qId={q.id} cur={tfCharAt(answerValue, j)} onTfChange={onTfChange} />
            ))}
          </div>
        )}
        {loai === "sa" && (
          <div style={{ marginTop: "10px" }}>
            <input
              inputMode="decimal"
              autoComplete="off"
              maxLength={GIOI_HAN_TRA_LOI_NGAN}
              style={{ width: "100%", maxWidth: "220px", padding: "14px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "18px", fontWeight: "bold", letterSpacing: "2px", background: "#fff", textAlign: "center" }}
              placeholder="Đáp số"
              value={answerValue || ""}
              onChange={(x) => onAnswerChange(examId, q.id, chuanHoaTraLoiNgan(x.target.value))}
            />
            <div style={{ fontSize: "12px", color: (answerValue || "").length >= GIOI_HAN_TRA_LOI_NGAN ? "#b45309" : "#64748b", marginTop: "6px" }}>
              Tối đa {GIOI_HAN_TRA_LOI_NGAN} ký tự · chỉ nhập số, dấu phẩy thập phân và dấu trừ ({(answerValue || "").length}/{GIOI_HAN_TRA_LOI_NGAN})
            </div>
          </div>
        )}
        {loai === "essay" && (
          <div style={{ marginTop: "10px" }}>
            <div style={{ fontSize: "13px", color: "#7c3aed", fontWeight: "bold", marginBottom: "8px" }}>
              ✍️ Câu tự luận{q.tongDiem ? ` · ${q.tongDiem} điểm` : ""} — trình bày rõ từng bước để được chấm đủ ý.
            </div>
            <textarea
              rows={8}
              maxLength={6000}
              style={{ width: "100%", padding: "14px", borderRadius: "8px", border: "1px solid #c4b5fd", fontSize: "16px", lineHeight: "1.6", background: "#fff", fontFamily: "inherit", resize: "vertical" }}
              placeholder={"Trình bày lời giải...\nMẹo: viết công thức theo kiểu $y' = ...$ để hệ thống hiểu đúng."}
              value={answerValue || ""}
              onChange={(x) => onAnswerChange(examId, q.id, x.target.value)}
            />
            <div style={{ fontSize: "12px", color: "#64748b", marginTop: "6px" }}>{(answerValue || "").length}/6000 ký tự</div>
          </div>
        )}
      </div>
    );
  },
  (prev, next) => prev.answerValue === next.answerValue && prev.q === next.q
);

// ==========================================
// THANH THẺ: Bài kiểm tra · Chương I · Chương II · …
// ==========================================
function ThanhTabHocTap({ tab, setTab, khoa, dem, chuongTrinh }: any) {
  const the = (id: string, nhan: string, phu: string, bịKhoa: boolean) => {
    const dang = tab === id;
    return (
      <button
        key={id}
        onClick={() => { if (bịKhoa) { alert("Em đang có bài kiểm tra chưa nộp. Nộp bài xong mới mở được phần học liệu nhé!"); return; } setTab(id); }}
        style={{
          flex: "0 0 auto", minWidth: "132px", padding: "10px 16px", borderRadius: "10px", cursor: bịKhoa ? "not-allowed" : "pointer",
          border: dang ? "2px solid #1e3a8a" : "1px solid #cbd5e1",
          background: dang ? "#1e3a8a" : bịKhoa ? "#f1f5f9" : "#fff",
          color: dang ? "#fff" : bịKhoa ? "#94a3b8" : "#1e293b",
          fontWeight: "bold", textAlign: "left", transition: "all .15s",
        }}
      >
        <div style={{ fontSize: "15px" }}>{bịKhoa ? "🔒 " : ""}{nhan}</div>
        <div style={{ fontSize: "11px", fontWeight: 600, opacity: 0.75, marginTop: "2px" }}>{phu}</div>
      </button>
    );
  };

  return (
    <div style={{ display: "flex", gap: "10px", overflowX: "auto", paddingBottom: "10px", marginBottom: "18px" }}>
      {the("kt15", "Kiểm tra 15 phút", `${dem.kt15 || 0} bài`, false)}
      {the("kt1tiet", "Kiểm tra 1 tiết", `${dem.kt1tiet || 0} bài`, false)}
      {((chuongTrinh || CHUONG_TRINH) as ChuongHoc[]).map((c) => the(c.ma, `Chương ${c.so}`, `${c.bai.length} bài`, !!khoa))}
    </div>
  );
}

// ==========================================
// KHÔNG GIAN MỘT CHƯƠNG
// Bấm chương → danh sách bài; bấm một bài → ba mục học; bấm "Kiến thức
// trọng tâm" → nội dung bài học hiện ra ngay trong khung màu xanh bên dưới.
// ==========================================
function KhongGianChuong({ maChuong, hocLieu, triggerMath, laHocSinh, chuongTrinh }: any) {
  const [baiMo, setBaiMo] = useState<string | null>(null);
  const [mucMo, setMucMo] = useState<string | null>(null);
  // Nhớ những bài đã ghi trong phiên này, để em mở ra đóng vào liên tục
  // không bị đếm thành mười lượt.
  const daGhiRef = useRef<Set<string>>(new Set());

  const chuong = ((chuongTrinh || CHUONG_TRINH) as ChuongHoc[]).find((c) => c.ma === maChuong);

  useEffect(() => { setBaiMo(null); setMucMo(null); }, [maChuong]);

  /* =====================================================================
     GHI NHẬN HỌC SINH VÀO HỌC LIỆU
     Gọi thẳng fetch chứ không dùng act(): act() tải lại toàn bộ dữ liệu sau
     mỗi lần gọi, mà đây chỉ là ghi thầm một dòng — tải lại cả bảng điểm mỗi
     lần em mở một bài là quá tốn.
     Lỗi mạng thì bỏ qua trong im lặng: hỏng phần thống kê của thầy cô còn hơn
     chắn màn hình học sinh đang học.
     ===================================================================== */
  useEffect(() => {
    if (!laHocSinh || !baiMo) return;
    if (daGhiRef.current.has(baiMo)) return;
    daGhiRef.current.add(baiMo);
    fetch("/api/v17", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "ghiLuotHocLieu", tag: baiMo }),
      keepalive: true,
    }).catch(() => {});
  }, [baiMo, laHocSinh]);

  /* =====================================================================
     ĐO THỜI GIAN EM Ở TRONG MỘT BÀI

     CHỈ ĐẾM KHI TAB ĐANG HIỆN. Em chuyển sang tab khác, thu nhỏ trình duyệt
     hay khoá máy là đồng hồ dừng ngay; quay lại thì chạy tiếp. Không làm vậy
     thì em nào mở bài rồi đi ăn cơm sẽ thành "học hai tiếng", con số vô nghĩa
     mà thầy cô lại tưởng thật.

     GỬI TỪNG ĐOẠN, KHÔNG GỬI TỔNG. Mỗi lần chỉ báo khoảng vừa trôi qua rồi
     đặt lại đồng hồ. Mất một lần gửi (rớt mạng, tắt máy đột ngột) chỉ hụt
     đúng đoạn đó chứ không sai toàn bộ.

     LÚC RỜI TRANG dùng navigator.sendBeacon: trình duyệt đang đóng thì fetch
     thường bị huỷ giữa chừng, còn sendBeacon được cam kết gửi xong.
     ===================================================================== */
  const dongHoRef = useRef<{ tag: string; batDau: number } | null>(null);

  const guiThoiGian = useCallback((dungBeacon = false) => {
    const dh = dongHoRef.current;
    dongHoRef.current = null;
    if (!dh) return;
    const giay = Math.round((Date.now() - dh.batDau) / 1000);
    if (giay < 5) return;                       // dưới 5 giây coi như bấm nhầm
    const goi = JSON.stringify({ action: "ghiThoiGianHocLieu", tag: dh.tag, giay });
    try {
      if (dungBeacon && navigator.sendBeacon) {
        navigator.sendBeacon("/api/v17", new Blob([goi], { type: "application/json" }));
      } else {
        fetch("/api/v17", { method: "POST", headers: { "content-type": "application/json" }, body: goi, keepalive: true }).catch(() => {});
      }
    } catch { /* hỏng phần thống kê còn hơn chắn màn hình em đang học */ }
  }, []);

  useEffect(() => {
    if (!laHocSinh) return;

    // Bắt đầu bấm giờ khi có bài đang mở và tab đang hiện.
    if (baiMo && document.visibilityState === "visible") {
      dongHoRef.current = { tag: baiMo, batDau: Date.now() };
    }

    const doiTrangThaiTab = () => {
      if (document.visibilityState === "hidden") guiThoiGian();
      else if (baiMo && !dongHoRef.current) dongHoRef.current = { tag: baiMo, batDau: Date.now() };
    };
    const roiTrang = () => guiThoiGian(true);

    document.addEventListener("visibilitychange", doiTrangThaiTab);
    window.addEventListener("pagehide", roiTrang);

    return () => {
      document.removeEventListener("visibilitychange", doiTrangThaiTab);
      window.removeEventListener("pagehide", roiTrang);
      guiThoiGian();   // đóng bài hoặc chuyển sang bài khác thì chốt đoạn vừa rồi
    };
  }, [baiMo, laHocSinh, guiThoiGian]);
  useEffect(() => { if (mucMo === "kienthuc" || mucMo === "sodotuduy") triggerMath(); }, [mucMo, baiMo, triggerMath]);

  if (!chuong) return null;

  const layHL = (tag: string) => (hocLieu || []).find((h: any) => h.tag === tag) || {};

  const nutMuc = (id: string, icon: string, nhan: string, mota: string, co: boolean) => (
    <button
      onClick={() => setMucMo(mucMo === id ? null : id)}
      style={{
        display: "flex", alignItems: "center", gap: "14px", width: "100%", textAlign: "left",
        padding: "14px 16px", borderRadius: "10px", cursor: "pointer", marginBottom: "8px",
        border: mucMo === id ? "2px solid #10b981" : "1px solid #cbd5e1",
        background: mucMo === id ? "#f0fdf4" : "#fff",
      }}
    >
      <span style={{ fontSize: "24px" }}>{icon}</span>
      <span style={{ flex: 1 }}>
        <span style={{ display: "block", fontWeight: "bold", color: "#1e293b", fontSize: "15px" }}>{nhan}</span>
        <span style={{ display: "block", fontSize: "13px", color: co ? "#64748b" : "#b45309" }}>{co ? mota : "Thầy cô chưa soạn phần này"}</span>
      </span>
      <span style={{ color: "#94a3b8", fontWeight: "bold" }}>{mucMo === id ? "▲" : "▼"}</span>
    </button>
  );

  // Mỗi mục chứa một danh sách liên kết, mở ra ngay dưới nút chứ không nhảy đi luôn.
  const khungLink = (ds: any[]) => (
    <div style={{ marginTop: "6px", marginBottom: "8px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "12px", padding: "14px" }}>
      {!ds.length && <p style={{ margin: 0, color: "#166534" }}>Thầy cô chưa gắn liên kết nào cho mục này.</p>}
      {ds.map((l: any, i: number) => (
        <a
          key={i} href={l.url} target="_blank" rel="noopener noreferrer"
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", padding: "12px 14px", background: "#fff", border: "1px solid #bbf7d0", borderRadius: "8px", marginBottom: i === ds.length - 1 ? 0 : "8px", textDecoration: "none", color: "#14532d", fontWeight: "bold" }}
        >
          <span>{l.ten}</span>
          <span style={{ color: "#10b981" }}>↗</span>
        </a>
      ))}
    </div>
  );

  return (
    <div>
      <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "12px", padding: "16px 20px", marginBottom: "18px" }}>
        <div style={{ fontSize: "12px", fontWeight: "bold", color: "#3b82f6", textTransform: "uppercase", letterSpacing: "0.5px" }}>Chương {chuong.so}</div>
        <h2 style={{ margin: "4px 0 0", fontSize: "19px", color: "#1e3a8a" }}>{chuong.ten}</h2>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {chuong.bai.map(([tag, ten]) => {
          const mo = baiMo === tag;
          const hl = layHL(tag);
          const coKienThuc = !!String(hl.kienThuc || "").trim();
          const coSoDoTuDuy = !!String(hl.soDoTuDuy || "").trim();
          const dsGame = hl.gameLinks || [];
          const dsVideo = hl.videoLinks || [];
          const coLuyenTap = !!String(hl.luyenTap || "").trim();

          return (
            <article key={tag} style={{ background: "#fff", border: mo ? "2px solid #1e3a8a" : "1px solid #cbd5e1", borderRadius: "12px", overflow: "hidden" }}>
              <button
                onClick={() => { const sang = mo ? null : tag; setBaiMo(sang); setMucMo(null); }}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", width: "100%", padding: "16px 20px", background: mo ? "#f8fafc" : "#fff", border: "none", cursor: "pointer", textAlign: "left" }}
              >
                <span style={{ fontWeight: "bold", color: "#1e293b", fontSize: "16px" }}>{ten}</span>
                <span style={{ color: "#94a3b8", fontSize: "18px", flexShrink: 0 }}>{mo ? "▲" : "▼"}</span>
              </button>

              {mo && (
                <div style={{ padding: "0 20px 20px" }}>
                  {nutMuc("kienthuc", "📘", "Kiến thức trọng tâm", "Tóm tắt lý thuyết và công thức cần nhớ", coKienThuc)}
                  {mucMo === "kienthuc" && (
                    <div style={{ marginTop: "6px", marginBottom: "8px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "12px", padding: "20px" }}>
                      {coKienThuc ? (
                        <MathText html={hl.kienThuc} style={{ fontSize: "16px", lineHeight: "1.75", color: "#14532d" }} />
                      ) : (
                        <p style={{ margin: 0, color: "#166534" }}>Thầy cô chưa soạn kiến thức trọng tâm cho bài này.</p>
                      )}
                    </div>
                  )}

                  {nutMuc("sodotuduy", "🧠", "Sơ đồ tư duy", "Bản đồ tổng quan kiến thức của bài", coSoDoTuDuy)}
                  {mucMo === "sodotuduy" && (
                    <div style={{ marginTop: "6px", marginBottom: "8px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "12px", padding: "20px" }}>
                      {coSoDoTuDuy ? (
                        <MathText html={hl.soDoTuDuy} style={{ fontSize: "16px", lineHeight: "1.75", color: "#14532d" }} />
                      ) : (
                        <p style={{ margin: 0, color: "#166534" }}>Thầy cô chưa soạn sơ đồ tư duy cho bài này.</p>
                      )}
                    </div>
                  )}

                  {nutMuc("game", "🎮", "Game tương tác", `${dsGame.length} liên kết`, dsGame.length > 0)}
                  {mucMo === "game" && khungLink(dsGame)}

                  {nutMuc("video", "🎬", "Video bài giảng", `${dsVideo.length} video`, dsVideo.length > 0)}
                  {mucMo === "video" && khungLink(dsVideo)}

                  {nutMuc("luyentap", "✏️", "Luyện tập", "Bài tập vận dụng phần kiến thức ở trên", coLuyenTap)}
                  {mucMo === "luyentap" && (
                    <div style={{ marginTop: "6px", marginBottom: "8px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "12px", padding: "20px" }}>
                      {coLuyenTap
                        ? <MathText html={hl.luyenTap} style={{ fontSize: "16px", lineHeight: "1.75", color: "#14532d" }} />
                        : <p style={{ margin: 0, color: "#166534" }}>Thầy cô chưa soạn bài luyện tập cho bài này.</p>}
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}

// Bảng cấu trúc đề: cho học sinh biết đề có mấy phần, mỗi phần bao nhiêu câu,
// giống dòng đầu của một đề thi giấy.
function BangCauTruc({ qs }: any) {
  const dem = demTungPhan(qs || []);
  const co = THU_TU_PHAN.filter((k) => dem[k] > 0);
  if (!co.length) return null;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "14px" }}>
      {co.map((k, i) => (
        <div key={k} style={{ flex: "1 1 130px", border: "1px solid #cbd5e1", borderRadius: "8px", padding: "8px 12px", background: "#f8fafc", textAlign: "center" }}>
          <div style={{ fontSize: "11px", fontWeight: "bold", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Phần {["I", "II", "III", "IV"][i]}
          </div>
          <div style={{ fontSize: "14px", fontWeight: "bold", color: "#1e3a8a" }}>{TEN_PHAN[k]}</div>
          <div style={{ fontSize: "13px", color: "#475569" }}>{dem[k]} câu</div>
        </div>
      ))}
    </div>
  );
}

function ExamTimer({ endTime, onTimeOut }: { endTime: number; onTimeOut: () => void }) {
  const [timeLeft, setTimeLeft] = useState("");
  const firedRef = useRef(false);
  const cbRef = useRef(onTimeOut);

  useEffect(() => {
    cbRef.current = onTimeOut;
  });

  useEffect(() => {
    firedRef.current = false;
    // LỖI CŨ: `let id` được dùng bên trong tick() trước khi setInterval gán giá trị
    const idRef: { current: ReturnType<typeof setInterval> | null } = { current: null };
    const stop = () => { if (idRef.current) clearInterval(idRef.current); };

    const tick = () => {
      const diff = endTime - Date.now();
      if (diff <= 0) {
        setTimeLeft("00:00 (Hết giờ)");
        stop();
        if (!firedRef.current) {
          firedRef.current = true;
          cbRef.current?.();
        }
        return;
      }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`);
    };

    idRef.current = setInterval(tick, 1000);
    tick();
    return stop;
  }, [endTime]);

  return (
    <div style={{ background: "#fee2e2", color: "#b91c1c", padding: "8px 16px", borderRadius: "8px", fontWeight: "bold", fontSize: "16px", border: "1px solid #fca5a5" }}>
      ⏱️ Còn lại: {timeLeft || "--:--"}
    </div>
  );
}

export default function Dashboard({ initialUser, logoutAction, changePasswordAction, resetPasswordAction, setSharedPasswordAction, resetTeacherPwdAction, isAdmin }: any) {
  const [data, setData] = useState<Data>({ user: { ...initialUser, role: initialUser.role || null }, classes: [], exams: [], attempts: [], hocLieu: [], links: [] });
  const [active, setActive] = useState(initialUser?.role === "student" ? "Bài cần làm" : "Studio đề");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [answers, setAnswers] = useState<Record<string, Record<string, string>>>({});
  const [menuMo, setMenuMo] = useState(false);

  const roleSyncedRef = useRef(false);
  const loadRef = useRef<() => Promise<void>>(async () => {});

  const act = useCallback(async (payload: Record<string, unknown>, silent = false) => {
    setBusy(true);
    try {
      const r = await fetch("/api/v17", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const j = await r.json();
      if (!silent) {
        setNote(r.ok ? (j.score !== undefined ? `Đã nộp: ${j.score}/${j.maxScore} điểm.` : "Đã thao tác thành công.") : j.error || "Thao tác thất bại.");
      }
      if (r.ok) await loadRef.current();
      return j;
    } catch {
      setNote("Đã xảy ra lỗi mạng. Kiểm tra kết nối rồi thử lại.");
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/v17", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) {
        setNote(j.error || "Không tải được dữ liệu.");
        return;
      }
      if (initialUser.role && j.user?.role !== initialUser.role && !roleSyncedRef.current) {
        roleSyncedRef.current = true;
        await act({ action: "setRole", role: initialUser.role, name: initialUser.name }, true);
        return;
      }
      setData(j);
    } catch {
      setNote("Không thể kết nối đến máy chủ.");
    }
  }, [act, initialUser.role, initialUser.name]);

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    load();
  }, [load]);

  // Không có thẻ viewport thì điện thoại vẽ trang theo khổ máy tính rồi thu nhỏ lại,
  // chữ bé đến mức không đọc được. Thêm sẵn ở đây để chắc chắn luôn có.
  useEffect(() => {
    let meta = document.querySelector('meta[name="viewport"]') as HTMLMetaElement | null;
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "viewport";
      document.head.appendChild(meta);
    }
    meta.content = "width=device-width, initial-scale=1, viewport-fit=cover";
  }, []);

  useEffect(() => {
    setMenuMo(false);
  }, [active]);

  useEffect(() => {
    if (!document.getElementById("mathjax-script")) {
      (window as any).MathJax = { tex: { inlineMath: [["$", "$"], ["\\(", "\\)"]], displayMath: [["$$", "$$"], ["\\[", "\\]"]] }, startup: { typeset: false } };
      const script = document.createElement("script");
      script.id = "mathjax-script";
      script.src = "https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-mml-chtml.js";
      script.async = true;
      document.head.appendChild(script);
    }
  }, []);

  const triggerMath = useCallback(() => {
    setTimeout(() => {
      if ((window as any).MathJax?.typesetPromise) (window as any).MathJax.typesetPromise().catch(() => {});
      if ((window as any).MathViz?.renderAll) (window as any).MathViz.renderAll();
    }, 100);
  }, []);

  useEffect(() => {
    triggerMath();
  }, [active, data, triggerMath]);

  if (!data.user.role)
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "#1e3a8a", fontWeight: "bold", fontSize: "18px" }}>Đang đồng bộ phân quyền an toàn...</div>;

  const teacher = data.user.role === "teacher";
  const groups = teacher ? TEACHER_GROUPS : STUDENT_GROUPS;

  return (
    <div className="app-shell" style={{ display: "flex", height: "100vh", overflow: "hidden", background: "#f8fafc" }}>
      <style dangerouslySetInnerHTML={{ __html: CSS_GIAO_DIEN }} />
      {menuMo && <div className="v17-overlay" onClick={() => setMenuMo(false)} />}
      <aside className={`v17-sidebar${menuMo ? " mo" : ""}`} style={{ width: "270px", background: "#153d8a", color: "#fff", display: "flex", flexDirection: "column", height: "100vh", overflowY: "auto", flexShrink: 0, borderRight: "1px solid #1e3a8a" }}>
        <div style={{ padding: "24px 20px", textAlign: "center", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
          <p style={{ color: "#fbbf24", fontSize: "14px", fontWeight: "bold", margin: "12px 0 0", textTransform: "uppercase" }}>{teacher ? (isAdmin ? "QUẢN TRỊ" : "GIÁO VIÊN") : "HỌC SINH"} : {data.user.name}</p>
          {!teacher && (
            <p style={{ color: "#bfdbfe", fontSize: "13px", fontWeight: "bold", margin: "6px 0 0" }}>
              LỚP : {(data.classes || []).map((c: any) => c.name).join(", ") || "chưa vào lớp"}
            </p>
          )}
        </div>

        <nav style={{ padding: "16px 12px", flex: 1, display: "flex", flexDirection: "column", gap: "20px" }}>
          {groups.map((g) => (
            <div key={g.title}>
              <div style={{ color: "#93c5fd", fontSize: "12px", fontWeight: 900, textTransform: "uppercase", marginBottom: "8px", paddingLeft: "8px", letterSpacing: "0.5px" }}>{g.title}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {g.items.map((item: any) => {
                  const isActive = active === item.id;
                  const isV15 = V15_FEATURES.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        if (isV15) openXuong(item.id);
                        else setActive(item.id);
                      }}
                      style={{ display: "flex", alignItems: "center", gap: "12px", width: "100%", padding: "10px 14px", borderRadius: "8px", border: isActive ? "1px solid #60a5fa" : "1px solid transparent", background: isActive ? "#2563eb" : "transparent", color: "#fff", fontSize: "14px", fontWeight: isActive ? "bold" : 600, cursor: "pointer", textAlign: "left", transition: "all 0.2s" }}
                    >
                      <span style={{ fontSize: "18px" }}>{item.icon}</span>
                      {item.label || item.id}
                      {isV15 && <span style={{ marginLeft: "auto", fontSize: "12px", opacity: 0.6 }}>↗</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div style={{ padding: "20px", borderTop: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.1)" }}>
          <p style={{ color: "#93c5fd", fontSize: "12px", margin: "0 0 12px 0", textAlign: "center" }}>Cloud DB: {data.exams?.length || 0} bài · an toàn</p>
          <button
            onClick={async () => {
              if (logoutAction) {
                await logoutAction();
                window.location.href = "/";
              }
            }}
            style={{ width: "100%", padding: "10px", background: "transparent", border: "1px solid #3b82f6", color: "#fff", fontWeight: "bold", borderRadius: "8px", cursor: "pointer", fontSize: "15px", transition: "0.2s" }}
          >
            Đăng Xuất
          </button>
        </div>
      </aside>

      <main className="workspace v17-main" style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
        <header className="v17-header" style={{ padding: "20px 40px", borderBottom: "1px solid #e2e8f0", background: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
          <button
            className="v17-fab"
            aria-label="Mở menu"
            onClick={() => setMenuMo(true)}
            style={{ alignItems: "center", justifyContent: "center", width: "42px", height: "42px", flexShrink: 0, borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff", fontSize: "20px", cursor: "pointer", lineHeight: 1 }}
          >
            ☰
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="eyebrow" style={{ fontSize: "12px", color: "#64748b", fontWeight: "bold", letterSpacing: "1px", marginBottom: "4px", textTransform: "uppercase" }}>NĂM HỌC 2026–2027</p>
            <h1 style={{ margin: 0, color: "#1e293b", fontSize: "24px" }}>{active}</h1>
          </div>
          <div className="header-actions" style={{ display: "flex", gap: "15px", alignItems: "center" }}>
            <span style={{ color: "#10b981", fontSize: "13px", fontWeight: "bold" }}>● Đã đồng bộ</span>
            <button style={{ padding: "8px 16px", borderRadius: "6px", border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", fontWeight: "bold" }} onClick={() => window.print()}>Xuất PDF</button>
          </div>
        </header>

        <div className="v17-content" style={{ padding: "30px 40px", flex: 1, minWidth: 0 }}>
          {note && (
            <div className="notice" style={{ padding: "12px 16px", background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1e3a8a", borderRadius: "8px", marginBottom: "20px", display: "flex", justifyContent: "space-between", fontWeight: "bold" }}>
              {note}
              <button style={{ border: "none", background: "none", cursor: "pointer", fontSize: "16px" }} onClick={() => setNote("")}>×</button>
            </div>
          )}

          {teacher ? (
            <Teacher active={active} data={data} busy={busy} act={act} triggerMath={triggerMath} changePasswordAction={changePasswordAction} resetPasswordAction={resetPasswordAction} setSharedPasswordAction={setSharedPasswordAction} resetTeacherPwdAction={resetTeacherPwdAction} isAdmin={isAdmin} />
          ) : (
            <Student active={active} data={data} busy={busy} act={act} answers={answers} setAnswers={setAnswers} triggerMath={triggerMath} />
          )}
        </div>
      </main>
    </div>
  );
}

// ==========================================
// KHU VỰC GIÁO VIÊN
// ==========================================
function Teacher({ active, data, busy, act, triggerMath, changePasswordAction, resetPasswordAction, setSharedPasswordAction, resetTeacherPwdAction, isAdmin }: any) {
  const [name, setName] = useState("");
  const [exam, setExam] = useState({ classId: "", duration: 45 });
  const [previewData, setPreviewData] = useState<any>(null);
  // LỖI CŨ: khởi tạo null nhưng bên dưới đọc previewMeta.showScore / .numVersions
  // -> chỉ cần một luồng state lệch nhau là trắng trang. Cho giá trị mặc định đầy đủ.
  // scTl = 0 nghĩa là phần tự luận giữ nguyên barem đã soạn trong Xưởng V15.
  const [previewMeta, setPreviewMeta] = useState<any>({ classId: "", duration: 45, title: "", showScore: true, numVersions: 45, loaiBai: "kt1tiet", scMcq: 0.25, scTf: 1, scSa: 0.5, scTl: 0 });
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<any>(null);
  const [selectedClassToDelete, setSelectedClassToDelete] = useState("");
  const [locLoaiBai, setLocLoaiBai] = useState("all");

  const [newLinkName, setNewLinkName] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  // Danh sách cũ còn sót trong trình duyệt máy này, chờ đưa lên máy chủ.
  const [linkCu, setLinkCu] = useState<{ name: string; url: string }[]>([]);

  useEffect(() => {
    if (previewData) triggerMath();
  }, [previewData, editIdx, triggerMath]);

  /* =====================================================================
     NHÚNG LINK BỔ SUNG — nay lưu trên máy chủ
     Trước kia danh sách nằm trong localStorage nên mỗi máy một kiểu: thầy cô
     thêm link ở máy bàn thì máy xách tay không thấy gì.
     Đoạn dưới chỉ ĐỌC phần cũ còn sót trong trình duyệt để mời đưa lên, chứ
     không tự ý gửi đi. Đưa lên xong mới xoá bản trong máy — xoá trước mà lỗi
     mạng thì mất trắng.
     ===================================================================== */
  useEffect(() => {
    const cu = safeParse<{ name: string; url: string }[]>(localStorage.getItem("v17_teacher_links"), []);
    setLinkCu(Array.isArray(cu) ? cu.filter((x) => x && x.url) : []);
  }, []);

  const dayLinkCuLen = async () => {
    const j = await act({ action: "themLienKet", links: linkCu }, true);
    if (j?.ok) {
      try { localStorage.removeItem("v17_teacher_links"); } catch {}
      setLinkCu([]);
      alert("Đã đưa " + (j.dem || 0) + " liên kết lên máy chủ. Từ giờ máy nào đăng nhập cũng thấy.");
    } else {
      alert(j?.error || "Chưa đưa lên được. Danh sách trong máy vẫn còn nguyên, thử lại sau.");
    }
  };

  const getQuestionsFromJSON = (json: any): any[] => {
    if (!json) return [];
    if (Array.isArray(json)) return json;
    if (Array.isArray(json.questions)) return json.questions;
    if (Array.isArray(json.data)) return json.data;
    for (const key in json) if (Array.isArray(json[key])) return json[key];
    return [];
  };

  const updateQuestionsInJSON = (originalJson: any, newQs: any[]) => {
    if (Array.isArray(originalJson)) return newQs;
    if (Array.isArray(originalJson?.questions)) return { ...originalJson, questions: newQs };
    if (Array.isArray(originalJson?.data)) return { ...originalJson, data: newQs };
    for (const key in originalJson) if (Array.isArray(originalJson[key])) return { ...originalJson, [key]: newQs };
    return { ...originalJson, questions: newQs };
  };

  const normalizeJson = (json: any) => {
    const qs = getQuestionsFromJSON(json);
    const seen = new Set<string>();
    const fixed = qs.map((q: any, i: number) => {
      let id = q?.id != null && String(q.id).trim() !== "" ? String(q.id) : `q${i + 1}`;
      while (seen.has(id)) id = `${id}-${i + 1}`;
      seen.add(id);
      return { ...q, id };
    });
    return { json: updateQuestionsInJSON(json, fixed), count: fixed.length };
  };

  const previewQs = getQuestionsFromJSON(previewData);

  if (V15_FEATURES.includes(active)) {
    return (
      <div style={{ background: "#fff", padding: "40px", borderRadius: "16px", border: "1px dashed #cbd5e1", textAlign: "center", boxShadow: "0 4px 6px rgba(0,0,0,0.05)" }}>
        <h2 style={{ color: "#3b82f6", marginBottom: "16px", fontSize: "24px" }}>🚀 Đang khởi động Xưởng Biên Soạn...</h2>
        <p style={{ fontSize: "16px", color: "#64748b", lineHeight: "1.6", maxWidth: "600px", margin: "0 auto" }}>
          Hệ thống mở Xưởng Soạn Đề ở một tab mới để bảo toàn dữ liệu đang soạn.<br /><br />
          Nếu trình duyệt chặn pop-up, bấm nút bên dưới để mở thủ công.
        </p>
        <button onClick={() => openXuong(active)} style={{ marginTop: "20px", background: "#10b981", color: "#fff", border: "none", padding: "12px 24px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", fontSize: "16px" }}>{active === "Tạo Đề Bằng AI" ? "Mở trang Tạo Đề Bằng AI" : "Mở Xưởng Soạn Đề Ngay"}</button>
      </div>
    );
  }

  // ==========================================
  // XỬ LÝ KHỐI PHÁT ĐỀ (ĐÃ MỞ RỘNG FULL TRANG THEO ẢNH YÊU CẦU)
  // ==========================================
  if (active === "Studio đề") {
    if (previewData) {
      return (
        <div style={{ width: "100%" }}>
          <div style={{ background: "#fff", padding: "24px", borderRadius: "12px", border: "1px solid #cbd5e1", width: "100%" }}>
            <div style={{ marginBottom: "20px", padding: "16px", background: "#f1f5f9", borderRadius: "8px", display: "flex", flexDirection: "column", gap: "14px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", fontWeight: "bold", color: "#1e3a8a" }}>
                <input type="checkbox" checked={!!previewMeta.showScore} onChange={(e) => setPreviewMeta({ ...previewMeta, showScore: e.target.checked })} style={{ width: "18px", height: "18px" }} />
                🔓 Cho phép học sinh xem điểm & đáp án ngay sau khi nộp bài
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: "15px", flexWrap: "wrap" }}>
                <span style={{ fontWeight: "bold", color: "#334155" }}>🔢 Số lượng mã đề cần tạo (ví dụ sĩ số lớp 45):</span>
                <input
                  type="number" min={1} max={100} value={previewMeta.numVersions}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    setPreviewMeta({ ...previewMeta, numVersions: Number.isFinite(n) ? Math.min(100, Math.max(1, n)) : 1 });
                  }}
                  style={{ width: "120px", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "16px", fontWeight: "bold", color: "#1e3a8a" }}
                />
                <span style={{ fontSize: "13px", color: "#64748b" }}>(Hệ thống tự sinh từng đề riêng biệt)</span>
              </div>

              <div>
                <div style={{ fontWeight: "bold", color: "#334155", marginBottom: "8px" }}>📌 Phát bài này dưới dạng</div>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  {DS_LOAI_BAI.map((l) => {
                    const chon = previewMeta.loaiBai === l.ma;
                    return (
                      <button
                        key={l.ma}
                        onClick={() => setPreviewMeta({ ...previewMeta, loaiBai: l.ma, duration: l.phut })}
                        style={{
                          flex: "1 1 180px", textAlign: "left", padding: "12px 14px", borderRadius: "10px", cursor: "pointer",
                          border: chon ? "2px solid #1e3a8a" : "1px solid #cbd5e1",
                          background: chon ? "#1e3a8a" : "#fff", color: chon ? "#fff" : "#1e293b",
                        }}
                      >
                        <div style={{ fontWeight: "bold", fontSize: "15px" }}>{l.icon} {l.ten}</div>
                        <div style={{ fontSize: "12px", opacity: 0.8, marginTop: "2px" }}>{l.mota}</div>
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", marginTop: "10px" }}>
                  <span style={{ fontSize: "13px", color: "#64748b" }}>Thời gian làm bài:</span>
                  <input
                    type="number" min={1} max={300} value={previewMeta.duration}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      setPreviewMeta({ ...previewMeta, duration: Number.isFinite(n) && n > 0 ? n : 1 });
                    }}
                    style={{ width: "100px", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "15px", fontWeight: "bold", color: "#1e3a8a" }}
                  />
                  <span style={{ fontSize: "13px", color: "#64748b" }}>
                    phút — chọn loại ở trên sẽ điền sẵn số phút thường dùng, thầy cô sửa lại tùy ý.
                  </span>
                </div>
                <div style={{ fontSize: "13px", color: "#475569", marginTop: "8px" }}>
                  {previewMeta.loaiBai === "nangluc"
                    ? <>Bài sẽ nằm ở mục <b>Đánh Giá Năng Lực</b> của học sinh.</>
                    : <>Bài sẽ nằm ở thẻ <b>{TEN_LOAI_BAI[previewMeta.loaiBai]}</b> trong mục Bài Cần Làm của học sinh.</>}
                </div>
              </div>

              <ThangDiem meta={previewMeta} setMeta={setPreviewMeta} qs={previewQs} />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "20px", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
              <h3 style={{ margin: 0 }}>Danh sách câu hỏi gốc ({previewQs.length} câu)</h3>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <button onClick={() => openXuong("Xưởng Ảnh → HTML")} style={{ padding: "10px 16px", borderRadius: "8px", border: "1px solid #fcd34d", background: "#fffbeb", color: "#b45309", cursor: "pointer", fontWeight: "bold" }}>🖼️ Mở Xưởng Ảnh</button>
                <button onClick={() => { setPreviewData(null); setEditIdx(null); }} style={{ padding: "10px 16px", borderRadius: "8px", border: "1px solid #cbd5e1", background: "#f8fafc", cursor: "pointer", fontWeight: "bold" }}>Hủy bỏ</button>
                <button
                  style={{ background: "#1e3a8a", color: "#fff", border: "none", padding: "10px 16px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer" }}
                  disabled={busy || previewQs.length === 0 || editIdx !== null}
                  onClick={() => {
                    act({
                      action: "importJsonExam",
                      classId: previewMeta.classId,
                      duration: previewMeta.duration,
                      title: previewMeta.title,
                      showScore: previewMeta.showScore,
                      numVersions: previewMeta.numVersions,
                      loaiBai: previewMeta.loaiBai,
                      scoring: { mcq: Number(previewMeta.scMcq) || 0.25, tfMax: Number(previewMeta.scTf) || 1, sa: Number(previewMeta.scSa) || 0.5, essayTotal: Number(previewMeta.scTl) || 0 },
                      jsonData: previewData,
                    });
                    setPreviewData(null);
                    setEditIdx(null);
                  }}
                >
                  🚀 Xác nhận Phát bài ngay ({previewMeta.numVersions} mã đề)
                </button>
              </div>
            </div>

            <div style={{ maxHeight: "65vh", overflowY: "auto", paddingRight: "10px", borderTop: "2px solid #e2e8f0", paddingTop: "20px" }}>
              {previewQs.map((q: any, i: number) => (
                <div key={`${q.id}-${i}`} style={{ marginBottom: "20px", padding: "16px", background: "#f8fafc", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
                  {editIdx === i && editDraft ? (
                    <div>
                      <textarea value={editDraft.q || ""} onChange={(e) => setEditDraft({ ...editDraft, q: e.target.value })} style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #cbd5e1", minHeight: "100px", marginBottom: "10px" }} />
                      {questionType(editDraft) === "mcq" && (editDraft.opts || []).map((opt: string, oIdx: number) => (
                        <div key={oIdx} style={{ display: "flex", gap: "10px", marginBottom: "8px" }}>
                          <span style={{ fontWeight: "bold", width: "24px", paddingTop: "8px" }}>{String.fromCharCode(65 + oIdx)}.</span>
                          <textarea value={opt} onChange={(e) => { const newOpts = [...(editDraft.opts || [])]; newOpts[oIdx] = e.target.value; setEditDraft({ ...editDraft, opts: newOpts }); }} style={{ flex: 1, padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1", minHeight: "40px" }} />
                        </div>
                      ))}
                      <div style={{ marginTop: "10px", display: "flex", gap: "10px" }}>
                        <button
                          onClick={() => {
                            const newQs = previewQs.map((oldQ: any, idx: number) => (idx === i ? editDraft : oldQ));
                            setPreviewData(updateQuestionsInJSON(previewData, newQs));
                            setEditIdx(null);
                            setEditDraft(null);
                          }}
                          style={{ padding: "8px 16px", background: "#10b981", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" }}
                        >
                          Lưu chỉnh sửa
                        </button>
                        <button onClick={() => { setEditIdx(null); setEditDraft(null); }} style={{ padding: "8px 16px", background: "#cbd5e1", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" }}>Hủy sửa</button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <b style={{ display: "block", marginBottom: "12px", fontSize: "1.05em", color: "#1e293b" }}>Câu {i + 1}. <MathText html={q.q || ""} /></b>
                      {/* LỖI CŨ: chỉ so q.type === "mcq" nên đề từ V15 (type là số) xem trước không thấy phương án */}
                      {questionType(q) === "mcq" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginLeft: "10px", marginBottom: "16px" }}>
                          {(q.opts || []).map((o: string, j: number) => <MathText key={j} html={`${String.fromCharCode(65 + j)}. ${o}`} />)}
                        </div>
                      )}
                      {questionType(q) === "essay" && (
                        <div style={{ marginTop: "8px", fontSize: "14px", color: "#5b21b6", background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: "8px", padding: "10px 12px" }}>
                          <b>Tự luận — barem {(q.barem || []).reduce((t: number, x: any) => t + (Number(x?.diem) || 0), 0)} điểm</b>
                          <ul style={{ margin: "6px 0 0", paddingLeft: "20px" }}>
                            {(q.barem || []).map((x: any, j: number) => <li key={j}>{x?.diem} đ — {x?.noiDung ?? x?.text}</li>)}
                          </ul>
                          {!(q.barem || []).length && <div style={{ color: "#b45309" }}>⚠️ Câu này chưa có barem, AI sẽ không chấm được.</div>}
                        </div>
                      )}
                      {questionType(q) === "tf" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginLeft: "10px", marginBottom: "16px" }}>
                          {(q.stmts || []).map((s: any, j: number) => <MathText key={j} html={`${String.fromCharCode(97 + j)}) ${s?.t ?? ""} — <b>${s?.ans ? "ĐÚNG" : "SAI"}</b>`} />)}
                        </div>
                      )}
                      <div style={{ display: "flex", gap: "10px" }}>
                        <button onClick={() => { setEditIdx(i); setEditDraft(JSON.parse(JSON.stringify(q))); }} style={{ padding: "6px 12px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: "bold" }}>✏️ Sửa câu này</button>
                        <button
                          onClick={() => {
                            if (confirm(`Xóa câu ${i + 1} khỏi đề?`)) {
                              const newQs = previewQs.filter((_: any, idx: number) => idx !== i);
                              setPreviewData(updateQuestionsInJSON(previewData, newQs));
                              setEditIdx(null);
                            }
                          }}
                          style={{ padding: "6px 12px", background: "#ef4444", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: "bold" }}
                        >
                          🗑️ Xóa câu này
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div style={{ width: "100%" }}>
        <div style={{ background: "#fff", padding: "40px", borderRadius: "16px", border: "1px solid #cbd5e1", boxShadow: "0 4px 10px rgba(0,0,0,0.05)", width: "100%" }}>
          <h2 style={{ marginTop: 0, color: "#1e3a8a", fontSize: "24px", marginBottom: "10px" }}>📤 Nạp Đề & Phát Bài</h2>
          <p style={{ color: "#64748b", fontSize: "16px", marginBottom: "30px" }}>Tải file JSON đã thiết kế từ Xưởng Soạn Đề để phát trực tiếp lên máy chủ cho học sinh.</p>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "24px", maxWidth: "800px" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: "8px", fontWeight: "bold", color: "#334155" }}>
              Chọn lớp phát đề
              <select value={exam.classId} onChange={(e) => setExam({ ...exam, classId: e.target.value })} style={{ padding: "16px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none", fontSize: "15px", width: "100%", background: "#f8fafc" }}>
                <option value="">— Vui lòng chọn lớp —</option>
                {(data.classes || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: "8px", fontWeight: "bold", color: "#334155" }}>
              Thời gian làm bài (phút)
              <input
                type="number" min={1} max={300} value={exam.duration}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  setExam({ ...exam, duration: Number.isFinite(n) && n > 0 ? n : 1 });
                }}
                style={{ padding: "16px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none", fontSize: "15px", width: "100%", background: "#f8fafc" }}
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: "8px", fontWeight: "bold", color: "#334155" }}>
              Tải file sao lưu (.json)
              <input type="file" accept=".json,application/json" id="json-exam-file" style={{ padding: "16px", border: "2px dashed #cbd5e1", borderRadius: "8px", background: "#f8fafc", cursor: "pointer", width: "100%" }} />
            </label>

            <button
              style={{ background: "#1e3a8a", color: "#fff", border: "none", padding: "18px 20px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", fontSize: "17px", marginTop: "10px", width: "100%" }}
              disabled={!exam.classId || busy}
              onClick={() => {
                const input = document.getElementById("json-exam-file") as HTMLInputElement | null;
                const f = input?.files?.[0];
                if (!f) return alert("Hãy chọn file .json đã xuất từ Xưởng Soạn Đề.");
                const r = new FileReader();
                r.onerror = () => alert("Không đọc được file. Hãy thử chọn lại.");
                r.onload = (e) => {
                  try {
                    const raw = JSON.parse(String(e.target?.result || ""));
                    const { json, count } = normalizeJson(raw);
                    if (count === 0) return alert("File hợp lệ nhưng không tìm thấy câu hỏi nào bên trong.");
                    setPreviewData(json);
                    setPreviewMeta({
                      classId: exam.classId, duration: exam.duration, title: f.name.replace(/\.[^/.]+$/, ""),
                      showScore: true, numVersions: 45,
                      // Đoán sẵn loại bài theo số phút vừa nhập, thầy cô vẫn đổi được ở bước sau.
                      loaiBai: exam.duration <= NGUONG_15P ? "kt15" : exam.duration >= NGUONG_NANGLUC ? "nangluc" : "kt1tiet",
                      scMcq: 0.25, scTf: 1, scSa: 0.5, scTl: 0,
                    });
                    setEditIdx(null);
                  } catch {
                    alert("File JSON sai định dạng. Hãy xuất lại từ Xưởng Soạn Đề.");
                  }
                };
                r.readAsText(f);
              }}
            >
              👀 Tải lên & Kiểm duyệt nội dung
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (active === "Học liệu") return <SoanHocLieu hocLieu={data.hocLieu || []} act={act} busy={busy} triggerMath={triggerMath} />;

  if (active === "Nhúng link") {
    return (
      <div>
        {linkCu.length > 0 && (
          <div style={{ background: "#fffbeb", border: "1px solid #f59e0b", borderRadius: "12px", padding: "16px 20px", marginBottom: "20px" }}>
            <b style={{ color: "#92400e" }}>Có {linkCu.length} liên kết cũ chỉ nằm trong trình duyệt máy này.</b>
            <p style={{ margin: "6px 0 12px", color: "#78350f", fontSize: "14px" }}>
              Danh sách liên kết nay lưu trên máy chủ để máy nào đăng nhập cũng thấy như nhau. Bấm nút dưới để đưa số cũ lên. Link đã có sẵn trên máy chủ sẽ không bị thêm trùng.
            </p>
            <button onClick={dayLinkCuLen} disabled={busy} style={{ background: "#f59e0b", color: "#fff", border: "none", padding: "10px 20px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer" }}>
              ⬆️ Đưa {linkCu.length} liên kết lên máy chủ
            </button>
          </div>
        )}

        <div style={{ background: "#fff", padding: "24px", borderRadius: "12px", border: "1px solid #cbd5e1", marginBottom: "20px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)" }}>
          <h3 style={{ marginTop: 0, color: "#1e3a8a" }}>➕ Thêm liên kết mới</h3>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "10px" }}>
            <input placeholder="Tên liên kết (vd: Phòng Google Meet khối 12)" value={newLinkName} onChange={(e) => setNewLinkName(e.target.value)} style={{ flex: "1 1 200px", padding: "12px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none" }} />
            <input placeholder="Đường dẫn URL (vd: https://meet.google.com/...)" value={newLinkUrl} onChange={(e) => setNewLinkUrl(e.target.value)} style={{ flex: "2 1 300px", padding: "12px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none" }} />
            <button
              style={{ background: "#10b981", color: "#fff", border: "none", padding: "12px 24px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer" }}
              onClick={async () => {
                const n = newLinkName.trim();
                let u = newLinkUrl.trim();
                if (!n || !u) return alert("Vui lòng nhập đầy đủ tên và đường dẫn URL.");
                if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
                const j = await act({ action: "themLienKet", name: n, url: u }, true);
                if (!j?.ok) return alert(j?.error || "Không thêm được liên kết.");
                setNewLinkName("");
                setNewLinkUrl("");
              }}
            >
              Thêm Link
            </button>
          </div>
        </div>

        <div style={{ background: "#fff", padding: "24px", borderRadius: "12px", border: "1px solid #cbd5e1", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)" }}>
          <h3 style={{ marginTop: 0, color: "#1e3a8a" }}>🔗 Danh sách liên kết đã lưu</h3>
          {(data.links || []).length === 0 && <p style={{ color: "#64748b" }}>Chưa có liên kết nào. Thêm một liên kết ở khung phía trên.</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "10px" }}>
            {(data.links || []).map((lnk: any, idx: number) => (
              <div key={`${lnk.url}-${idx}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", flexWrap: "wrap", gap: "10px" }}>
                <div>
                  <b style={{ color: "#0f172a", fontSize: "16px" }}>{lnk.name}</b>
                  <br />
                  <a href={lnk.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "14px", color: "#3b82f6", textDecoration: "none", wordBreak: "break-all" }}>{lnk.url}</a>
                </div>
                <button style={{ background: "#fee2e2", color: "#b91c1c", border: "none", padding: "8px 16px", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" }} onClick={() => { if (confirm(`Xóa liên kết "${lnk.name}"?`)) act({ action: "xoaLienKet", id: lnk.id }, true); }}>🗑️ Xóa</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (active === "Lớp học")
    return <QuanLyLopHoc classesList={data.classes || []} act={act} busy={busy} />;

  if (active === "Kết quả")
    return (
      <div>
        <div style={{ marginBottom: "20px", display: "flex", gap: "10px", alignItems: "center", background: "#fef2f2", padding: "16px", borderRadius: "12px", border: "1px solid #fca5a5", flexWrap: "wrap" }}>
          <span style={{ fontWeight: "bold", color: "#b91c1c" }}>🗑️ Xóa kết quả theo lớp:</span>
          <select value={selectedClassToDelete} onChange={(e) => setSelectedClassToDelete(e.target.value)} style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #f87171", outline: "none", flex: "1 1 200px", maxWidth: "300px" }}>
            <option value="">-- Menu chọn lớp --</option>
            {(data.classes || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button
            style={{ background: selectedClassToDelete ? "#b91c1c" : "#fca5a5", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "6px", fontWeight: "bold", cursor: selectedClassToDelete ? "pointer" : "not-allowed" }}
            disabled={!selectedClassToDelete || busy}
            onClick={() => {
              if (confirm("🚨 Xóa TOÀN BỘ kết quả điểm của lớp này? Hành động không thể hoàn tác.")) {
                act({ action: "deleteAttemptsByClass", classId: selectedClassToDelete });
                setSelectedClassToDelete("");
              }
            }}
          >
            Xóa nguyên lớp
          </button>
        </div>

        <ChamTuLuan rows={data.attempts || []} exams={data.exams || []} act={act} busy={busy} />

        <Results rows={data.attempts || []} exams={data.exams || []} classes={data.classes || []} act={act} busy={busy} />
      </div>
    );

  if (active === "Sao lưu")
    return (
      <div>
        {isAdmin ? (
        <div style={{ background: "#fff", padding: "24px", borderRadius: "12px", border: "1px solid #cbd5e1", marginBottom: "20px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)" }}>
          <h3 style={{ marginTop: 0, color: "#1e3a8a", display: "flex", alignItems: "center", gap: "8px" }}>🔑 Mật khẩu Quản trị & Giáo viên</h3>
          <p style={{ fontSize: "14px", color: "#64748b", marginBottom: "20px" }}>Mật khẩu được mã hóa trên máy chủ. Giáo viên đăng nhập LẦN ĐẦU bằng họ tên + mật khẩu ban đầu, sau đó tự đặt mật khẩu riêng.</p>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <button
              style={{ background: "#10b981", color: "#fff", border: "none", padding: "12px 20px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer" }}
              disabled={busy}
              onClick={async () => {
                const newPass = prompt("Nhập mật khẩu MỚI:");
                if (newPass === null) return;
                if (newPass.trim().length < 8) return alert("Mật khẩu cần ít nhất 8 ký tự.");
                if (typeof changePasswordAction !== "function") return alert("Máy chủ chưa bật chức năng đổi mật khẩu.");
                // LỖI CŨ: báo "✅ Đã đổi mật khẩu" kể cả khi máy chủ trả lỗi
                try {
                  const kq = await changePasswordAction(newPass.trim());
                  if (kq?.error) return alert("❌ " + kq.error);
                  alert("✅ Đã đổi mật khẩu.");
                } catch {
                  alert("❌ Không kết nối được máy chủ. Mật khẩu chưa được đổi.");
                }
              }}
            >
              Đổi mật khẩu Quản trị
            </button>

            <button
              style={{ background: "#f1f5f9", color: "#475569", border: "1px solid #cbd5e1", padding: "12px 20px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer" }}
              disabled={busy}
              onClick={async () => {
                if (!confirm("Khôi phục về mật khẩu gốc (TEACHER_PASSWORD cài trong Cloudflare)?")) return;
                if (typeof resetPasswordAction !== "function") return alert("Máy chủ chưa bật chức năng khôi phục.");
                try {
                  const kq = await resetPasswordAction();
                  if (kq?.error) return alert("❌ " + kq.error);
                  alert("✅ Đã khôi phục về mật khẩu gốc cài trong Cloudflare.");
                } catch {
                  alert("❌ Không kết nối được máy chủ. Mật khẩu chưa đổi.");
                }
              }}
            >
              Khôi phục về mặc định
            </button>
            <button
              style={{ background: "#166534", color: "#fff", border: "none", padding: "12px 20px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer" }}
              disabled={busy}
              onClick={async () => {
                const newPass = prompt("Đặt MẬT KHẨU BAN ĐẦU cho Giáo viên (ít nhất 8 ký tự).\nGửi mật khẩu này cho các thầy cô để đăng nhập LẦN ĐẦU (sau đó họ tự đặt mật khẩu riêng):");
                if (newPass === null) return;
                if (newPass.trim().length < 8) return alert("Mật khẩu cần ít nhất 8 ký tự.");
                if (typeof setSharedPasswordAction !== "function") return alert("Máy chủ chưa bật chức năng này.");
                try {
                  const kq = await setSharedPasswordAction(newPass.trim());
                  if (kq?.error) return alert("❌ " + kq.error);
                  alert("✅ Đã đặt mật khẩu ban đầu cho Giáo viên.");
                } catch {
                  alert("❌ Không kết nối được máy chủ. Mật khẩu chưa được đặt.");
                }
              }}
            >
              👨‍🏫 Đặt mật khẩu ban đầu Giáo viên
            </button>

            <button
              style={{ background: "#fff7ed", color: "#9a3412", border: "1px solid #fdba74", padding: "12px 20px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer" }}
              disabled={busy}
              onClick={async () => {
                const name = prompt("CẤP LẠI MẬT KHẨU cho Giáo viên quên mật khẩu.\nNhập đúng họ tên Giáo viên (ví dụ: Nguyễn Văn An):");
                if (name === null || !name.trim()) return;
                if (typeof resetTeacherPwdAction !== "function") return alert("Máy chủ chưa bật chức năng này.");
                try {
                  const kq = await resetTeacherPwdAction(name.trim());
                  if (kq?.error) return alert("❌ " + kq.error);
                  alert(`✅ Đã cấp lại. "${name.trim()}" đăng nhập bằng mật khẩu BAN ĐẦU rồi đặt mật khẩu riêng mới.`);
                } catch {
                  alert("❌ Không kết nối được máy chủ.");
                }
              }}
            >
              ♻️ Cấp lại mật khẩu cho 1 Giáo viên
            </button>
          </div>
        </div>
        ) : (
          <div style={{ background: "#fff", padding: "24px", borderRadius: "12px", border: "1px solid #cbd5e1", marginBottom: "20px" }}>
            <h3 style={{ marginTop: 0, color: "#1e3a8a" }}>🔑 Mật khẩu của tôi</h3>
            <p style={{ fontSize: "14px", color: "#64748b", marginBottom: "16px" }}>Mật khẩu riêng chỉ thầy/cô biết (được mã hóa, Quản trị cũng không xem được). Quên mật khẩu thì nhờ Quản trị cấp lại.</p>
            <button
              style={{ background: "#10b981", color: "#fff", border: "none", padding: "12px 20px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer" }}
              disabled={busy}
              onClick={async () => {
                const p1 = prompt("Nhập mật khẩu riêng MỚI (ít nhất 8 ký tự):");
                if (p1 === null) return;
                if (p1.trim().length < 8) return alert("Mật khẩu cần ít nhất 8 ký tự.");
                const p2 = prompt("Nhập lại mật khẩu mới:");
                if (p2 === null) return;
                if (p1.trim() !== p2.trim()) return alert("❌ Hai lần nhập không khớp.");
                try {
                  const kq = await changePasswordAction(p1.trim());
                  if (kq?.error) return alert("❌ " + kq.error);
                  alert("✅ Đã đổi mật khẩu riêng.");
                } catch {
                  alert("❌ Không kết nối được máy chủ. Mật khẩu chưa được đổi.");
                }
              }}
            >
              Đổi mật khẩu của tôi
            </button>
          </div>
        )}

        <div style={{ background: "#fff", padding: "24px", borderRadius: "12px", border: "1px solid #cbd5e1", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)" }}>
          <h3 style={{ marginTop: 0, color: "#1e3a8a", display: "flex", alignItems: "center", gap: "8px" }}>💾 Sao lưu kết quả lớp học</h3>
          <p style={{ fontSize: "14px", color: "#64748b", marginBottom: "20px" }}>Tải toàn bộ điểm số và thời gian nộp bài về máy với 3 định dạng.</p>
          <div style={{ display: "flex", gap: "15px", flexWrap: "wrap", marginTop: "10px" }}>
            <button style={{ flex: "1 1 200px", background: "#10b981", color: "#fff", border: "none", padding: "14px 20px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", fontSize: "15px" }} onClick={() => exportExcel(data.attempts || [], data.exams || [])}>📊 Tải Excel</button>
            <button style={{ flex: "1 1 200px", background: "#2563eb", color: "#fff", border: "none", padding: "14px 20px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", fontSize: "15px" }} onClick={() => exportDoc(data.attempts || [], data.exams || [])}>📝 Tải Word (.doc)</button>
            <button style={{ flex: "1 1 200px", background: "#ef4444", color: "#fff", border: "none", padding: "14px 20px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", fontSize: "15px" }} onClick={() => printPdf(data.attempts || [], data.exams || [])}>🖨️ In / Lưu PDF</button>
          </div>
        </div>
      </div>
    );

  if (active === "Quản lý bài phát") {
    const tatCa = data.exams || [];
    const demLoai: Record<string, number> = { kt15: 0, kt1tiet: 0, nangluc: 0 };
    tatCa.forEach((e: any) => demLoai[loaiBaiKiemTra(e)]++);
    const dsHien = locLoaiBai === "all" ? tatCa : tatCa.filter((e: any) => loaiBaiKiemTra(e) === locLoaiBai);

    const theLoc = (ma: string, ten: string, so: number) => {
      const chon = locLoaiBai === ma;
      return (
        <button
          key={ma}
          onClick={() => setLocLoaiBai(ma)}
          style={{
            flex: "1 1 150px", padding: "12px 14px", borderRadius: "10px", cursor: "pointer", textAlign: "left",
            border: chon ? "2px solid #1e3a8a" : "1px solid #cbd5e1",
            background: chon ? "#1e3a8a" : "#fff", color: chon ? "#fff" : "#1e293b", fontWeight: "bold",
          }}
        >
          <div style={{ fontSize: "14px" }}>{ten}</div>
          <div style={{ fontSize: "20px", fontWeight: 900, marginTop: "2px" }}>{so}</div>
        </button>
      );
    };

    return (
      <div style={{ background: "#fff", padding: "24px", borderRadius: "12px", border: "1px solid #cbd5e1" }}>
        <h3 style={{ marginTop: 0, color: "#1e3a8a", marginBottom: "14px" }}>Danh sách bài đã phát</h3>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "14px" }}>
          {theLoc("all", "Tất cả", tatCa.length)}
          {DS_LOAI_BAI.map((l) => theLoc(l.ma, `${l.icon} ${l.ten}`, demLoai[l.ma]))}
        </div>

        {/* Xóa cả loạt: phát 45 mã đề cho một bài thì xóa từng cái một là cực hình. */}
        {locLoaiBai !== "all" && demLoai[locLoaiBai] > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "10px", padding: "14px 16px", marginBottom: "16px" }}>
            <span style={{ fontSize: "14px", color: "#7f1d1d" }}>
              Xóa toàn bộ <b>{demLoai[locLoaiBai]}</b> bài loại &quot;{TEN_LOAI_BAI[locLoaiBai]}&quot; cùng lúc, kèm theo tất cả điểm của các bài đó.
            </span>
            <button
              disabled={busy}
              onClick={() => {
                const n = demLoai[locLoaiBai];
                if (!confirm(`Xóa ${n} bài loại "${TEN_LOAI_BAI[locLoaiBai]}"?\n\nTOÀN BỘ ĐIỂM của học sinh ở các bài này cũng mất theo và KHÔNG khôi phục được.`)) return;
                if (!confirm(`Xác nhận lần cuối: xóa hẳn ${n} bài?`)) return;
                act({ action: "xoaBaiTheoLoai", loaiBai: locLoaiBai });
              }}
              style={{ background: "#b91c1c", color: "#fff", border: "none", padding: "12px 20px", borderRadius: "8px", cursor: "pointer", fontWeight: "bold", flexShrink: 0 }}
            >
              🗑️ Xóa tất cả {TEN_LOAI_BAI[locLoaiBai]}
            </button>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {dsHien.map((e: any) => (
            <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
              <div>
                <b style={{ fontSize: "16px", color: "#0f172a" }}>{e.title}</b>
                <br />
                <small style={{ color: "#64748b" }}>Mã bài: <b style={{ color: "#3b82f6" }}>{e.code}</b> · {e.durationMinutes} phút</small>
                <div style={{ display: "inline-block", marginLeft: "8px", padding: "2px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: "bold", background: loaiBaiKiemTra(e) === "nangluc" ? "#ede9fe" : loaiBaiKiemTra(e) === "kt15" ? "#fef3c7" : "#dbeafe", color: loaiBaiKiemTra(e) === "nangluc" ? "#5b21b6" : loaiBaiKiemTra(e) === "kt15" ? "#b45309" : "#1e40af" }}>
                  {TEN_LOAI_BAI[loaiBaiKiemTra(e)]}
                </div>
              </div>
              <button style={{ background: "#fee2e2", color: "#b91c1c", border: "none", padding: "8px 16px", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" }} disabled={busy} onClick={() => { if (confirm(`Xóa bài "${e.title}"?`)) act({ action: "deleteExam", examId: e.id }); }}>🗑️ Xóa bài</button>
            </div>
          ))}
          {!dsHien.length && (
            <p style={{ color: "#64748b" }}>
              {tatCa.length ? `Không có bài nào thuộc loại "${TEN_LOAI_BAI[locLoaiBai]}".` : "Chưa có bài kiểm tra nào được phát."}
            </p>
          )}
        </div>
      </div>
    );
  }

  const attempts: any[] = data.attempts || [];
  const avg = attempts.length ? attempts.reduce((s: number, a: any) => s + toScale10(a.score, a.maxScore), 0) / attempts.length : 0;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "20px" }}>
      <StatCard label="Tổng số lớp" value={(data.classes || []).length} />
      <StatCard label="Tổng học sinh" value={(data.classes || []).reduce((s: number, c: any) => s + (Number(c.students) || 0), 0)} />
      <StatCard label="Bài đã phát" value={(data.exams || []).length} />
      <StatCard label="Điểm trung bình" value={attempts.length ? avg.toFixed(1) : "—"} color="#10b981" />
    </div>
  );
}

// =========================================================
// CHÈN ẢNH VÀO NỘI DUNG BÀI HỌC
// Ảnh chụp từ điện thoại thường 3–5 MB, nhúng thẳng vào sẽ làm phình dữ liệu
// và học sinh tải bài rất chậm. Nên ảnh được thu nhỏ còn tối đa 1000px và nén
// lại ngay trên máy thầy cô trước khi nhúng.
// =========================================================
const ANH_RONG_TOI_DA = 1000;
// Giảm từ 700KB xuống 400KB: cả ba mục Kiến thức trọng tâm + Sơ đồ tư duy +
// Luyện tập cộng lại chỉ được ~1,7MB (xem route.ts), nên mỗi ảnh phải nhỏ lại
// mới đủ chỗ chèn NHIỀU ảnh một mục (ví dụ 3-4 ảnh cho sơ đồ tư duy).
const ANH_NANG_TOI_DA = 400 * 1024;

// ==========================================
// QUẢN LÝ LỚP HỌC — đổi tên lớp, thêm/xóa học sinh (tay hoặc từ file Excel), cấp lại mật khẩu.
// Trước đây học sinh tự đăng ký bằng cách gõ họ tên + mã lớp bất kỳ, không có mật khẩu.
// Nay giáo viên chủ động cấp tài khoản cho từng học sinh ngay trong màn hình này.
// ==========================================
/* Đổi số giây thành chữ dễ đọc: "45 giây", "12 phút", "1 giờ 20 phút".
   Thầy cô cần biết em học lâu hay chóng, chứ không cần con số 4823 giây. */
function doiGiay(giay: number) {
  const g = Math.max(0, Math.round(Number(giay) || 0));
  if (g < 60) return g + " giây";
  const phut = Math.round(g / 60);
  if (phut < 60) return phut + " phút";
  const gio = Math.floor(phut / 60);
  const du = phut % 60;
  return du ? gio + " giờ " + du + " phút" : gio + " giờ";
}

function QuanLyLopHoc({ classesList, act, busy }: { classesList: any[]; act: any; busy: boolean }) {
  const [tenLopMoi, setTenLopMoi] = useState("");
  const [lopMoRong, setLopMoRong] = useState<number | null>(null);
  const [dsHocSinh, setDsHocSinh] = useState<Record<number, any[]>>({});
  const [dangTaiHocSinh, setDangTaiHocSinh] = useState<number | null>(null);
  const [tenHocSinhMoi, setTenHocSinhMoi] = useState("");
  const [dangSuaTenLop, setDangSuaTenLop] = useState<number | null>(null);
  const [tenLopDangSua, setTenLopDangSua] = useState("");
  const [matKhauVuaTao, setMatKhauVuaTao] = useState<{ className: string; students: any[] } | null>(null);
  const [lopChoUpload, setLopChoUpload] = useState<number | null>(null);
  const [thongKe, setThongKe] = useState<Record<number, any[]>>({});
  const [dangTaiThongKe, setDangTaiThongKe] = useState<number | null>(null);
  const [moChiTiet, setMoChiTiet] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const taiDanhSachHocSinh = async (classId: number) => {
    setDangTaiHocSinh(classId);
    const j = await act({ action: "layHocSinhLop", classId }, true);
    if (j?.ok) setDsHocSinh((prev) => ({ ...prev, [classId]: j.students || [] }));
    setDangTaiHocSinh(null);
  };

  const moRongLop = (classId: number) => {
    const dangMo = lopMoRong === classId;
    setLopMoRong(dangMo ? null : classId);
    if (!dangMo && !dsHocSinh[classId]) taiDanhSachHocSinh(classId);
  };

  /* =====================================================================
     THỐNG KÊ HỌC LIỆU
     Tải riêng khi thầy cô bấm xem, không tải sẵn cùng danh sách lớp — vì phần
     lớn lần vào màn hình này là để thêm/xoá học sinh chứ không phải xem thống kê.
     ===================================================================== */
  const taiThongKe = async (classId: number) => {
    if (thongKe[classId]) { setThongKe((p) => { const q = { ...p }; delete q[classId]; return q; }); return; }
    setDangTaiThongKe(classId);
    const j = await act({ action: "thongKeHocLieu", classId }, true);
    if (j?.ok) setThongKe((p) => ({ ...p, [classId]: j.students || [] }));
    else alert(j?.error || "Không tải được thống kê.");
    setDangTaiThongKe(null);
  };

  const themHocSinhTay = async (classId: number) => {
    const raw = tenHocSinhMoi.trim();
    if (!raw) return alert("Nhập họ tên học sinh trước (mỗi em một dòng).");
    const names = raw.split("\n").map((s) => s.trim()).filter(Boolean);
    const j = await act({ action: "addStudents", classId, names }, true);
    if (j?.ok) {
      setTenHocSinhMoi("");
      const c = classesList.find((x) => x.id === classId);
      setMatKhauVuaTao({ className: c?.name || "", students: j.students || [] });
      taiDanhSachHocSinh(classId);
    } else {
      alert(j?.error || "Không thêm được học sinh.");
    }
  };

  const chonFileExcel = (classId: number) => {
    setLopChoUpload(classId);
    fileInputRef.current?.click();
  };

  const xuLyFileExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || lopChoUpload == null) return;
    const classId = lopChoUpload;
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      const boQua = new Set(["họ và tên", "họ tên", "tên", "stt", "họ và tên học sinh"]);
      const names: string[] = [];
      for (const r of rows) {
        const raw = String(r?.[0] ?? "").trim();
        if (!raw) continue;
        if (boQua.has(raw.toLocaleLowerCase("vi-VN"))) continue;
        if (/^\d+$/.test(raw)) continue; // dòng chỉ có số thứ tự, không phải tên
        names.push(raw);
      }
      if (!names.length) return alert("Không đọc được họ tên nào. Đảm bảo CỘT ĐẦU TIÊN của file là họ tên học sinh.");

      const j = await act({ action: "addStudents", classId, names }, true);
      if (j?.ok) {
        const c = classesList.find((x) => x.id === classId);
        setMatKhauVuaTao({ className: c?.name || "", students: j.students || [] });
        taiDanhSachHocSinh(classId);
      } else {
        alert(j?.error || "Không thêm được học sinh từ file.");
      }
    } catch {
      alert("Không đọc được file. Đảm bảo đây là file Excel .xlsx hoặc .xls rồi thử lại.");
    }
  };

  const resetMatKhau = async (email: string, hoTen: string) => {
    if (!confirm(`Cấp lại mật khẩu mới cho "${hoTen}"? Mật khẩu cũ sẽ không dùng được nữa.`)) return;
    const j = await act({ action: "resetStudentPassword", email }, true);
    if (j?.ok) setMatKhauVuaTao({ className: "", students: [{ name: hoTen, email, password: j.password }] });
    else alert(j?.error || "Không cấp lại được mật khẩu.");
  };

  const xoaHocSinh = async (classId: number, email: string, hoTen: string) => {
    if (!confirm(`Xóa "${hoTen}" khỏi lớp này?`)) return;
    const j = await act({ action: "removeStudent", classId, email }, true);
    if (j?.ok) taiDanhSachHocSinh(classId);
    else alert(j?.error || "Không xóa được học sinh.");
  };

  const luuTenLopMoi = async (classId: number) => {
    const ten = tenLopDangSua.trim();
    if (!ten) return alert("Tên lớp không được để trống.");
    const j = await act({ action: "renameClass", classId, name: ten });
    if (j?.ok) setDangSuaTenLop(null);
    else alert(j?.error || "Không đổi được tên lớp.");
  };

  const taiXuongDanhSachMatKhau = () => {
    if (!matKhauVuaTao) return;
    const hang = matKhauVuaTao.students
      .map((s) => `<tr><td>${s.name}</td><td>${s.email}</td><td style="font-weight:bold;">${s.password}</td></tr>`)
      .join("");
    const html = `<html><head><meta charset="utf-8"></head><body><h2>Tài khoản học sinh ${matKhauVuaTao.className ? "— " + matKhauVuaTao.className : ""}</h2><table border="1" cellpadding="8" style="border-collapse:collapse;"><thead><tr><th>Họ và tên</th><th>Mã lớp + Tài khoản nội bộ</th><th>Mật khẩu</th></tr></thead><tbody>${hang}</tbody></table></body></html>`;
    download(["\ufeff", html], "application/vnd.ms-excel", `Mat_khau_hoc_sinh.xls`);
  };

  return (
    <div>
      <input type="file" accept=".xlsx,.xls" ref={fileInputRef} style={{ display: "none" }} onChange={xuLyFileExcel} />

      <form
        style={{ display: "flex", gap: "10px", marginBottom: "20px" }}
        onSubmit={(e) => {
          e.preventDefault();
          const n = tenLopMoi.trim();
          if (!n) return alert("Nhập tên lớp trước khi tạo.");
          act({ action: "createClass", name: n });
          setTenLopMoi("");
        }}
      >
        <input value={tenLopMoi} onChange={(e) => setTenLopMoi(e.target.value)} placeholder="Ví dụ: Toán 12A09" style={{ flex: 1, padding: "12px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none" }} />
        <button disabled={busy} style={{ background: "#1e3a8a", color: "#fff", border: "none", padding: "0 24px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer" }}>＋ Tạo lớp</button>
      </form>

      {matKhauVuaTao && (
        <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: "12px", padding: "18px", marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", gap: "10px", flexWrap: "wrap" }}>
            <b style={{ color: "#166534" }}>🔑 Mật khẩu vừa cấp{matKhauVuaTao.className ? ` — ${matKhauVuaTao.className}` : ""} (chỉ hiện MỘT LẦN, hãy lưu lại ngay)</b>
            <button onClick={() => setMatKhauVuaTao(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "18px", color: "#166534" }}>✕</button>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
              <thead>
                <tr style={{ textAlign: "left", color: "#166534" }}>
                  <th style={{ padding: "6px" }}>Họ và tên</th>
                  <th style={{ padding: "6px" }}>Mật khẩu</th>
                </tr>
              </thead>
              <tbody>
                {matKhauVuaTao.students.map((s: any) => (
                  <tr key={s.email}>
                    <td style={{ padding: "6px" }}>{s.name}</td>
                    <td style={{ padding: "6px", fontFamily: "monospace", fontWeight: "bold" }}>{s.password}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={taiXuongDanhSachMatKhau} style={{ marginTop: "10px", background: "#166534", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontWeight: "bold" }}>
            ⬇️ Tải danh sách để in cho học sinh
          </button>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "20px" }}>
        {classesList.map((c: any) => {
          const dangMo = lopMoRong === c.id;
          return (
            <article key={c.id} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "20px", boxShadow: "0 2px 4px rgba(0,0,0,0.02)" }}>
              <div style={{ display: "flex", gap: "16px" }}>
                <div style={{ width: "48px", height: "48px", background: "#eff6ff", color: "#2563eb", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", fontSize: "18px", flexShrink: 0 }}>12</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px", gap: "8px" }}>
                    {dangSuaTenLop === c.id ? (
                      <div style={{ display: "flex", gap: "6px", flex: 1 }}>
                        <input value={tenLopDangSua} onChange={(e) => setTenLopDangSua(e.target.value)} style={{ flex: 1, padding: "6px 8px", borderRadius: "6px", border: "1px solid #cbd5e1" }} autoFocus />
                        <button onClick={() => luuTenLopMoi(c.id)} disabled={busy} style={{ background: "#1e3a8a", color: "#fff", border: "none", borderRadius: "6px", padding: "4px 10px", cursor: "pointer" }}>Lưu</button>
                        <button onClick={() => setDangSuaTenLop(null)} style={{ background: "#e2e8f0", border: "none", borderRadius: "6px", padding: "4px 10px", cursor: "pointer" }}>Hủy</button>
                      </div>
                    ) : (
                      <h3
                        style={{ margin: 0, color: "#1e293b", fontSize: "18px", cursor: "pointer" }}
                        onClick={() => { setDangSuaTenLop(c.id); setTenLopDangSua(c.name); }}
                        title="Bấm để đổi tên lớp"
                      >
                        {c.name} ✏️
                      </h3>
                    )}
                    <button
                      title="Xóa lớp học này"
                      style={{ background: "#fee2e2", color: "#b91c1c", border: "none", padding: "4px 8px", borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontWeight: "bold", flexShrink: 0 }}
                      disabled={busy}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Xóa lớp "${c.name}"? Đề thi và bảng điểm liên quan có thể bị ảnh hưởng.`)) act({ action: "deleteClass", classId: c.id });
                      }}
                    >
                      🗑️ Xóa lớp
                    </button>
                  </div>
                  <p style={{ margin: "0 0 8px 0", color: "#64748b", fontSize: "14px" }}>{c.students ?? 0} học sinh · {c.schoolYear || "—"}</p>
                  <span style={{ fontSize: "13px", color: "#10b981", background: "#f0fdf4", padding: "4px 8px", borderRadius: "4px", fontWeight: "bold" }}>Mã: {c.code}</span>

                  <div style={{ marginTop: "14px" }}>
                    <button onClick={() => moRongLop(c.id)} style={{ background: "none", border: "none", color: "#1e3a8a", fontWeight: "bold", cursor: "pointer", padding: 0, fontSize: "14px" }}>
                      {dangMo ? "▲ Ẩn danh sách học sinh" : "▼ Quản lý danh sách học sinh"}
                    </button>
                  </div>
                </div>
              </div>

              {dangMo && (
                <div style={{ marginTop: "16px", borderTop: "1px solid #e2e8f0", paddingTop: "16px" }}>
                  <div style={{ display: "flex", gap: "8px", marginBottom: "12px", flexWrap: "wrap" }}>
                    <button onClick={() => chonFileExcel(c.id)} disabled={busy} style={{ background: "#eff6ff", color: "#1e3a8a", border: "1px solid #1e3a8a", borderRadius: "8px", padding: "8px 14px", cursor: "pointer", fontWeight: "bold", fontSize: "13px" }}>
                      📄 Tải danh sách từ Excel
                    </button>
                    <button onClick={() => taiThongKe(c.id)} disabled={busy} style={{ background: "#f0fdf4", color: "#166534", border: "1px solid #10b981", borderRadius: "8px", padding: "8px 14px", cursor: "pointer", fontWeight: "bold", fontSize: "13px" }}>
                      {thongKe[c.id] ? "▲ Ẩn thống kê học liệu" : "📊 Thống kê học liệu"}
                    </button>
                  </div>

                  {dangTaiThongKe === c.id && <p style={{ color: "#64748b" }}>Đang tính thống kê...</p>}

                  {thongKe[c.id] && (
                    <div style={{ marginBottom: "14px", border: "1px solid #bbf7d0", borderRadius: "10px", overflow: "hidden" }}>
                      <div style={{ background: "#f0fdf4", padding: "10px 12px", fontSize: "13px", color: "#166534", fontWeight: "bold" }}>
                        Ai đã vào mục Học Liệu Bài Học · ⏱ chỉ tính lúc em thực sự mở màn hình
                      </div>
                      {!thongKe[c.id].length ? (
                        <p style={{ margin: 0, padding: "12px", color: "#64748b", fontStyle: "italic", fontSize: "13px" }}>Lớp chưa có học sinh nào.</p>
                      ) : (
                        <div>
                          {thongKe[c.id].map((hs: any) => {
                            const khoa = c.id + "|" + hs.email;
                            const dangXem = moChiTiet === khoa;
                            return (
                              <div key={hs.email} style={{ borderTop: "1px solid #dcfce7" }}>
                                <div
                                  onClick={() => hs.soBai && setMoChiTiet(dangXem ? null : khoa)}
                                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", padding: "9px 12px", fontSize: "13px", background: hs.tongLuot ? "#fff" : "#fff7ed", cursor: hs.soBai ? "pointer" : "default" }}
                                >
                                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: "bold", color: "#1e293b" }}>{hs.name}</span>
                                  {hs.tongLuot ? (
                                    <>
                                      <span style={{ color: "#166534", flexShrink: 0 }}>{hs.soBai} bài · {hs.tongLuot} lượt</span>
                                      <span style={{ color: "#1e3a8a", fontWeight: "bold", flexShrink: 0 }}>⏱ {doiGiay(hs.tongGiay || 0)}</span>
                                      <span style={{ color: "#64748b", fontSize: "12px", flexShrink: 0 }}>{hs.lanCuoi ? new Date(hs.lanCuoi).toLocaleDateString("vi-VN") : ""}</span>
                                      <span style={{ color: "#94a3b8", flexShrink: 0 }}>{dangXem ? "▲" : "▼"}</span>
                                    </>
                                  ) : (
                                    <span style={{ color: "#b45309", fontWeight: "bold", flexShrink: 0 }}>chưa vào lần nào</span>
                                  )}
                                </div>
                                {dangXem && (
                                  <div style={{ padding: "4px 12px 10px 24px", background: "#f8fafc" }}>
                                    {hs.chiTiet.map((ct: any) => (
                                      <div key={ct.tag} style={{ display: "flex", justifyContent: "space-between", gap: "10px", fontSize: "12.5px", color: "#475569", padding: "3px 0" }}>
                                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{TEN_BAI[ct.tag] || ct.tag}</span>
                                        <span style={{ flexShrink: 0, fontWeight: "bold" }}>{ct.soLuot} lượt · {doiGiay(ct.tongGiay || 0)}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: "8px", marginBottom: "14px" }}>
                    <textarea
                      value={tenHocSinhMoi}
                      onChange={(e) => setTenHocSinhMoi(e.target.value)}
                      placeholder={"Hoặc gõ tay mỗi học sinh một dòng, ví dụ:\nNguyễn Văn A\nTrần Thị B"}
                      rows={2}
                      style={{ flex: 1, padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none", fontSize: "13px", resize: "vertical" }}
                    />
                    <button onClick={() => themHocSinhTay(c.id)} disabled={busy} style={{ background: "#10b981", color: "#fff", border: "none", borderRadius: "8px", padding: "0 16px", cursor: "pointer", fontWeight: "bold", fontSize: "13px" }}>+ Thêm</button>
                  </div>

                  {dangTaiHocSinh === c.id ? (
                    <p style={{ color: "#64748b" }}>Đang tải danh sách...</p>
                  ) : (dsHocSinh[c.id] || []).length ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {(dsHocSinh[c.id] || []).map((hs: any) => (
                        <div key={hs.email} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: "#f8fafc", borderRadius: "8px", fontSize: "13px", gap: "8px" }}>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{hs.name}</span>
                          <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                            <button onClick={() => resetMatKhau(hs.email, hs.name)} disabled={busy} title="Cấp lại mật khẩu mới" style={{ background: "#fef3c7", color: "#92400e", border: "none", borderRadius: "6px", padding: "4px 8px", cursor: "pointer", fontSize: "12px" }}>🔑 Đặt lại MK</button>
                            <button onClick={() => xoaHocSinh(c.id, hs.email, hs.name)} disabled={busy} title="Xóa khỏi lớp" style={{ background: "#fee2e2", color: "#b91c1c", border: "none", borderRadius: "6px", padding: "4px 8px", cursor: "pointer", fontSize: "12px" }}>🗑️</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ color: "#64748b", fontStyle: "italic", fontSize: "13px" }}>Lớp chưa có học sinh nào. Thêm bằng Excel hoặc gõ tay ở trên.</p>
                  )}
                </div>
              )}
            </article>
          );
        })}
        {!classesList.length && <p style={{ color: "#64748b", fontStyle: "italic" }}>Chưa có lớp học nào. Tạo lớp đầu tiên ở ô phía trên.</p>}
      </div>
    </div>
  );
}

function anhThanhHtml(file: File): Promise<string> {
  return new Promise((ok, loi) => {
    const doc = new FileReader();
    doc.onerror = () => loi(new Error("Không đọc được tệp ảnh"));
    doc.onload = () => {
      const img = new Image();
      img.onerror = () => loi(new Error("Tệp này không phải ảnh hợp lệ"));
      img.onload = () => {
        const tile = Math.min(1, ANH_RONG_TOI_DA / (img.width || 1));
        const c = document.createElement("canvas");
        c.width = Math.round((img.width || 1) * tile);
        c.height = Math.round((img.height || 1) * tile);
        const ctx = c.getContext("2d");
        if (!ctx) return loi(new Error("Trình duyệt không hỗ trợ xử lý ảnh"));
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);

        let ket = c.toDataURL("image/jpeg", 0.82);
        if (ket.length > ANH_NANG_TOI_DA) ket = c.toDataURL("image/jpeg", 0.6);
        if (ket.length > ANH_NANG_TOI_DA) ket = c.toDataURL("image/jpeg", 0.4);
        if (ket.length > ANH_NANG_TOI_DA) return loi(new Error("Ảnh quá nặng dù đã nén, thầy cô cắt bớt hoặc chụp lại nhỏ hơn giúp em"));
        ok(`<img src="${ket}" alt="" style="max-width:100%;height:auto;border-radius:8px;margin:10px 0" />`);
      };
      img.src = String(doc.result || "");
    };
    doc.readAsDataURL(file);
  });
}

// Khung soạn nội dung có nút chèn ảnh, dùng chung cho Kiến thức trọng tâm và Luyện tập.
function OSoanNoiDung({ nhan, giaTri, setGiaTri, goiY, mauNen }: any) {
  const oRef = useRef<HTMLTextAreaElement | null>(null);
  const [dangXuLy, setDangXuLy] = useState(false);

  // LỖI CŨ: chenVaoConTro đọc "giaTri" (prop chụp lại lúc render), rồi themTuMay
  // gọi hàm này NHIỀU LẦN liên tiếp trong một vòng lặp khi chọn nhiều ảnh cùng
  // lúc. Vì "giaTri" không tự cập nhật giữa các lần gọi trong cùng một lượt
  // chạy, ảnh sau tính chèn-vào-vị-trí dựa trên nội dung CŨ (chưa có ảnh vừa
  // chèn trước đó) rồi ghi đè lên — cuối cùng chỉ còn đúng ảnh cuối cùng.
  // Sửa bằng setGiaTri dạng hàm (functional update) để luôn cộng dồn trên
  // giá trị mới nhất, bất kể gọi bao nhiêu lần liên tiếp.
  const chenVaoConTro = (doan: string) => {
    const o = oRef.current;
    setGiaTri((truoc: string) => {
      const vt = o && typeof o.selectionStart === "number" ? o.selectionStart : truoc.length;
      return truoc.slice(0, vt) + "\n" + doan + "\n" + truoc.slice(vt);
    });
  };

  const themTuMay = async (fs: FileList | null) => {
    if (!fs || !fs.length) return;
    setDangXuLy(true);
    // Xử lý xong HẾT các ảnh rồi mới chèn MỘT LẦN duy nhất (nối các ảnh lại),
    // thay vì gọi chenVaoConTro nhiều lần — vừa nhanh hơn (một lần render),
    // vừa tránh hẳn kiểu lỗi ghi đè ở trên dù sau này có sửa lại cách chèn.
    const anhs = Array.from(fs).filter((f) => f.type.startsWith("image/"));
    const doans: string[] = [];
    const loi: string[] = [];
    for (const f of anhs) {
      try {
        doans.push(await anhThanhHtml(f));
      } catch (err: any) {
        loi.push(`${f.name}: ${err?.message || "không chèn được"}`);
      }
    }
    if (doans.length) chenVaoConTro(doans.join("\n"));
    if (loi.length) alert(`Chèn được ${doans.length}/${anhs.length} ảnh. Ảnh lỗi:\n` + loi.join("\n"));
    setDangXuLy(false);
  };

  const idFile = `anh-${nhan.replace(/\s/g, "")}`;

  return (
    <div>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "8px" }}>
        <label
          htmlFor={idFile}
          style={{ padding: "8px 14px", borderRadius: "8px", border: "1px solid #cbd5e1", background: "#f8fafc", cursor: dangXuLy ? "wait" : "pointer", fontWeight: "bold", fontSize: "13px" }}
        >
          {dangXuLy ? "⏳ Đang xử lý ảnh..." : "🖼️ Chèn ảnh từ máy"}
        </label>
        <input id={idFile} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={(e) => { themTuMay(e.target.files); e.currentTarget.value = ""; }} />

        <button
          onClick={() => {
            const u = prompt("Dán đường dẫn ảnh (https://...)");
            if (u && u.trim()) chenVaoConTro(`<img src="${u.trim()}" alt="" style="max-width:100%;height:auto;border-radius:8px;margin:10px 0" />`);
          }}
          style={{ padding: "8px 14px", borderRadius: "8px", border: "1px solid #cbd5e1", background: "#f8fafc", cursor: "pointer", fontWeight: "bold", fontSize: "13px" }}
        >
          🔗 Chèn ảnh từ đường dẫn
        </button>

        <button
          onClick={() => window.open("/v17.html", "_blank")}
          style={{ padding: "8px 14px", borderRadius: "8px", border: "1px solid #fcd34d", background: "#fffbeb", color: "#b45309", cursor: "pointer", fontWeight: "bold", fontSize: "13px" }}
        >
          🎨 Mở Xưởng Ảnh → HTML
        </button>
      </div>

      <textarea
        ref={oRef}
        value={giaTri}
        onChange={(e) => setGiaTri(e.target.value)}
        onPaste={(e) => {
          const anh = Array.from(e.clipboardData?.files || []).filter((f) => f.type.startsWith("image/"));
          if (anh.length) { e.preventDefault(); themTuMay(e.clipboardData.files); }
        }}
        placeholder={goiY}
        style={{ width: "100%", minHeight: "260px", padding: "14px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "15px", lineHeight: "1.6", fontFamily: "inherit", resize: "vertical", background: mauNen || "#fff" }}
      />
      <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
        Chụp màn hình rồi dán thẳng (Ctrl+V) vào ô này cũng chèn được ảnh — chọn NHIỀU ảnh một lúc cũng được. Ảnh tự thu nhỏ còn tối đa {ANH_RONG_TOI_DA}px.
        Lưu ý: Kiến thức trọng tâm + Sơ đồ tư duy + Luyện tập cộng lại chỉ được khoảng 1,7MB, nên chèn vài ảnh vừa phải cho mỗi mục.
      </div>
    </div>
  );
}

// Khung sửa một danh sách liên kết (thêm / xóa / đổi thứ tự tên và địa chỉ).
function BoSuaLink({ nhan, ds, setDs, goiY }: any) {
  const sua = (i: number, khoa: string, v: string) => setDs(ds.map((x: any, j: number) => (j === i ? { ...x, [khoa]: v } : x)));

  return (
    <div style={{ marginTop: "18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
        <label style={{ fontWeight: "bold", color: "#334155", fontSize: "15px" }}>{nhan} <span style={{ color: "#64748b", fontWeight: 600 }}>({ds.length} liên kết)</span></label>
        <button
          onClick={() => setDs([...ds, { ten: "", url: "" }])}
          style={{ padding: "6px 14px", borderRadius: "6px", border: "1px solid #cbd5e1", background: "#f8fafc", cursor: "pointer", fontWeight: "bold", fontSize: "13px" }}
        >
          + Thêm liên kết
        </button>
      </div>

      {!ds.length && <p style={{ fontSize: "13px", color: "#94a3b8", margin: "8px 0 0" }}>Chưa có liên kết nào. Học sinh sẽ thấy mục này là &quot;chưa soạn&quot;.</p>}

      {ds.map((l: any, i: number) => (
        <div key={i} style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "8px" }}>
          <input
            value={l.ten || ""} onChange={(e) => sua(i, "ten", e.target.value)} placeholder="Tên hiện cho học sinh (vd: Săn trứng khủng long)"
            style={{ flex: "1 1 200px", padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
          />
          <input
            value={l.url || ""} onChange={(e) => sua(i, "url", e.target.value)} placeholder={goiY}
            style={{ flex: "2 1 280px", padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
          />
          <button
            onClick={() => setDs(ds.filter((_: any, j: number) => j !== i))}
            style={{ padding: "10px 14px", borderRadius: "8px", border: "none", background: "#fee2e2", color: "#b91c1c", cursor: "pointer", fontWeight: "bold" }}
          >
            🗑️
          </button>
        </div>
      ))}
    </div>
  );
}

// ==========================================
// SOẠN HỌC LIỆU CHO TỪNG BÀI
// Nội dung ở đây chính là thứ học sinh thấy khi bấm "Kiến thức trọng tâm".
// Chấp nhận HTML và công thức $...$ nên dán thẳng từ Xưởng giáo án được.
// ==========================================
function SoanHocLieu({ hocLieu, act, busy, triggerMath }: any) {
  const [khoi, setKhoi] = useState("12");
  const [tag, setTag] = useState("chuong1_bai1");
  const dsChuong = chuongTrinhKhoi(khoi);
  const doiKhoi = (k: string) => { setKhoi(k); const ct = chuongTrinhKhoi(k); if (ct[0]?.bai[0]) setTag(ct[0].bai[0][0]); };
  const [kienThuc, setKienThuc] = useState("");
  const [soDoTuDuy, setSoDoTuDuy] = useState("");
  const [dsGame, setDsGame] = useState<any[]>([]);
  const [dsVideo, setDsVideo] = useState<any[]>([]);
  const [luyenTap, setLuyenTap] = useState("");
  const [xemThu, setXemThu] = useState(false);

  const hienTai = useMemo(() => (hocLieu || []).find((h: any) => h.tag === tag) || {}, [hocLieu, tag]);

  // Đổi bài thì nạp lại nội dung đã lưu của bài đó.
  useEffect(() => {
    setKienThuc(String(hienTai.kienThuc || ""));
    setSoDoTuDuy(String(hienTai.soDoTuDuy || ""));
    setDsGame(Array.isArray(hienTai.gameLinks) ? hienTai.gameLinks.map((x: any) => ({ ...x })) : []);
    setDsVideo(Array.isArray(hienTai.videoLinks) ? hienTai.videoLinks.map((x: any) => ({ ...x })) : []);
    setLuyenTap(String(hienTai.luyenTap || ""));
    setXemThu(false);
  }, [tag, hienTai]);

  useEffect(() => { if (xemThu) triggerMath(); }, [xemThu, triggerMath]);

  const daSoan = new Set((hocLieu || []).filter((h: any) => String(h.kienThuc || "").trim()).map((h: any) => h.tag));

  return (
    <div>
      <div style={{ background: "#fff", padding: "24px", borderRadius: "12px", border: "1px solid #cbd5e1", marginBottom: "20px" }}>
        <h3 style={{ marginTop: 0, color: "#1e3a8a" }}>📘 Chọn bài cần soạn học liệu</h3>
        <div style={{ display: "flex", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
          {["10", "11", "12"].map((k) => (
            <button key={k} type="button" onClick={() => doiKhoi(k)}
              style={{ padding: "8px 18px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", border: khoi === k ? "2px solid #1e3a8a" : "1px solid #cbd5e1", background: khoi === k ? "#1e3a8a" : "#fff", color: khoi === k ? "#fff" : "#1e293b" }}>
              Khối {k}
            </button>
          ))}
        </div>
        <select
          value={tag} onChange={(e) => setTag(e.target.value)}
          style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "15px", background: "#fff" }}
        >
          {dsChuong.map((c) => (
            <optgroup key={c.ma} label={`Chương ${c.so} — ${c.ten}`}>
              {c.bai.map(([ma, ten]) => (
                <option key={ma} value={ma}>{daSoan.has(ma) ? "✓ " : "○ "}{ten}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <p style={{ fontSize: "13px", color: "#64748b", margin: "8px 0 0" }}>
          Dấu ✓ là bài đã có kiến thức trọng tâm. Khối {khoi}: đã soạn {dsChuong.reduce((t, c) => t + c.bai.filter(([ma]) => daSoan.has(ma)).length, 0)} / {dsChuong.reduce((t, c) => t + c.bai.length, 0)} bài. Học sinh lớp {khoi} (tên lớp bắt đầu bằng {khoi}, ví dụ {khoi}A1) sẽ thấy các chương này.
        </p>
      </div>

      <div style={{ background: "#fff", padding: "24px", borderRadius: "12px", border: "1px solid #cbd5e1" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginBottom: "10px" }}>
          <h3 style={{ margin: 0, color: "#1e3a8a" }}>Kiến thức trọng tâm</h3>
          <button
            onClick={() => setXemThu(!xemThu)}
            style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid #cbd5e1", background: xemThu ? "#1e3a8a" : "#f8fafc", color: xemThu ? "#fff" : "#1e293b", cursor: "pointer", fontWeight: "bold" }}
          >
            {xemThu ? "✏️ Quay lại soạn" : "👁️ Xem thử như học sinh"}
          </button>
        </div>

        {xemThu ? (
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "12px", padding: "20px", minHeight: "200px" }}>
            {kienThuc.trim()
              ? <MathText html={kienThuc} style={{ fontSize: "16px", lineHeight: "1.75", color: "#14532d" }} />
              : <p style={{ margin: 0, color: "#166534" }}>Chưa có nội dung.</p>}
            <hr style={{ border: "none", borderTop: "1px dashed #bbf7d0", margin: "20px 0" }} />
            <h4 style={{ margin: "0 0 10px", color: "#166534" }}>🧠 Sơ đồ tư duy</h4>
            {soDoTuDuy.trim()
              ? <MathText html={soDoTuDuy} style={{ fontSize: "16px", lineHeight: "1.75", color: "#14532d" }} />
              : <p style={{ margin: 0, color: "#166534" }}>Chưa có sơ đồ tư duy.</p>}
            <hr style={{ border: "none", borderTop: "1px dashed #bbf7d0", margin: "20px 0" }} />
            <h4 style={{ margin: "0 0 10px", color: "#166534" }}>✏️ Luyện tập</h4>
            {luyenTap.trim()
              ? <MathText html={luyenTap} style={{ fontSize: "16px", lineHeight: "1.75", color: "#14532d" }} />
              : <p style={{ margin: 0, color: "#166534" }}>Chưa có bài luyện tập.</p>}
          </div>
        ) : (
          <OSoanNoiDung
            nhan="kienthuc"
            giaTri={kienThuc} setGiaTri={setKienThuc}
            goiY={"Dán nội dung bài học vào đây. Dùng được HTML (<b>, <ul>, <table>…) và công thức $y' = 3x^2$."}
          />
        )}

        {!xemThu && (
          <div style={{ marginTop: "22px", paddingTop: "18px", borderTop: "1px solid #e2e8f0" }}>
            <label style={{ fontWeight: "bold", color: "#334155", fontSize: "15px", display: "block", marginBottom: "4px" }}>🧠 Sơ đồ tư duy</label>
            <p style={{ fontSize: "13px", color: "#64748b", margin: "0 0 8px" }}>
              Ảnh sơ đồ tư duy tổng quan cả bài — chèn ảnh chụp tay hoặc vẽ ở Xưởng Ảnh → HTML, giống hệt cách soạn Kiến thức trọng tâm.
            </p>
            <OSoanNoiDung
              nhan="sodotuduy"
              giaTri={soDoTuDuy} setGiaTri={setSoDoTuDuy}
              goiY={"Chèn ảnh sơ đồ tư duy tổng quan cả bài (từ máy, từ đường dẫn, hoặc vẽ ở Xưởng Ảnh → HTML)."}
            />
          </div>
        )}

        <BoSuaLink nhan="🎮 Game tương tác" ds={dsGame} setDs={setDsGame} goiY="https://dinhcaotritue.com/game/" />

        <BoSuaLink nhan="🎬 Video bài giảng" ds={dsVideo} setDs={setDsVideo} goiY="https://youtube.com/watch?v=..." />

        {!xemThu && (
          <div style={{ marginTop: "22px", paddingTop: "18px", borderTop: "1px solid #e2e8f0" }}>
            <label style={{ fontWeight: "bold", color: "#334155", fontSize: "15px", display: "block", marginBottom: "4px" }}>✏️ Luyện tập</label>
            <p style={{ fontSize: "13px", color: "#64748b", margin: "0 0 8px" }}>
              Bài tập soạn thẳng ở đây để làm sáng phần kiến thức trọng tâm ở trên, không phải danh sách liên kết.
            </p>
            <OSoanNoiDung
              nhan="luyentap"
              giaTri={luyenTap} setGiaTri={setLuyenTap}
              goiY={"Bài tập vận dụng, ví dụ minh họa, bài mẫu có lời giải… Dùng được HTML, ảnh và công thức $...$."}
            />
          </div>
        )}

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "18px" }}>
          <button
            disabled={busy}
            onClick={() => act({ action: "luuHocLieu", tag, kienThuc, soDoTuDuy, luyenTap, gameLinks: dsGame.filter((x) => String(x.url || "").trim()), videoLinks: dsVideo.filter((x) => String(x.url || "").trim()) })}
            style={{ background: "#1e3a8a", color: "#fff", border: "none", padding: "12px 24px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", fontSize: "15px" }}
          >
            💾 Lưu học liệu cho bài này
          </button>
          {!!hienTai.tag && (
            <button
              disabled={busy}
              onClick={() => { if (confirm(`Xóa toàn bộ học liệu của "${TEN_BAI[tag]}"?`)) act({ action: "xoaHocLieu", tag }); }}
              style={{ background: "#fee2e2", color: "#b91c1c", border: "none", padding: "12px 20px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer" }}
            >
              🗑️ Xóa học liệu bài này
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ==========================================
// THANG ĐIỂM TỰ CHỌN CHO TỪNG ĐỀ
// Trước đây điểm mỗi phần lấy cứng từ file JSON của Xưởng V15, muốn đổi phải
// vào tận Xưởng sửa lại rồi xuất đề mới. Nay đặt ngay lúc phát bài.
// ==========================================
function ThangDiem({ meta, setMeta, qs }: any) {
  const dem = demTungPhan(qs || []);

  // Tổng điểm phần tự luận theo barem gốc, để hiện gợi ý khi thầy cô để trống ô tự luận.
  const baremGoc = (qs || [])
    .filter((q: any) => questionType(q) === "essay")
    .reduce((t: number, q: any) => t + (q.barem || []).reduce((u: number, b: any) => u + (Number(b?.diem) || 0), 0), 0);

  const diemTL = Number(meta.scTl) > 0 ? Number(meta.scTl) : baremGoc;
  const tong =
    dem.mcq * (Number(meta.scMcq) || 0) + dem.tf * (Number(meta.scTf) || 0) + dem.sa * (Number(meta.scSa) || 0) + (dem.essay ? diemTL : 0);

  const o = (khoa: string, nhan: string, soCau: number, ghiChu: string) => (
    <div style={{ flex: "1 1 150px", background: "#fff", border: "1px solid #cbd5e1", borderRadius: "8px", padding: "10px 12px", opacity: soCau ? 1 : 0.5 }}>
      <div style={{ fontSize: "13px", fontWeight: "bold", color: "#1e3a8a" }}>{nhan}</div>
      <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "6px" }}>{soCau} câu · {ghiChu}</div>
      <input
        type="number" min={0} step={0.05} value={meta[khoa]}
        onChange={(e) => setMeta({ ...meta, [khoa]: e.target.value === "" ? "" : Math.max(0, parseFloat(e.target.value) || 0) })}
        style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "16px", fontWeight: "bold", color: "#1e3a8a" }}
      />
    </div>
  );

  return (
    <div>
      <div style={{ fontWeight: "bold", color: "#334155", marginBottom: "8px" }}>🎯 Thang điểm cho đề này</div>
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        {o("scMcq", "Trắc nghiệm", dem.mcq, "điểm mỗi câu")}
        {o("scTf", "Đúng – Sai", dem.tf, "điểm khi đúng cả 4 ý")}
        {o("scSa", "Trả lời ngắn", dem.sa, "điểm mỗi câu")}
        {o("scTl", "Tự luận", dem.essay, "tổng cả phần")}
      </div>
      <div style={{ fontSize: "13px", color: "#64748b", marginTop: "8px", lineHeight: "1.6" }}>
        Phần Đúng – Sai tự chia theo tỉ lệ của Bộ: đúng 1 ý được 10%, 2 ý 25%, 3 ý 50%, đủ 4 ý ăn trọn điểm.
        {dem.essay > 0 && <> Ô tự luận để <b>0</b> thì giữ nguyên barem đã soạn (hiện là {baremGoc} điểm); nhập số khác thì barem co giãn theo tỉ lệ.</>}
        <br />
        Tổng điểm tối đa của đề: <b style={{ color: "#1e3a8a" }}>{Math.round(tong * 100) / 100}</b> — điểm học sinh nhìn thấy luôn quy về thang 10 theo tỉ lệ này.
      </div>
    </div>
  );
}

function StatCard({ label, value, color = "#1e3a8a" }: { label: string; value: any; color?: string }) {
  return (
    <article style={{ background: "#fff", padding: "20px", borderRadius: "12px", border: "1px solid #cbd5e1", textAlign: "center" }}>
      <small style={{ color: "#64748b", fontWeight: "bold" }}>{label}</small>
      <div style={{ fontSize: "32px", color, fontWeight: 900, margin: "10px 0" }}>{value}</div>
    </article>
  );
}

// ==========================================
// KHU VỰC HỌC SINH
// ==========================================
function Student({ active, data, busy, act, answers, setAnswers, triggerMath }: any) {
  const [join, setJoin] = useState("");
  // "kt15" / "kt1tiet" = hai nhóm bài kiểm tra; còn lại là mã chương đang mở.
  const [tabHoc, setTabHoc] = useState("kt15");
  const [shuffledExams, setShuffledExams] = useState<Record<string, any[]>>({});
  const [examTimers, setExamTimers] = useState<Record<string, number>>({});
  const [warnings, setWarnings] = useState<Record<string, number>>({});
  const [warningModal, setWarningModal] = useState<string | null>(null);

  const email = data.user?.email || "guest";
  const ANSWER_KEY = `v17_answers_${email}`;
  const DEADLINE_KEY = `v17_deadlines_${email}`;
  const WARN_KEY = `v17_warnings_${email}`;

  const actRef = useRef(act);
  const answersRef = useRef(answers);
  const warnRef = useRef<Record<string, number>>({});
  const submittedRef = useRef<Set<string>>(new Set());
  
  const isConfirmingRef = useRef(false);

  useEffect(() => { actRef.current = act; });
  useEffect(() => { answersRef.current = answers; }, [answers]);

  useEffect(() => {
    setAnswers(safeParse<Record<string, Record<string, string>>>(localStorage.getItem(ANSWER_KEY), {}));
    warnRef.current = safeParse<Record<string, number>>(localStorage.getItem(WARN_KEY), {});
    setWarnings(warnRef.current);
  }, [ANSWER_KEY, WARN_KEY, setAnswers]);

  const currentExams = useMemo(() => {
    const exams: any[] = data.exams || [];
    const groups: Record<string, any[]> = {};
    exams.forEach((e: any) => {
      const baseTitle = String(e.title || "").replace(/\s*[-–(]\s*(Đề|Mã|Version|Phần).*$/i, "").trim() || String(e.id);
      (groups[baseTitle] ||= []).push(e);
    });

    const assigned: any[] = [];
    Object.keys(groups).forEach((baseTitle) => {
      const variants = groups[baseTitle];
      if (variants.length === 1) return assigned.push(variants[0]);
      let hash = 0;
      const seed = `${email}::${baseTitle}`;
      for (let i = 0; i < seed.length; i++) {
        hash = (hash << 5) - hash + seed.charCodeAt(i);
        hash |= 0;
      }
      assigned.push(variants[Math.abs(hash) % variants.length]);
    });
    return assigned;
  }, [data.exams, email]);

  const submitExam = useCallback(
    async (e: any, endTime?: number) => {
      if (submittedRef.current.has(e.id)) return;
      submittedRef.current.add(e.id);
      const durMs = (Number(e.durationMinutes) || 45) * 60 * 1000;
      const startedAt = new Date((endTime ? endTime - durMs : Date.now() - durMs)).toISOString();
      const kq = await actRef.current({ action: "submitExam", examId: e.id, answers: answersRef.current[e.id] || {}, startedAt });

      // LỖI CŨ NGHIÊM TRỌNG: đánh dấu đã nộp NGAY LẬP TỨC, không chờ kết quả.
      // Rớt mạng một nhịp là học sinh bị khóa vĩnh viễn, không thể nộp lại -> mất trắng bài thi.
      if (!kq || kq.error) {
        submittedRef.current.delete(e.id);
        return;
      }

      // Nộp thành công thì dọn bài nháp đã lưu tạm, tránh phình bộ nhớ trình duyệt
      try {
        const conLai = { ...(answersRef.current || {}) };
        delete conLai[e.id];
        localStorage.setItem(ANSWER_KEY, JSON.stringify(conLai));
        const hanCu = safeParse<Record<string, number>>(localStorage.getItem(DEADLINE_KEY), {});
        delete hanCu[e.id];
        localStorage.setItem(DEADLINE_KEY, JSON.stringify(hanCu));
      } catch {}
    },
    [ANSWER_KEY, DEADLINE_KEY]
  );

  useEffect(() => {
    if (!currentExams.length) return;
    const savedDeadlines = safeParse<Record<string, number>>(localStorage.getItem(DEADLINE_KEY), {});
    const now = Date.now();
    const nextShuffle: Record<string, any[]> = {};
    const nextTimers: Record<string, number> = {};
    let shuffleChanged = false;
    let timerChanged = false;

    currentExams.forEach((e: any) => {
      if (!shuffledExams[e.id]) {
        // LỖI CŨ: máy chủ đã xếp đề theo Phần I → II → III → IV và trong mỗi phần đi từ
        // Nhận biết đến Vận dụng cao, nhưng trình duyệt lại TRỘN NGẪU NHIÊN thêm một lần
        // nữa — học sinh gặp câu Vận dụng cao ngay từ Câu 1, xen lẫn đủ mọi mức độ.
        // Nay giữ nguyên thứ tự máy chủ đã xếp.
        nextShuffle[e.id] = (e.publicQuestions || []).map((q: any, idx: number) => ({
          ...q,
          id: q?.id != null && String(q.id) !== "" ? String(q.id) : `q${idx + 1}`,
        }));
        shuffleChanged = true;
      }
      if (!examTimers[e.id]) {
        nextTimers[e.id] = savedDeadlines[e.id] ?? now + (Number(e.durationMinutes) || 45) * 60 * 1000;
        timerChanged = true;
      }
    });

    if (shuffleChanged) setShuffledExams((prev) => ({ ...prev, ...nextShuffle }));
    if (timerChanged) {
      setExamTimers((prev) => {
        const merged = { ...prev, ...nextTimers };
        try { localStorage.setItem(DEADLINE_KEY, JSON.stringify(merged)); } catch {}
        return merged;
      });
    }
    if (shuffleChanged) triggerMath();
  }, [currentExams, DEADLINE_KEY, shuffledExams, examTimers, triggerMath]);

  useEffect(() => {
    // Bài thi năng lực cũng làm trong khung này nên phải giám sát y hệt,
    // nếu không học sinh chỉ cần vào mục "Đánh Giá Năng Lực" là thoát mọi cảnh báo.
    if (active !== "Bài cần làm" && active !== "Năng lực") return;

    let cooldown = false;

    const handleCheat = () => {
      if (cooldown || isConfirmingRef.current) return;
      
      let hasActiveExam = false;
      currentExams.forEach((e: any) => {
        const done = (data.attempts || []).some((a: any) => a.examId === e.id) || submittedRef.current.has(e.id);
        if (!done) hasActiveExam = true;
      });
      if (!hasActiveExam) return;

      cooldown = true;
      setTimeout(() => { cooldown = false; }, 1000);

      let showMsg = "";
      let autoSubmit = false;

      currentExams.forEach((e: any) => {
        const done = (data.attempts || []).some((a: any) => a.examId === e.id) || submittedRef.current.has(e.id);
        if (done) return;

        const count = (warnRef.current[e.id] || 0) + 1;
        warnRef.current = { ...warnRef.current, [e.id]: count };
        setWarnings({ ...warnRef.current });
        try { localStorage.setItem(WARN_KEY, JSON.stringify(warnRef.current)); } catch {}

        if (count >= 3) {
          submitExam(e, examTimers[e.id]);
          autoSubmit = true;
          showMsg = `🚨 BẠN ĐÃ CHUYỂN TAB QUÁ 3 LẦN!\n\nBài thi "${e.title}" của bạn đã bị hệ thống khóa và tự động nộp bài!`;
        } else if (!autoSubmit) {
          showMsg = `⚠️ CẢNH BÁO GIAN LẬN (${count}/3)\n\nBạn vừa chuyển tab hoặc rời khỏi màn hình làm bài!\n\nNghiêm cấm mọi hành vi tra cứu. Nếu vi phạm thêm ${3 - count} lần nữa bài thi sẽ bị thu tự động.`;
        }
      });

      if (showMsg) setWarningModal(showMsg);
    };

    // LỖI CŨ NGHIÊM TRỌNG: nghe sự kiện "blur" của window.
    // blur bắn cả khi học sinh bấm vào thanh địa chỉ, bấm ra ngoài cửa sổ, hoặc khi
    // chính hộp thoại alert/confirm của hệ thống hiện lên -> cảnh báo oan và có thể
    // TỰ THU BÀI của em không hề gian lận. Chỉ giữ visibilitychange (thật sự chuyển tab).
    const onVis = () => { if (document.hidden) handleCheat(); };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [active, currentExams, data.attempts, examTimers, submitExam, WARN_KEY]);

  const handleAnswerChange = useCallback(
    (examId: string, qId: string, val: string) => {
      setAnswers((prev: any) => {
        const updated = { ...prev, [examId]: { ...(prev[examId] || {}), [qId]: val } };
        try { localStorage.setItem(ANSWER_KEY, JSON.stringify(updated)); } catch {}
        return updated;
      });
    },
    [ANSWER_KEY, setAnswers]
  );

  // Ghép chuỗi Đúng/Sai tại một chỗ duy nhất và luôn dựa trên trạng thái mới nhất (prev),
  // nên chọn ý nào cũng không làm mất lựa chọn của ba ý còn lại.
  const handleTfChange = useCallback(
    (examId: string, qId: string, j: number, ch: string) => {
      setAnswers((prev: any) => {
        const hienTai = prev?.[examId]?.[qId] || TF_EMPTY;
        const moi = tfSetChar(hienTai, j, tfCharAt(hienTai, j) === ch ? "-" : ch);
        const updated = { ...prev, [examId]: { ...(prev[examId] || {}), [qId]: moi } };
        try { localStorage.setItem(ANSWER_KEY, JSON.stringify(updated)); } catch {}
        return updated;
      });
    },
    [ANSWER_KEY, setAnswers]
  );

  if (active === "Kết quả") {
    const list: any[] = data.attempts || [];
    const best = list.length ? Math.max(...list.map((a: any) => toScale10(a.score, a.maxScore))) : null;
    const mean = list.length ? list.reduce((s: number, a: any) => s + toScale10(a.score, a.maxScore), 0) / list.length : null;
    // Trang này giờ chứa luôn KẾT QUẢ TỪNG BÀI KIỂM TRA, không chỉ ba con số tổng quát.
    const tenDe = (examId: any) => (data.exams || []).find((e: any) => e.id === examId)?.title || `Bài #${examId}`;

    return (
      <div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "20px", marginBottom: "24px" }}>
          <StatCard label="Bài đã nộp" value={list.length} />
          <StatCard label="Điểm cao nhất" value={best === null ? "—" : best.toFixed(1)} color="#10b981" />
          <StatCard label="Điểm trung bình" value={mean === null ? "—" : mean.toFixed(1)} color="#2563eb" />
        </div>

        <div style={{ background: "#fff", border: "1px solid #cbd5e1", borderRadius: "12px", padding: "24px" }}>
          <h3 style={{ marginTop: 0, color: "#1e3a8a" }}>🎯 Kết quả từng bài kiểm tra</h3>
          {!list.length && <p style={{ color: "#64748b", margin: 0 }}>Em chưa nộp bài kiểm tra nào.</p>}

          <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "12px" }}>
            {list.map((a: any) => {
              const d10 = toScale10(a.score, a.maxScore);
              const mau = d10 >= 8 ? "#10b981" : d10 >= 6.5 ? "#2563eb" : d10 >= 5 ? "#b45309" : "#b91c1c";
              return (
                <div key={a.id} style={{ border: "1px solid #e2e8f0", borderRadius: "10px", padding: "16px", background: "#f8fafc" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontWeight: "bold", color: "#1e293b", fontSize: "16px" }}>{tenDe(a.examId)}</div>
                      <div style={{ fontSize: "13px", color: "#64748b" }}>Điểm thô: {a.score} / {a.maxScore}</div>
                    </div>
                    <div style={{ fontSize: "26px", fontWeight: 900, color: mau }}>{d10.toFixed(1)}</div>
                  </div>
                  <PhanHoiTuLuan attempt={a} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Đang có bài chưa nộp thì khóa các thẻ chương lại. Nếu không, học sinh chỉ cần
  // bấm sang "Chương I" là đọc được kiến thức trọng tâm ngay giữa giờ kiểm tra.
  const dangLamBai = currentExams.some((e: any) => !(data.attempts || []).some((a: any) => a.examId === e.id));

  // Đề thi năng lực có mục riêng ở thanh bên nên không lẫn vào hai thẻ kiểm tra.
  const demTheoLoai: Record<string, number> = { kt15: 0, kt1tiet: 0, nangluc: 0 };
  currentExams.forEach((e: any) => demTheoLoai[loaiBaiKiemTra(e)]++);

  // Mục "Đánh Giá Năng Lực" ở thanh bên dùng lại đúng khung làm bài này,
  // chỉ lọc riêng đề từ 90 phút trở lên — nhờ vậy học sinh làm bài thi năng lực
  // với đầy đủ đồng hồ, chống gian lận và nộp bài như mọi bài kiểm tra khác.
  const laNangLuc = active === "Năng lực";
  const tabDung = laNangLuc ? "nangluc" : tabHoc;
  const deDangHien = currentExams.filter((e: any) => loaiBaiKiemTra(e) === tabDung);

  return (
    <div>
      {warningModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 9999 }}>
          <div style={{ background: "#fff", padding: "30px", borderRadius: "12px", maxWidth: "450px", textAlign: "center", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.3)" }}>
            <h2 style={{ color: "#b91c1c", marginBottom: "15px", fontWeight: "900" }}>⚠️ HỆ THỐNG GIÁM SÁT</h2>
            <p style={{ fontSize: "16px", color: "#1e293b", marginBottom: "20px", whiteSpace: "pre-wrap", lineHeight: "1.5", fontWeight: "bold" }}>{warningModal}</p>
            <button style={{ background: "#1e3a8a", color: "#fff", border: "none", padding: "12px 24px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", fontSize: "15px" }} onClick={() => setWarningModal(null)}>Tôi đã hiểu và tiếp tục làm bài</button>
          </div>
        </div>
      )}

      {laNangLuc ? (
        <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "12px", padding: "16px 20px", marginBottom: "18px" }}>
          <h2 style={{ margin: 0, fontSize: "19px", color: "#1e3a8a" }}>📈 Đề thi đánh giá năng lực</h2>
          <p style={{ margin: "6px 0 0", fontSize: "14px", color: "#475569" }}>Các đề thi thử dài hơi (từ {NGUONG_NANGLUC} phút trở lên) thầy cô giao riêng cho phần luyện thi.</p>
        </div>
      ) : (
        <ThanhTabHocTap tab={tabHoc} setTab={setTabHoc} khoa={dangLamBai} dem={demTheoLoai} chuongTrinh={chuongTrinhKhoi(khoiCuaHocSinh(data.classes))} />
      )}

      {!laNangLuc && tabHoc !== "kt15" && tabHoc !== "kt1tiet" ? (
        <KhongGianChuong maChuong={tabHoc} hocLieu={data.hocLieu || []} triggerMath={triggerMath} laHocSinh={data.user?.role === "student"} chuongTrinh={chuongTrinhKhoi(khoiCuaHocSinh(data.classes))} />
      ) : (
      <div style={{ display: "flex", flexDirection: "column", gap: "24px", width: "100%" }}>
        {!(data.classes || []).length && (
          <form
            style={{ display: "flex", gap: "10px", flexWrap: "wrap", background: "#fff", border: "1px solid #cbd5e1", borderRadius: "12px", padding: "20px" }}
            onSubmit={(ev) => {
              ev.preventDefault();
              const code = join.trim();
              if (!code) return alert("Nhập mã lớp do giáo viên cung cấp.");
              act({ action: "joinClass", code });
              setJoin("");
            }}
          >
            <div style={{ flex: "1 1 100%", fontWeight: "bold", color: "#1e3a8a" }}>🏫 Em chưa vào lớp nào — nhập mã lớp thầy cô cho để nhận bài</div>
            <input value={join} onChange={(ev) => setJoin(ev.target.value.toUpperCase())} placeholder="Nhập MÃ LỚP do giáo viên cung cấp" style={{ flex: "1 1 240px", padding: "12px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none" }} />
            <button disabled={busy} style={{ background: "#10b981", color: "#fff", border: "none", padding: "0 24px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer" }}>Tham gia lớp</button>
          </form>
        )}

        {deDangHien.map((e: any) => {
          const attempt = (data.attempts || []).find((a: any) => a.examId === e.id);
          const done = !!attempt;
          const questionsList = shuffledExams[e.id] || [];
          const endTime = examTimers[e.id];
          const warned = warnings[e.id] || 0;

          return (
            <article key={e.id} className="v17-exam-card" style={{ background: "#fff", padding: "30px", borderRadius: "16px", border: "1px solid #cbd5e1", width: "100%", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", borderBottom: "2px solid #f1f5f9", paddingBottom: "12px", gap: "12px", flexWrap: "wrap" }}>
                <div>
                  <span style={{ fontSize: "14px", fontWeight: "bold", color: "#64748b", textTransform: "uppercase" }}>TOÁN 12 · {e.durationMinutes} phút</span>
                  <h2 className="v17-title" style={{ fontSize: "22px", color: "#1e3a8a", marginTop: "4px", marginBottom: "4px" }}>{e.title}</h2>
                  <p style={{ fontSize: "13px", color: "#64748b", margin: 0 }}>Mã đề riêng của bạn: <b>{e.code}</b>{warned > 0 && !done ? <span style={{color: "#b91c1c", fontWeight: "bold"}}> · Cảnh báo {warned}/3</span> : ""}</p>
                </div>
                {!done && endTime && <ExamTimer endTime={endTime} onTimeOut={() => {
                   isConfirmingRef.current = true;
                   alert("Đã hết thời gian làm bài! Hệ thống sẽ tự động thu bài của bạn.");
                   submitExam(e, endTime);
                   setTimeout(() => { isConfirmingRef.current = false; }, 1000);
                }} />}
              </div>

              {done ? (
                <div style={{ padding: "24px", background: "#f0fdf4", borderRadius: "12px", border: "1px solid #bbf7d0", marginTop: "15px", textAlign: "center" }}>
                  <div style={{ fontSize: "18px", fontWeight: "bold", color: "#166534", marginBottom: "8px" }}>✓ Đã nộp bài</div>
                  <p style={{ fontSize: "16px", color: "#15803d", margin: 0 }}>Kết quả: <b>{attempt.score} / {attempt.maxScore}</b> ({fmt10(attempt.score, attempt.maxScore)} điểm)</p>
                  <PhanHoiTuLuan attempt={attempt} />
                </div>
              ) : (
                <div>
                  <BangCauTruc qs={questionsList} />

                  <div style={{ fontSize: "13px", color: "#0ea5e9", marginBottom: "14px", background: "#f0f9ff", padding: "10px 14px", borderRadius: "8px", border: "1px solid #bae6fd" }}>
                    💾 Cứ yên tâm làm bài nhé! Câu trả lời của bạn được sao lưu liên tục trên máy.
                  </div>

                  {/* Đề nằm trong khung cuộn riêng để tiêu đề bài và đồng hồ đếm ngược
                      luôn hiện trên màn hình, học sinh không phải cuộn ngược lên xem giờ. */}
                  <div className="v17-de-cuon" style={{ border: "1px solid #e2e8f0", borderRadius: "12px", padding: "14px", background: "#fdfdfe" }}>
                    {questionsList.map((q: any, i: number) => (
                      <StudentQuestionItem key={q.id} q={q} i={i} examId={e.id} answerValue={answers[e.id]?.[q.id] || ""} onAnswerChange={handleAnswerChange} onTfChange={handleTfChange} />
                    ))}
                  </div>

                  {questionsList.some((q: any) => questionType(q) === "essay") && (
                    <div style={{ fontSize: "13px", color: "#6d28d9", background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: "8px", padding: "10px 14px", marginTop: "12px" }}>
                      ✍️ Bài có phần tự luận. Sau khi bấm nộp, hãy chờ vài giây để hệ thống chấm xong rồi mới rời trang.
                    </div>
                  )}

                  <button
                    style={{ width: "100%", marginTop: "20px", background: "#1e3a8a", padding: "16px", fontSize: "18px", fontWeight: "bold", borderRadius: "10px", cursor: "pointer", color: "#fff", border: "none" }}
                    disabled={busy || questionsList.length === 0}
                    onClick={() => {
                      isConfirmingRef.current = true;
                      
                      const answered = Object.keys(answers[e.id] || {}).length;
                      const missing = questionsList.length - answered;
                      const msg = missing > 0 ? `Bạn còn ${missing} câu chưa trả lời.\n\nBạn có CHẮC CHẮN muốn nộp bài?` : "Bạn đã sẵn sàng nộp bài?\n\n(Lưu ý: Sau khi nộp sẽ không thể thay đổi đáp án nữa)";
                      
                      if (confirm(msg)) {
                        submitExam(e, endTime);
                      }
                      
                      setTimeout(() => { isConfirmingRef.current = false; }, 1000);
                    }}
                  >
                    Nộp bài an toàn
                  </button>
                </div>
              )}
            </article>
          );
        })}
        {deDangHien.length === 0 && (
          <p style={{ color: "#64748b", textAlign: "center", padding: "40px" }}>
            Chưa có bài nào trong mục {TEN_LOAI_BAI[tabDung]}.
            {!laNangLuc && demTheoLoai.nangluc > 0 && <><br />Em có {demTheoLoai.nangluc} đề đánh giá năng lực ở mục &quot;Đánh Giá Năng Lực&quot;.</>}
          </p>
        )}
      </div>
      )}
    </div>
  );
}

// ==========================================
// THÀNH PHẦN PHỤ
// ==========================================

// Đọc kết quả chấm tự luận đã lưu kèm trong bài nộp.
function docTuLuan(attempt: any): Record<string, any> {
  const d = safeParse<any>(attempt?.answers ?? null, {});
  const tl = d?.__tuluan;
  return tl && typeof tl === "object" ? tl : {};
}
const conChoDuyet = (attempt: any) => Object.values(docTuLuan(attempt)).some((x: any) => !x?.daDuyet);

function PhanHoiTuLuan({ attempt }: any) {
  const tl = docTuLuan(attempt);
  const keys = Object.keys(tl);
  if (!keys.length) return null;

  if (conChoDuyet(attempt))
    return (
      <p style={{ fontSize: "14px", color: "#b45309", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "8px", padding: "10px 14px", marginTop: "14px", marginBottom: 0, fontWeight: "bold" }}>
        ⏳ Phần tự luận đang chờ thầy cô duyệt. Điểm hiển thị có thể thay đổi sau khi duyệt.
      </p>
    );

  return (
    <div style={{ marginTop: "14px", textAlign: "left" }}>
      {keys.map((k) => (
        <div key={k} style={{ background: "#fff", border: "1px solid #bbf7d0", borderRadius: "8px", padding: "12px 14px", marginBottom: "8px" }}>
          <b style={{ color: "#166534" }}>Tự luận · {tl[k]?.diem} điểm</b>
          {tl[k]?.nhanXet ? <p style={{ margin: "6px 0 0", fontSize: "14px", color: "#334155" }}>{tl[k].nhanXet}</p> : null}
        </div>
      ))}
    </div>
  );
}

// ==========================================
// BÀN CHẤM TỰ LUẬN CỦA GIÁO VIÊN
// AI chỉ chấm nháp theo barem; điểm chỉ được chốt khi thầy cô bấm duyệt.
// ==========================================
function ChamTuLuan({ rows, exams, act, busy }: any) {
  const [moId, setMoId] = useState<number | null>(null);
  const [nhap, setNhap] = useState<Record<string, string>>({});

  const examById = useMemo(() => {
    const m: Record<string, any> = {};
    (exams || []).forEach((e: any) => (m[e.id] = e));
    return m;
  }, [exams]);

  const danhSach = useMemo(() => {
    const ds = (rows || [])
      .map((a: any) => ({ a, tl: docTuLuan(a) }))
      .filter((x: any) => Object.keys(x.tl).length);
    // Bài chưa duyệt và bài AI không chắc chắn đưa lên đầu để thầy cô xem trước.
    const uuTien = (x: any) => {
      const chuaDuyet = Object.values(x.tl).some((y: any) => !y?.daDuyet) ? 0 : 2;
      const kemTinCay = Object.values(x.tl).some((y: any) => y?.doTinCay === "thap" || y?.doTinCay === "loi") ? 0 : 1;
      return chuaDuyet + kemTinCay;
    };
    return ds.sort((p: any, q: any) => uuTien(p) - uuTien(q));
  }, [rows]);

  if (!danhSach.length) return null;

  const soChoDuyet = danhSach.filter((x: any) => Object.values(x.tl).some((y: any) => !y?.daDuyet)).length;

  return (
    <div style={{ background: "#fff", border: "1px solid #ddd6fe", borderRadius: "12px", marginBottom: "20px", overflow: "hidden" }}>
      <div style={{ padding: "16px 20px", background: "#f5f3ff", borderBottom: "1px solid #ddd6fe" }}>
        <h3 style={{ margin: 0, color: "#5b21b6" }}>✍️ Chấm tự luận ({soChoDuyet} bài chờ duyệt / {danhSach.length} bài)</h3>
        <p style={{ margin: "6px 0 0", fontSize: "13px", color: "#6b7280" }}>
          AI chấm nháp theo barem, thầy cô sửa điểm nếu cần rồi bấm duyệt. Điểm tổng chỉ cập nhật sau khi duyệt.
        </p>
      </div>

      {danhSach.map(({ a, tl }: any) => {
        const ex = examById[a.examId];
        const cauHoi: any[] = ex?.publicQuestions || [];
        const baiLam = safeParse<any>(a.answers ?? null, {});
        const dangMo = moId === a.id;
        const chuaDuyet = Object.values(tl).some((y: any) => !y?.daDuyet);

        return (
          <div key={a.id} style={{ borderBottom: "1px solid #ede9fe" }}>
            <button
              onClick={() => setMoId(dangMo ? null : a.id)}
              style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", padding: "14px 20px", background: dangMo ? "#faf5ff" : "#fff", border: "none", cursor: "pointer", textAlign: "left", flexWrap: "wrap" }}
            >
              <span style={{ fontWeight: "bold", color: "#0f172a" }}>
                {a.studentName} <span style={{ color: "#64748b", fontWeight: "normal", fontSize: "13px" }}>· {ex?.code || a.examId}</span>
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                {chuaDuyet ? (
                  <span style={{ background: "#fef3c7", color: "#b45309", padding: "4px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: "bold" }}>Chờ duyệt</span>
                ) : (
                  <span style={{ background: "#dcfce7", color: "#166534", padding: "4px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: "bold" }}>Đã duyệt</span>
                )}
                <b style={{ color: "#1e3a8a" }}>{fmt10(a.score, a.maxScore)}</b>
                <span style={{ color: "#94a3b8" }}>{dangMo ? "▲" : "▼"}</span>
              </span>
            </button>

            {dangMo && (
              <div style={{ padding: "0 20px 20px" }}>
                {Object.keys(tl).map((qid) => {
                  const q = cauHoi.find((x: any) => String(x.id) === qid);
                  const kq = tl[qid] || {};
                  const tran = Number(q?.tongDiem) || 0;
                  const khoa = `${a.id}:${qid}`;
                  const giaTri = nhap[khoa] !== undefined ? nhap[khoa] : String(kq.diem ?? 0);

                  return (
                    <div key={qid} style={{ border: "1px solid #e2e8f0", borderRadius: "10px", padding: "16px", marginBottom: "14px", background: "#f8fafc" }}>
                      <div style={{ fontWeight: "bold", color: "#1e293b", marginBottom: "10px" }}>
                        <MathText html={q?.q || `(không tìm thấy đề câu ${qid})`} />
                      </div>

                      <div style={{ fontSize: "13px", fontWeight: "bold", color: "#475569", marginBottom: "4px" }}>Bài làm của học sinh:</div>
                      <div style={{ whiteSpace: "pre-wrap", background: "#fff", border: "1px solid #cbd5e1", borderRadius: "8px", padding: "12px", fontSize: "15px", lineHeight: "1.6", marginBottom: "12px" }}>
                        {String(baiLam?.[qid] ?? "").trim() || "(học sinh bỏ trống)"}
                      </div>

                      <div style={{ fontSize: "13px", fontWeight: "bold", color: "#475569", marginBottom: "4px" }}>
                        AI chấm nháp{kq.doTinCay ? ` · độ tin cậy: ${kq.doTinCay === "cao" ? "cao" : kq.doTinCay === "trungbinh" ? "trung bình" : kq.doTinCay === "loi" ? "không chấm được" : "thấp"}` : ""}
                      </div>
                      {(kq.chiTiet || []).length ? (
                        <ul style={{ margin: "0 0 10px", paddingLeft: "20px", fontSize: "14px", color: "#334155" }}>
                          {kq.chiTiet.map((y: any, idx: number) => (
                            <li key={idx} style={{ marginBottom: "4px" }}>
                              <b>{y.diem} đ</b> — {y.noiDung || y.id}: {y.lyDo}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p style={{ fontSize: "14px", color: "#b45309", margin: "0 0 10px" }}>{kq.nhanXet || "Chưa có kết quả chấm tự động."}</p>
                      )}

                      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                        <label style={{ fontWeight: "bold", color: "#1e3a8a" }}>Điểm chốt:</label>
                        <input
                          type="number" step={0.25} min={0} max={tran || undefined}
                          value={giaTri}
                          onChange={(ev) => setNhap({ ...nhap, [khoa]: ev.target.value })}
                          style={{ width: "110px", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "16px", fontWeight: "bold" }}
                        />
                        <span style={{ color: "#64748b", fontSize: "14px" }}>/ {tran || "?"} điểm</span>
                      </div>
                    </div>
                  );
                })}

                <button
                  disabled={busy}
                  onClick={() => {
                    const diem: Record<string, number> = {};
                    Object.keys(tl).forEach((qid) => {
                      const khoa = `${a.id}:${qid}`;
                      const v = Number(nhap[khoa] !== undefined ? nhap[khoa] : tl[qid]?.diem ?? 0);
                      diem[qid] = Number.isFinite(v) ? v : 0;
                    });
                    act({ action: "duyetTuLuan", attemptId: a.id, diem });
                  }}
                  style={{ background: "#7c3aed", color: "#fff", border: "none", padding: "12px 22px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", fontSize: "15px" }}
                >
                  ✅ Lưu điểm & duyệt bài này
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Results({ rows, exams, classes, act, busy }: any) {
  const examById = useMemo(() => {
    const m: Record<string, any> = {};
    (exams || []).forEach((e: any) => (m[e.id] = e));
    return m;
  }, [exams]);

  const classById = useMemo(() => {
    const m: Record<string, any> = {};
    (classes || []).forEach((c: any) => (m[c.id] = c));
    return m;
  }, [classes]);

  return (
    <div style={{ overflowX: "auto", background: "#fff", borderRadius: "12px", border: "1px solid #cbd5e1" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
        <thead style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
          <tr>
            <th style={{ padding: "16px", color: "#475569" }}>Học sinh</th>
            <th style={{ padding: "16px", color: "#475569" }}>Lớp</th>
            <th style={{ padding: "16px", color: "#475569" }}>Mã đề</th>
            <th style={{ padding: "16px", color: "#475569" }}>Điểm</th>
            <th style={{ padding: "16px", color: "#475569" }}>Nộp lúc</th>
            <th style={{ padding: "16px", color: "#475569", textAlign: "right" }}>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a: any) => {
            const ex = examById[a.examId];
            const cls = ex ? classById[ex.classId] : null;
            return (
              <tr key={a.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                <td style={{ padding: "16px" }}><b style={{ color: "#0f172a" }}>{a.studentName}</b><br /><small style={{ color: "#64748b" }}>{a.studentEmail}</small></td>
                <td style={{ padding: "16px" }}><span style={{ background: "#e0f2fe", color: "#0369a1", padding: "6px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: "bold" }}>{cls ? cls.name : "Không rõ"}</span></td>
                <td style={{ padding: "16px", color: "#3b82f6", fontWeight: "bold" }}>{ex?.code || a.examId}</td>
                <td style={{ padding: "16px", fontSize: "16px" }}>
                  <b>{fmt10(a.score, a.maxScore)}</b>
                  {conChoDuyet(a) && <div style={{ fontSize: "11px", color: "#b45309", fontWeight: "bold" }}>TL chờ duyệt</div>}
                </td>
                <td style={{ padding: "16px", color: "#64748b", fontSize: "14px" }}>{a.submittedAt ? new Date(a.submittedAt).toLocaleString("vi-VN") : "—"}</td>
                <td style={{ padding: "16px", textAlign: "right" }}>
                  <button
                    style={{ background: "#fee2e2", color: "#b91c1c", border: "none", padding: "8px 16px", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: "bold" }}
                    disabled={busy}
                    onClick={() => { if (confirm(`Xóa bài nộp của ${a.studentName}? Hành động không thể hoàn tác.`)) act({ action: "deleteAttempt", attemptId: a.id }); }}
                  >
                    Xóa
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!rows.length && <p style={{ padding: "30px", textAlign: "center", color: "#64748b" }}>Chưa có bài nộp nào.</p>}
    </div>
  );
}

// ==========================================
// XUẤT DỮ LIỆU
// ==========================================
const escapeHtml = (v: any) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

function buildRows(rows: any[], exams: any[]) {
  const examById: Record<string, any> = {};
  (exams || []).forEach((e: any) => (examById[e.id] = e));
  return rows
    .map((a) => {
      const ex = examById[a.examId];
      return `<tr><td>${escapeHtml(a.studentName)}</td><td>${escapeHtml(a.studentEmail)}</td><td>${escapeHtml(ex?.code || a.examId)}</td><td>${fmt10(a.score, a.maxScore)}</td><td>${a.submittedAt ? new Date(a.submittedAt).toLocaleString("vi-VN") : ""}</td></tr>`;
    })
    .join("");
}

const HEAD_ROW = "<tr><th>Học sinh</th><th>Email</th><th>Mã đề</th><th>Điểm (hệ 10)</th><th>Thời gian nộp</th></tr>";

function exportExcel(rows: any[], exams: any[]) {
  if (!rows.length) return alert("Chưa có dữ liệu để xuất.");
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"></head><body><table border="1"><thead>${HEAD_ROW}</thead><tbody>${buildRows(rows, exams)}</tbody></table></body></html>`;
  download(["\ufeff", html], "application/vnd.ms-excel", "Ket_qua_V17.xls");
}

function exportDoc(rows: any[], exams: any[]) {
  if (!rows.length) return alert("Chưa có dữ liệu để xuất.");
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>Bang diem</title></head><body><h2 style="text-align:center;">BẢNG ĐIỂM KẾT QUẢ TỔNG HỢP</h2><table border="1" style="border-collapse:collapse;width:100%;text-align:center;" cellpadding="5"><thead style="background-color:#f1f5f9;">${HEAD_ROW}</thead><tbody>${buildRows(rows, exams)}</tbody></table></body></html>`;
  download(["\ufeff", html], "application/msword", "Ket_qua_V17.doc");
}

function printPdf(rows: any[], exams: any[]) {
  if (!rows.length) return alert("Chưa có dữ liệu để in.");
  const html = `<html><head><meta charset="utf-8"><title>Bảng điểm</title><style>body{font-family:Arial,sans-serif;padding:20px;}table{border-collapse:collapse;width:100%;margin-top:20px;}th,td{border:1px solid #000;padding:10px;text-align:left;}th{background-color:#f1f5f9;}</style></head><body><h2 style="text-align:center;">BẢNG ĐIỂM KẾT QUẢ TỔNG HỢP</h2><table><thead>${HEAD_ROW}</thead><tbody>${buildRows(rows, exams)}</tbody></table></body></html>`;
  const win = window.open("", "_blank");
  if (!win) return alert("Trình duyệt đang chặn pop-up. Hãy cho phép pop-up rồi thử lại.");
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}

// ==========================================
// ĐĂNG NHẬP
// ==========================================
const loginInput: React.CSSProperties = { width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", fontSize: "15px", textAlign: "center", outline: "none", background: "#fff", boxSizing: "border-box" };
const loginTitle: React.CSSProperties = { fontSize: "13px", fontWeight: "bold", color: "#1e3a8a", letterSpacing: "1px", textTransform: "uppercase" };

// Ô mật khẩu có nút 👁 ẩn/hiện để thầy cô kiểm tra mình gõ đúng chưa.
function PasswordInput({ value, onChange, onEnter, placeholder, inputStyle }: any) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: "relative", width: "100%" }}>
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={onChange}
        onKeyDown={(e) => { if (e.key === "Enter" && onEnter) onEnter(); }}
        placeholder={placeholder}
        autoComplete="current-password"
        style={{ ...(inputStyle || loginInput), paddingLeft: inputStyle ? (inputStyle.padding || "16px") : "44px", paddingRight: "44px", width: "100%", boxSizing: "border-box" }}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        title={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
        aria-label={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
        style={{ position: "absolute", right: "6px", top: "50%", transform: "translateY(-50%)", width: "34px", height: "34px", border: "none", background: "transparent", cursor: "pointer", fontSize: "18px", lineHeight: 1, borderRadius: "8px", opacity: show ? 1 : 0.65 }}
      >
        {show ? "🙈" : "👁️"}
      </button>
    </div>
  );
}

export function LoginForm({ onLogin, onTeacherFirstLogin }: any) {
  const [name, setName] = useState("");
  const [classCode, setClassCode] = useState("");
  const [password, setPassword] = useState("");
  const [studentPassword, setStudentPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const finalName = name.trim().replace(/\s+/g, " ");
    const rawClass = classCode.trim().toUpperCase();

    if (finalName.split(" ").length < 2) {
      setError("❌ Họ và tên phải có từ 2 chữ trở lên (ví dụ: Hồ Thuyết Dũng).");
      return;
    }
    if (/\d/.test(finalName)) {
      setError("❌ Họ và tên không được chứa số.");
      return;
    }
    const isCapitalized = finalName.split(" ").every((w) => w.length > 0 && w[0] === w[0].toLocaleUpperCase("vi-VN") && w[0] !== w[0].toLocaleLowerCase("vi-VN"));
    if (!isCapitalized) {
      setError("❌ Viết hoa chữ cái đầu của mỗi từ trong tên (ví dụ: Hồ Thuyết Dũng).");
      return;
    }
    // Mã lớp giờ là mã THẬT do giáo viên cấp (hiện ở màn "Quản Lý Lớp Học"), không phải tên lớp tự gõ.
    if (!/^[A-Z0-9]{4,10}$/.test(rawClass)) {
      setError("❌ Mã lớp không hợp lệ. Hỏi giáo viên để lấy đúng mã lớp.");
      return;
    }
    if (!studentPassword.trim()) {
      setError("❌ Nhập mật khẩu giáo viên đã cấp cho em.");
      return;
    }

    setBusy(true);
    try {
      const formData = new FormData();
      formData.append("name", finalName);
      formData.append("classCode", rawClass);
      formData.append("password", studentPassword.trim());
      formData.append("roleType", "student");

      const res = await onLogin(formData);
      if (res?.error) setError(res.error);
    } catch {
      setError("❌ Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.");
    } finally {
      setBusy(false);
    }
  };

  const [gvName, setGvName] = useState("");
  const [gvPassword, setGvPassword] = useState("");

  // QUẢN TRỊ: chỉ gửi mật khẩu, máy chủ tự gán tài khoản Quản trị.
  const handleAdminLogin = async () => {
    setError("");
    if (!password) {
      setError("❌ Nhập mật khẩu Quản trị vào ô bên trên trước khi bấm nút.");
      return;
    }
    setBusy(true);
    try {
      const formData = new FormData();
      formData.append("roleType", "admin");
      formData.append("password", password);
      const res = await onLogin(formData);
      if (res?.error) setError(res.error);
    } catch {
      setError("❌ Không kết nối được máy chủ.");
    } finally {
      setBusy(false);
    }
  };

  // GIÁO VIÊN: họ tên + mật khẩu chung do Quản trị đặt.
  const handleGvLogin = async () => {
    setError("");
    const finalName = gvName.trim().replace(/\s+/g, " ");
    if (finalName.split(" ").length < 2 || /\d/.test(finalName)) {
      setError("❌ Họ và tên Giáo viên phải từ 2 chữ trở lên, không có số (ví dụ: Nguyễn Văn An).");
      return;
    }
    const isCapitalized = finalName.split(" ").every((w) => w.length > 0 && w[0] === w[0].toLocaleUpperCase("vi-VN") && w[0] !== w[0].toLocaleLowerCase("vi-VN"));
    if (!isCapitalized) {
      setError("❌ Viết hoa chữ cái đầu của mỗi từ trong tên (ví dụ: Nguyễn Văn An).");
      return;
    }
    if (!gvPassword) {
      setError("❌ Nhập mật khẩu Giáo viên.");
      return;
    }
    setBusy(true);
    try {
      const formData = new FormData();
      formData.append("roleType", "teacher");
      formData.append("name", finalName);
      formData.append("password", gvPassword);
      const res = await onLogin(formData);
      if (res?.needChange) {
        // LẦN ĐẦU ĐĂNG NHẬP: bắt buộc đặt mật khẩu riêng
        const p1 = prompt(`Chào ${finalName}!\nĐây là lần đầu đăng nhập. Hãy đặt MẬT KHẨU RIÊNG (ít nhất 8 ký tự, khác mật khẩu ban đầu).\nChỉ thầy/cô biết mật khẩu này:`);
        if (p1 === null) return setError("⚠️ Cần đặt mật khẩu riêng để vào lần đầu.");
        if (p1.trim().length < 8) return setError("❌ Mật khẩu mới cần ít nhất 8 ký tự.");
        const p2 = prompt("Nhập lại mật khẩu riêng vừa đặt:");
        if (p2 === null) return setError("⚠️ Cần đặt mật khẩu riêng để vào lần đầu.");
        if (p1.trim() !== p2.trim()) return setError("❌ Hai lần nhập mật khẩu không khớp. Thử lại.");
        const fd = new FormData();
        fd.append("name", finalName);
        fd.append("password", gvPassword);
        fd.append("newPassword", p1.trim());
        const r2 = await onTeacherFirstLogin(fd);
        if (r2?.error) setError(r2.error);
        else alert("✅ Đã đặt mật khẩu riêng. Từ lần sau, đăng nhập bằng họ tên và mật khẩu riêng này.");
        return;
      }
      if (res?.error) setError(res.error);
    } catch {
      setError("❌ Không kết nối được máy chủ.");
    } finally {
      setBusy(false);
    }
  };

  const handleForgotPassword = () => {
    alert(
      "QUÊN MẬT KHẨU\n\n" +
        "• Học sinh: nhờ giáo viên bấm \"🔑 Đặt lại MK\" trong Quản Lý Lớp Học để cấp mật khẩu mới.\n\n" +
        "• Giáo viên: liên hệ Quản trị để được CẤP LẠI mật khẩu. Sau đó đăng nhập bằng mật khẩu ban đầu và đặt mật khẩu riêng mới.\n\n" +
        "• Quản trị:\n" +
        "  1. Đăng nhập dash.cloudflare.com.\n" +
        "  2. Workers & Pages → v17-dinhcaotritue → Settings → Variables and Secrets.\n" +
        "  3. Sửa biến bí mật TEACHER_PASSWORD thành mật khẩu mới rồi bấm Deploy.\n" +
        "  Sau đó đăng nhập Quản trị bằng mật khẩu mới vừa đặt."
    );
  };

  return (
    <main className="signin" style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", padding: "20px" }}>
      <div className="signin-card" style={{ background: "#fff", padding: "50px 40px", borderRadius: "24px", width: "100%", maxWidth: "680px", textAlign: "center", boxShadow: "0 20px 40px rgba(0,0,0,0.3)" }}>
        <div className="brand-mark" style={{ width: "56px", height: "56px", background: "#fbbf24", color: "#1e3a8a", fontSize: "28px", fontWeight: "bold", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "16px", margin: "0 auto 24px" }}>Đ</div>
        <p className="eyebrow" style={{ fontSize: "13px", fontWeight: "bold", color: "#64748b", letterSpacing: "1.5px", margin: "0 0 10px", textTransform: "uppercase" }}>ĐỈNH CAO TRÍ TUỆ</p>
        <h1 style={{ fontSize: "32px", color: "#1e3a8a", margin: "0 0 12px" }}>ỨNG DỤNG HỌC VÀ THI ONLINE</h1>
        <p style={{ color: "#64748b", fontSize: "16px", margin: "0 0 32px" }}>Đăng nhập bằng họ tên, mã lớp và mật khẩu do giáo viên cấp. Phiên đăng nhập được mã hóa.</p>

        {error && <div style={{ background: "#fee2e2", color: "#b91c1c", padding: "14px", borderRadius: "10px", marginBottom: "20px", fontWeight: "bold", border: "1px solid #fca5a5" }}>{error}</div>}

        <div style={{ display: "flex", gap: "16px", marginTop: "20px", marginBottom: "12px", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 250px", display: "flex", flexDirection: "column", gap: "10px", background: "#f8fafc", padding: "20px", borderRadius: "16px", border: "1px solid #e2e8f0" }}>
            <div style={loginTitle}>Quản trị</div>
            <PasswordInput
              value={password} onChange={(e: any) => setPassword(e.target.value)}
              onEnter={handleAdminLogin}
              placeholder="Nhập mật khẩu Quản trị..."
            />
            <button type="button" onClick={handleAdminLogin} disabled={busy} style={{ width: "100%", padding: "14px", marginTop: "auto", background: "#eff6ff", color: "#1e3a8a", border: "2px solid #1e3a8a", borderRadius: "10px", fontWeight: "bold", fontSize: "16px", cursor: busy ? "not-allowed" : "pointer" }}>🛡️ Quản Trị</button>
          </div>

          <div style={{ flex: "1 1 250px", display: "flex", flexDirection: "column", gap: "10px", background: "#f0fdf4", padding: "20px", borderRadius: "16px", border: "1px solid #bbf7d0" }}>
            <div style={{ ...loginTitle, color: "#166534" }}>Giáo viên</div>
            <input
              type="text" value={gvName} onChange={(e) => setGvName(e.target.value)}
              placeholder="Họ và tên Giáo viên"
              style={loginInput}
            />
            <PasswordInput
              value={gvPassword} onChange={(e: any) => setGvPassword(e.target.value)}
              onEnter={handleGvLogin}
              placeholder="Nhập mật khẩu Giáo viên..."
            />
            <button type="button" onClick={handleGvLogin} disabled={busy} style={{ width: "100%", padding: "14px", marginTop: "auto", background: "#dcfce7", color: "#166534", border: "2px solid #166534", borderRadius: "10px", fontWeight: "bold", fontSize: "16px", cursor: busy ? "not-allowed" : "pointer" }}>👨‍🏫 Giáo viên</button>
          </div>
        </div>

        <button type="button" onClick={handleForgotPassword} disabled={busy} style={{ width: "100%", padding: "12px", marginBottom: "8px", background: "#fff", color: "#b91c1c", border: "2px solid #b91c1c", borderRadius: "10px", fontWeight: "bold", fontSize: "15px", cursor: busy ? "not-allowed" : "pointer" }}>🔑 Quên mật khẩu</button>

        <div style={{ display: "flex", alignItems: "center", margin: "24px 0" }}>
          <hr style={{ flex: 1, border: "none", borderTop: "1px solid #cbd5e1" }} />
          <span style={{ padding: "0 16px", color: "#64748b", fontSize: "15px", fontWeight: "bold", textTransform: "uppercase" }}>ĐĂNG NHẬP DÀNH CHO HỌC SINH</span>
          <hr style={{ flex: 1, border: "none", borderTop: "1px solid #cbd5e1" }} />
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px", margin: "10px 0 20px" }}>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="1. Họ và tên (viết hoa chữ cái đầu)" required style={{ padding: "16px", borderRadius: "10px", border: "1px solid #cbd5e1", color: "#0f172a", fontSize: "16px", outline: "none", background: "#f8fafc" }} />
          <input type="text" value={classCode} onChange={(e) => setClassCode(e.target.value.toUpperCase())} placeholder="2. Mã lớp (do giáo viên cung cấp)" required style={{ padding: "16px", borderRadius: "10px", border: "1px solid #cbd5e1", color: "#0f172a", fontSize: "16px", outline: "none", background: "#f8fafc" }} />
          <PasswordInput
            value={studentPassword} onChange={(e: any) => setStudentPassword(e.target.value)}
            placeholder="3. Mật khẩu (do giáo viên cấp)"
            inputStyle={{ padding: "16px", borderRadius: "10px", border: "1px solid #cbd5e1", color: "#0f172a", fontSize: "16px", outline: "none", background: "#f8fafc", textAlign: "left" }}
          />
          <button type="submit" disabled={busy} className="primary-btn" style={{ background: "#1e3a8a", color: "#fff", cursor: busy ? "not-allowed" : "pointer", border: "none", width: "100%", fontSize: "18px", padding: "16px", borderRadius: "10px", fontWeight: "bold", marginTop: "8px" }}>
            {busy ? "Đang kiểm tra dữ liệu..." : "Vào lớp học ngay"}
          </button>
        </form>

        <div className="trust-row" style={{ display: "flex", justifyContent: "center", gap: "20px", marginTop: "30px", fontSize: "14px", color: "#64748b", fontWeight: "bold" }}>
          <span>🔒 SSL/TLS</span>
          <span>✓ HttpOnly</span>
          <span>✓ Dữ liệu chuẩn hóa</span>
        </div>
      </div>
    </main>
  );
}