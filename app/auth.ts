// =====================================================================
// BẢO MẬT ĐĂNG NHẬP V17 (chạy trên máy chủ Cloudflare, học sinh không đọc được)
//
// 1. Phiên đăng nhập (cookie user_session) được KÝ bằng khóa bí mật HMAC-SHA256.
//    Học sinh sửa cookie (đổi email, đổi vai trò) thì chữ ký sai -> bị coi là chưa đăng nhập.
//    Khóa bí mật tự sinh ngẫu nhiên lần đầu và cất trong D1 (bảng app_settings),
//    hoặc lấy từ biến bí mật SESSION_SECRET nếu có cài trong Cloudflare.
//
// 2. Mật khẩu giáo viên KHÔNG còn lưu trong cookie trình duyệt.
//    - Mật khẩu gốc: biến bí mật TEACHER_PASSWORD cài trong Cloudflare
//      (Workers & Pages -> v17-dinhcaotritue -> Settings -> Variables and Secrets).
//    - Đổi mật khẩu trong phần mềm: lưu dạng băm PBKDF2 vào D1.
//    - Quên mật khẩu: đổi TEACHER_PASSWORD trong Cloudflare -> mật khẩu đã đổi
//      trong phần mềm tự hết hiệu lực, dùng lại mật khẩu mới vừa cài.
// =====================================================================
import { env } from "cloudflare:workers";

type D1Like = {
  prepare(sql: string): {
    bind(...values: unknown[]): { first<T = Record<string, unknown>>(): Promise<T | null>; run(): Promise<unknown> };
    run(): Promise<unknown>;
  };
};

export type SessionUser = { email: string; name: string; role: "teacher" | "student" };

export const TEACHER_ACCOUNT = { email: "thuyetdung@gmail.com", name: "Hồ Thuyết Dũng" };
export const SESSION_COOKIE = "user_session";
export const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 ngày
const STUDENT_EMAIL_RE = /^[a-z]{2,60}\.(1[0-2]|[6-9])[a-z]{1,5}\d{0,3}@student\.v17$/;
const TEACHER_EMAIL_RE = /^[a-z]{4,60}@teacher\.v17$/;
const PBKDF2_ITERATIONS = 100_000; // mức tối đa Cloudflare Workers cho phép

const enc = new TextEncoder();
const anyEnv = env as unknown as Record<string, unknown>;

function getDB(): D1Like {
  const db = anyEnv.DB as D1Like | undefined;
  if (!db) throw new Error("Thiếu cơ sở dữ liệu D1 (binding DB).");
  return db;
}

let tableReady: Promise<unknown> | null = null;
function ensureTable() {
  if (!tableReady) {
    tableReady = getDB()
      .prepare("CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)")
      .run()
      .catch((e) => {
        tableReady = null;
        throw e;
      });
  }
  return tableReady;
}

async function getSetting(key: string): Promise<string | null> {
  await ensureTable();
  const row = await getDB().prepare("SELECT value FROM app_settings WHERE key = ?").bind(key).first<{ value: string }>();
  return row?.value ?? null;
}

async function setSetting(key: string, value: string) {
  await ensureTable();
  await getDB()
    .prepare("INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(key, value)
    .run();
}

async function deleteSetting(key: string) {
  await ensureTable();
  await getDB().prepare("DELETE FROM app_settings WHERE key = ?").bind(key).run();
}

// ---------------- tiện ích mã hóa ----------------
function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s: string): Uint8Array {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function randomB64(n: number) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return b64url(a);
}
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function sha256(text: string) {
  return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(text))));
}

// ---------------- khóa ký phiên ----------------
let cachedKey: Promise<CryptoKey> | null = null;
async function loadSigningKey(): Promise<CryptoKey> {
  let secret = typeof anyEnv.SESSION_SECRET === "string" && anyEnv.SESSION_SECRET.length >= 16 ? anyEnv.SESSION_SECRET : null;
  if (!secret) {
    secret = await getSetting("session_secret");
    if (!secret) {
      const fresh = randomB64(48);
      await ensureTable();
      // INSERT OR IGNORE: nếu hai yêu cầu cùng lúc thì chỉ một khóa được giữ lại
      await getDB().prepare("INSERT OR IGNORE INTO app_settings (key, value) VALUES ('session_secret', ?)").bind(fresh).run();
      secret = (await getSetting("session_secret")) || fresh;
    }
  }
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}
function signingKey() {
  if (!cachedKey) {
    cachedKey = loadSigningKey().catch((e) => {
      cachedKey = null;
      throw e;
    });
  }
  return cachedKey;
}
async function hmac(data: string) {
  const sig = await crypto.subtle.sign("HMAC", await signingKey(), enc.encode(data));
  return b64url(new Uint8Array(sig));
}

// ---------------- phiên đăng nhập ----------------
export async function createSessionToken(user: SessionUser): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify({ ...user, exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE })));
  return `v2.${payload}.${await hmac(payload)}`;
}

export async function verifySessionToken(token: string | undefined | null): Promise<SessionUser | null> {
  try {
    if (!token) return null;
    const parts = decodeURIComponent(token).split(".");
    if (parts.length !== 3 || parts[0] !== "v2") return null;
    const [, payload, sig] = parts;
    if (!safeEqual(sig, await hmac(payload))) return null;
    const data = JSON.parse(new TextDecoder().decode(fromB64url(payload)));
    if (!data || typeof data.exp !== "number" || data.exp < Date.now() / 1000) return null;
    if (typeof data.email !== "string" || typeof data.name !== "string") return null;
    if (data.role !== "teacher" && data.role !== "student") return null;
    return { email: data.email, name: data.name, role: data.role };
  } catch {
    return null;
  }
}

export async function sessionFromRequest(req: Request): Promise<SessionUser | null> {
  const cookieHeader = req.headers.get("cookie") || "";
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return verifySessionToken(match?.[1]);
}

export function isValidStudentEmail(email: string) {
  return STUDENT_EMAIL_RE.test(email);
}

// Giáo viên thường: email nội bộ tạo từ họ tên, ví dụ "nguyenvanan@teacher.v17".
export function isValidTeacherEmail(email: string) {
  return TEACHER_EMAIL_RE.test(email);
}

export function isAdminEmail(email: string | null | undefined) {
  return String(email || "").toLowerCase() === TEACHER_ACCOUNT.email;
}

// Họ tên -> email nội bộ (bỏ dấu, bỏ khoảng trắng). Chạy trên máy chủ nên trình duyệt không tự khai được.
export function teacherEmailFromName(name: string) {
  const clean = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").replace(/[^a-zA-Z]/g, "").toLowerCase();
  return `${clean}@teacher.v17`;
}

// Kiểm tra họ tên: từ 2 chữ trở lên, không có số, viết hoa chữ cái đầu mỗi từ.
export function normalizePersonName(raw: string): string | null {
  const name = String(raw || "").replace(/[<>]/g, "").trim().replace(/\s+/g, " ").slice(0, 100);
  const words = name.split(" ");
  if (words.length < 2 || /\d/.test(name)) return null;
  const ok = words.every((w) => w.length > 0 && w[0] === w[0].toLocaleUpperCase("vi-VN") && w[0] !== w[0].toLocaleLowerCase("vi-VN"));
  return ok ? name : null;
}

// ---------------- mật khẩu giáo viên ----------------
async function pbkdf2(password: string, salt: Uint8Array, iterations: number) {
  const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, base, 256);
  return b64url(new Uint8Array(bits));
}

function envPassword(): string | null {
  const p = anyEnv.TEACHER_PASSWORD;
  return typeof p === "string" && p.trim().length > 0 ? p.trim() : null;
}

export function teacherPasswordConfigured() {
  return envPassword() !== null;
}

// Mật khẩu đổi trong phần mềm chỉ có hiệu lực khi TEACHER_PASSWORD trong Cloudflare chưa bị đổi.
async function storedOverride(): Promise<{ salt: string; hash: string; iter: number } | null> {
  const envPwd = envPassword();
  if (!envPwd) return null;
  const raw = await getSetting("teacher_pwd");
  if (!raw) return null;
  try {
    const o = JSON.parse(raw);
    if (o.envFp !== (await sha256("v17-env:" + envPwd))) return null;
    return { salt: o.salt, hash: o.hash, iter: o.iter };
  } catch {
    return null;
  }
}

// Chống dò mật khẩu: đếm số lần sai trong bộ nhớ máy chủ (theo IP).
const failures = new Map<string, { n: number; until: number }>();

function lockedMessage(ip: string): string | null {
  const f = failures.get(ip);
  const now = Date.now();
  if (f && f.until > now) return `❌ Nhập sai quá nhiều lần. Thử lại sau ${Math.ceil((f.until - now) / 1000)} giây.`;
  return null;
}

async function recordResult(ip: string, ok: boolean) {
  if (ok) {
    failures.delete(ip);
    return;
  }
  const now = Date.now();
  const n = (failures.get(ip)?.n || 0) + 1;
  // Sai 5 lần -> khóa 1 phút, sai tiếp thì thời gian khóa tăng dần (tối đa 30 phút).
  const until = n >= 5 ? now + Math.min(30 * 60_000, 60_000 * 2 ** (n - 5)) : 0;
  failures.set(ip, { n, until });
  if (failures.size > 5000) failures.clear();
  await new Promise((r) => setTimeout(r, 600));
}

// Mật khẩu QUẢN TRỊ (tài khoản thuyetdung@gmail.com)
export async function checkTeacherPassword(password: string, ip: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const envPwd = envPassword();
  if (!envPwd) {
    return {
      ok: false,
      error:
        "❌ Chưa cài mật khẩu Quản trị. Vào Cloudflare → v17-dinhcaotritue → Settings → Variables and Secrets, thêm biến bí mật TEACHER_PASSWORD.",
    };
  }
  const locked = lockedMessage(ip);
  if (locked) return { ok: false, error: locked };

  let ok = false;
  const override = await storedOverride();
  if (override) {
    ok = safeEqual(await pbkdf2(password, fromB64url(override.salt), override.iter), override.hash);
  } else {
    ok = safeEqual(await sha256("v17-pwd:" + password), await sha256("v17-pwd:" + envPwd));
  }
  await recordResult(ip, ok);
  return ok ? { ok: true } : { ok: false, error: "❌ Sai mật khẩu Quản trị!" };
}

// ---------------- mật khẩu GIÁO VIÊN ----------------
// - Mật khẩu BAN ĐẦU: Quản trị đặt một lần, dùng chung để thầy cô đăng nhập LẦN ĐẦU.
// - Mật khẩu RIÊNG: lần đầu đăng nhập, thầy cô bắt buộc tự đặt. Từ đó chỉ mật khẩu riêng mới dùng được,
//   mật khẩu ban đầu không còn tác dụng với người đó. Quản trị cũng không biết mật khẩu riêng
//   (chỉ lưu dạng băm PBKDF2), nhưng có thể "cấp lại" để thầy cô đặt lại từ đầu.
async function hashRecord(pwd: string) {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return JSON.stringify({ salt: b64url(salt), hash: await pbkdf2(pwd, salt, PBKDF2_ITERATIONS), iter: PBKDF2_ITERATIONS });
}

async function matchRecord(raw: string | null, pwd: string) {
  if (!raw) return false;
  try {
    const o = JSON.parse(raw);
    return safeEqual(await pbkdf2(pwd, fromB64url(o.salt), o.iter), o.hash);
  } catch {
    return false;
  }
}

const personalKey = (email: string) => "gvpwd:" + email.toLowerCase();

export async function teacherHasPersonalPassword(email: string) {
  return (await getSetting(personalKey(email))) !== null;
}

type LoginResult = { ok: true } | { ok: false; needChange: true } | { ok: false; error: string; needChange?: false };

// Đăng nhập Giáo viên: trả về needChange nếu đây là lần đầu (đang dùng mật khẩu ban đầu).
export async function checkTeacherLogin(email: string, password: string, ip: string): Promise<LoginResult> {
  const locked = lockedMessage(ip);
  if (locked) return { ok: false, error: locked };

  const personal = await getSetting(personalKey(email));
  if (personal) {
    const ok = await matchRecord(personal, password);
    await recordResult(ip, ok);
    return ok ? { ok: true } : { ok: false, error: "❌ Sai mật khẩu Giáo viên!" };
  }

  const initial = await getSetting("gv_shared_pwd");
  if (!initial) return { ok: false, error: "❌ Quản trị chưa đặt mật khẩu ban đầu cho Giáo viên. Hãy liên hệ Quản trị." };
  const ok = await matchRecord(initial, password);
  await recordResult(ip, ok);
  return ok ? { ok: false, needChange: true } : { ok: false, error: "❌ Sai mật khẩu Giáo viên!" };
}

// Lần đầu: kiểm tra lại mật khẩu ban đầu rồi lưu mật khẩu riêng.
export async function completeTeacherFirstLogin(
  email: string,
  initialPassword: string,
  newPassword: string,
  ip: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (await teacherHasPersonalPassword(email)) return { ok: false, error: "❌ Tài khoản này đã có mật khẩu riêng. Hãy đăng nhập bằng mật khẩu riêng." };
  const kq = await checkTeacherLogin(email, initialPassword, ip);
  if (!("needChange" in kq) || !kq.needChange) return { ok: false, error: "error" in kq ? kq.error : "❌ Không hợp lệ." };
  const err = await validateNewTeacherPassword(newPassword);
  if (err) return { ok: false, error: err };
  await setSetting(personalKey(email), await hashRecord(newPassword));
  return { ok: true };
}

async function validateNewTeacherPassword(newPassword: string): Promise<string | null> {
  if (newPassword.length < 8) return "❌ Mật khẩu mới cần ít nhất 8 ký tự.";
  if (await matchRecord(await getSetting("gv_shared_pwd"), newPassword)) return "❌ Mật khẩu mới phải KHÁC mật khẩu ban đầu do Quản trị cấp.";
  return null;
}

// Giáo viên tự đổi mật khẩu riêng (đã đăng nhập)
export async function setTeacherPersonalPassword(email: string, newPassword: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const err = await validateNewTeacherPassword(newPassword);
  if (err) return { ok: false, error: err };
  await setSetting(personalKey(email), await hashRecord(newPassword));
  return { ok: true };
}

// Quản trị cấp lại: xóa mật khẩu riêng -> thầy cô đăng nhập lại bằng mật khẩu ban đầu và đặt mật khẩu mới.
export async function resetTeacherPersonalPassword(email: string): Promise<boolean> {
  const had = await teacherHasPersonalPassword(email);
  await deleteSetting(personalKey(email));
  return had;
}

export async function setSharedTeacherPassword(newPass: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (newPass.length < 8) return { ok: false, error: "Mật khẩu cần ít nhất 8 ký tự." };
  await setSetting("gv_shared_pwd", await hashRecord(newPass));
  return { ok: true };
}

export async function setTeacherPassword(newPass: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const envPwd = envPassword();
  if (!envPwd) return { ok: false, error: "Chưa cài TEACHER_PASSWORD trong Cloudflare." };
  if (newPass.length < 8) return { ok: false, error: "Mật khẩu cần ít nhất 8 ký tự." };
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const hash = await pbkdf2(newPass, salt, PBKDF2_ITERATIONS);
  await setSetting(
    "teacher_pwd",
    JSON.stringify({ salt: b64url(salt), hash, iter: PBKDF2_ITERATIONS, envFp: await sha256("v17-env:" + envPwd) })
  );
  return { ok: true };
}

export async function resetTeacherPasswordToEnv() {
  await deleteSetting("teacher_pwd");
}
