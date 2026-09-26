/* =====================================================================
   session.ts — KÝ VÀ KIỂM CHỮ KÝ COOKIE PHIÊN

   VÌ SAO CẦN TỆP NÀY

   Trước đây cookie "user_session" chỉ là một chuỗi JSON trần:
       {"email":"thuyetdung@gmail.com","name":"Hồ Thuyết Dũng","role":"teacher"}
   Máy chủ đọc rồi tin luôn, không kiểm tra gì. Bất kỳ ai mở F12 → Application →
   Cookies cũng tự gõ được chuỗi đó và lập tức trở thành giáo viên: xem đáp án,
   sửa điểm, xoá lớp. Học sinh chỉ cần biết địa chỉ email của thầy cô là đủ.

   Nay mỗi cookie mang thêm một CHỮ KÝ tính từ khoá bí mật chỉ máy chủ biết.
   Sửa một ký tự trong phần dữ liệu là chữ ký không còn khớp, máy chủ từ chối.
   Người dùng không thể tự tạo chữ ký hợp lệ vì không có khoá.

   ĐỊNH DẠNG COOKIE:  <dữ_liệu>.<chữ_ký>
   cả hai phần đều mã hoá base64url (an toàn khi nằm trong cookie).

   Dùng Web Crypto (crypto.subtle) chứ không dùng module "crypto" của Node,
   vì mã này chạy trên Cloudflare Workers — nơi không có module Node.
   ===================================================================== */

export type PhienLamViec = {
  email: string;
  name: string;
  role?: string | null;
};

type PhienCoHan = PhienLamViec & { exp: number };

import { getSigningSecret } from "../auth";

const HAN_DUNG_GIAY = 7 * 24 * 60 * 60; // 7 ngày, khớp với maxAge của cookie

// ---------------------------------------------------------------------
// Khoá bí mật
// Đặt bằng:  npx wrangler secret put SESSION_SECRET
// (hoặc thêm vào mục "vars" trong wrangler.json nếu cách trên không nhận)
// KHÔNG có khoá thì tệp này báo lỗi rõ ràng chứ không âm thầm chạy tiếp —
// vì chạy tiếp nghĩa là quay lại đúng lỗ hổng cũ mà không ai hay biết.
// ---------------------------------------------------------------------
// V17: khoá lấy từ biến bí mật SESSION_SECRET nếu có; chưa cài thì tự sinh một lần
// và cất trong D1 (xem getSigningSecret trong app/auth.ts) — thầy cô không phải cài gì.
const boMaHoa = new TextEncoder();
let khoaDaNap: CryptoKey | null = null;

async function layKhoa(): Promise<CryptoKey> {
  if (khoaDaNap) return khoaDaNap;
  const biMat = await getSigningSecret();
  if (!biMat || biMat.length < 16) throw new Error("Khoá ký phiên không hợp lệ.");
  khoaDaNap = await crypto.subtle.importKey(
    "raw",
    boMaHoa.encode(biMat),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
  return khoaDaNap;
}

// ---------------------------------------------------------------------
// base64url — bản base64 thay "+/" thành "-_" và bỏ dấu "=" ở cuối,
// vì ba ký tự đó gây rắc rối khi nằm trong cookie.
// ---------------------------------------------------------------------
function maHoaB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function giaiMaB64(s: string): Uint8Array {
  const t = s.replace(/-/g, "+").replace(/_/g, "/");
  const bu = t.length % 4 ? "=".repeat(4 - (t.length % 4)) : "";
  const bin = atob(t + bu);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* ---------------------------------------------------------------------
   KÝ — gọi khi đăng nhập thành công.
   Trả về chuỗi để đặt thẳng vào cookie "user_session".
   --------------------------------------------------------------------- */
export async function kyPhien(phien: PhienLamViec): Promise<string> {
  const duLieu: PhienCoHan = {
    email: String(phien.email || ""),
    name: String(phien.name || ""),
    role: phien.role ?? null,
    exp: Math.floor(Date.now() / 1000) + HAN_DUNG_GIAY,
  };
  const phanDuLieu = maHoaB64(boMaHoa.encode(JSON.stringify(duLieu)));
  const chuKy = await crypto.subtle.sign("HMAC", await layKhoa(), boMaHoa.encode(phanDuLieu));
  return `${phanDuLieu}.${maHoaB64(new Uint8Array(chuKy))}`;
}

/* ---------------------------------------------------------------------
   KIỂM — gọi mỗi khi đọc cookie.
   Trả về null nếu: sai định dạng, chữ ký không khớp, hoặc đã quá hạn.
   Cookie kiểu cũ (JSON trần, không có dấu chấm) cũng trả về null — nghĩa là
   sau khi cập nhật, mọi người phải đăng nhập lại MỘT lần. Đây là chủ ý:
   chấp nhận cookie cũ thì lỗ hổng vẫn còn nguyên.
   --------------------------------------------------------------------- */
export async function docPhien(giaTriCookie: string | undefined | null): Promise<PhienLamViec | null> {
  try {
    if (!giaTriCookie) return null;
    const cho = giaTriCookie.lastIndexOf(".");
    if (cho <= 0) return null;

    const phanDuLieu = giaTriCookie.slice(0, cho);
    const phanChuKy = giaTriCookie.slice(cho + 1);

    // crypto.subtle.verify so sánh theo thời gian hằng định, nên không bị
    // dò từng ký tự chữ ký như khi so sánh chuỗi bằng dấu ===.
    const hopLe = await crypto.subtle.verify(
      "HMAC",
      await layKhoa(),
      giaiMaB64(phanChuKy) as unknown as ArrayBuffer,
      boMaHoa.encode(phanDuLieu)
    );
    if (!hopLe) return null;

    const duLieu = JSON.parse(new TextDecoder().decode(giaiMaB64(phanDuLieu))) as PhienCoHan;
    if (!duLieu?.email || !duLieu?.name) return null;
    if (!duLieu.exp || duLieu.exp < Math.floor(Date.now() / 1000)) return null;

    return { email: String(duLieu.email), name: String(duLieu.name), role: duLieu.role ?? null };
  } catch {
    // Khoá chưa đặt, cookie hỏng, base64 sai… đều coi như chưa đăng nhập.
    return null;
  }
}

/* Tuỳ chọn cookie dùng chung cho mọi chỗ đặt "user_session",
   để không nơi nào lỡ quên cờ httpOnly. */
export const TUY_CHON_COOKIE = {
  path: "/",
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: HAN_DUNG_GIAY,
};
