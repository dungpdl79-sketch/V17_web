// =====================================================================
// MẬT KHẨU HỌC SINH
// Băm bằng SHA-256 (Web Crypto — có sẵn trong Cloudflare Workers, không cần cài thêm gói).
// Không dùng bcrypt vì bcrypt cần Node crypto gốc, không chạy được trên Workers.
// Định dạng lưu trong cột password_hash: "salt:hexDigest" — mỗi học sinh một salt ngẫu nhiên riêng,
// nên hai học sinh trùng mật khẩu vẫn ra hai chuỗi lưu trữ khác nhau.
// =====================================================================

function taoSaltNgauNhien(doDai = 16): string {
  const bytes = new Uint8Array(doDai);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function bam(salt: string, matKhau: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${matKhau}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashPassword(matKhau: string): Promise<string> {
  const salt = taoSaltNgauNhien();
  const hex = await bam(salt, matKhau);
  return `${salt}:${hex}`;
}

export async function verifyPassword(matKhau: string, luuTru: string | null | undefined): Promise<boolean> {
  if (!luuTru || !matKhau) return false;
  const [salt, hexGoc] = luuTru.split(":");
  if (!salt || !hexGoc) return false;
  const hex = await bam(salt, matKhau);
  return hex === hexGoc;
}

// Mật khẩu ngẫu nhiên dễ đọc/dễ chép tay cho học sinh: bỏ các ký tự dễ nhầm lẫn (0/O, 1/I/L).
const BANG_KY_TU = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export function taoMatKhauHocSinh(doDai = 6): string {
  return Array.from({ length: doDai }, () => BANG_KY_TU[Math.floor(Math.random() * BANG_KY_TU.length)]).join("");
}
