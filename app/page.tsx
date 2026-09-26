import { cookies, headers } from "next/headers";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { classes, memberships, users } from "../db/schema";
import { verifyPassword } from "../db/password";
import Dashboard, { LoginForm } from "./v17-dashboard";
import { kyPhien, docPhien, TUY_CHON_COOKIE } from "./lib/session";
import {
  TEACHER_ACCOUNT,
  checkTeacherLogin,
  checkTeacherPassword,
  completeTeacherFirstLogin,
  isAdminEmail,
  normalizePersonName,
  resetTeacherPasswordToEnv,
  resetTeacherPersonalPassword,
  setSharedTeacherPassword,
  setTeacherPassword,
  setTeacherPersonalPassword,
  teacherEmailFromName,
} from "./auth";

export const dynamic = "force-dynamic";

// So sánh họ tên không phân biệt hoa/thường, bỏ khoảng trắng thừa (vẫn giữ dấu tiếng Việt).
const soSanhTen = (a: string, b: string) =>
  a.trim().replace(/\s+/g, " ").toLocaleLowerCase("vi-VN") === b.trim().replace(/\s+/g, " ").toLocaleLowerCase("vi-VN");

async function datPhien(phien: { email: string; name: string; role: "teacher" | "student" }) {
  const cookieStore = await cookies();
  cookieStore.set("user_session", await kyPhien(phien), TUY_CHON_COOKIE);
}

async function nguoiDungHienTai() {
  const cookieStore = await cookies();
  return docPhien(cookieStore.get("user_session")?.value);
}

async function handleLogin(formData: FormData) {
  "use server";
  const roleType = String(formData.get("roleType") || "");
  const ip = (await headers()).get("cf-connecting-ip") || "unknown";

  try {
    // ---- QUẢN TRỊ: chỉ nhập mật khẩu (biến bí mật TEACHER_PASSWORD trong Cloudflare).
    // Email và tên do MÁY CHỦ gán, trình duyệt không tự khai được.
    if (roleType === "admin") {
      const kq = await checkTeacherPassword(String(formData.get("password") || "").trim(), ip);
      if (!kq.ok) return { error: kq.error };
      await datPhien({ email: TEACHER_ACCOUNT.email, name: TEACHER_ACCOUNT.name, role: "teacher" });
      return { success: true };
    }

    // ---- GIÁO VIÊN: họ tên + mật khẩu riêng. Lần đầu dùng mật khẩu ban đầu do Quản trị cấp,
    // khi đó máy chủ KHÔNG cho vào ngay mà yêu cầu đặt mật khẩu riêng trước (needChange).
    if (roleType === "teacher") {
      const name = normalizePersonName(String(formData.get("name") || ""));
      if (!name) return { error: "❌ Họ và tên Giáo viên phải từ 2 chữ, viết hoa chữ cái đầu, không có số (ví dụ: Nguyễn Văn An)." };
      const email = teacherEmailFromName(name);
      if (isAdminEmail(email)) return { error: "❌ Tên không hợp lệ." };
      const kq = await checkTeacherLogin(email, String(formData.get("password") || "").trim(), ip);
      if ("needChange" in kq && kq.needChange) return { needChange: true };
      if (!kq.ok) return { error: "error" in kq ? kq.error : "❌ Không hợp lệ." };
      await datPhien({ email, name, role: "teacher" });
      return { success: true };
    }
  } catch (e) {
    return { error: "❌ Lỗi máy chủ: " + (e instanceof Error ? e.message : "không rõ") };
  }

  // ---- HỌC SINH: xác thực bằng Mã lớp thật + Họ tên + Mật khẩu do giáo viên cấp ----
  const name = String(formData.get("name") || "").trim();
  const classCode = String(formData.get("classCode") || "").trim().toUpperCase();
  const password = String(formData.get("password") || "").trim();

  if (!name || !classCode || !password) {
    return { error: "❌ Vui lòng nhập đầy đủ họ tên, mã lớp và mật khẩu." };
  }

  const db = getDb();
  const [c] = await db.select().from(classes).where(eq(classes.code, classCode)).limit(1);
  if (!c) return { error: "❌ Mã lớp không tồn tại. Kiểm tra lại với giáo viên." };

  const ms = await db.select().from(memberships).where(eq(memberships.classId, c.id));
  if (!ms.length) return { error: "❌ Lớp này chưa có học sinh nào. Liên hệ giáo viên." };

  const emails = ms.map((m) => m.studentEmail);
  const rows = await db.select().from(users).where(inArray(users.email, emails));
  const target = rows.find((u) => soSanhTen(u.name, name));

  if (!target) {
    return { error: "❌ Không tìm thấy tên này trong lớp. Kiểm tra chính tả họ tên hoặc hỏi giáo viên." };
  }

  const dung = await verifyPassword(password, target.passwordHash as string | null);
  if (!dung) {
    return { error: "❌ Sai mật khẩu. Nếu quên, nhờ giáo viên cấp lại mật khẩu mới." };
  }

  try {
    await datPhien({ email: target.email, name: target.name, role: "student" });
  } catch (e) {
    return { error: "❌ Lỗi máy chủ: " + (e instanceof Error ? e.message : "không rõ") };
  }
  return { success: true };
}

// Giáo viên đăng nhập lần đầu: đặt mật khẩu riêng rồi mới vào.
async function handleTeacherFirstLogin(formData: FormData) {
  "use server";
  const ip = (await headers()).get("cf-connecting-ip") || "unknown";
  const name = normalizePersonName(String(formData.get("name") || ""));
  if (!name) return { error: "❌ Họ và tên không hợp lệ." };
  const email = teacherEmailFromName(name);
  if (isAdminEmail(email)) return { error: "❌ Tên không hợp lệ." };
  const kq = await completeTeacherFirstLogin(
    email,
    String(formData.get("password") || "").trim(),
    String(formData.get("newPassword") || "").trim(),
    ip
  );
  if (!kq.ok) return { error: kq.error };
  await datPhien({ email, name, role: "teacher" });
  return { success: true };
}

async function handleLogout() {
  "use server";
  const cookieStore = await cookies();
  cookieStore.delete("user_session");
  cookieStore.delete("admin_pwd"); // dọn cookie mật khẩu kiểu cũ nếu còn sót
}

async function laQuanTri() {
  const u = await nguoiDungHienTai();
  return !!u && u.role === "teacher" && isAdminEmail(u.email);
}

// Quản trị đổi mật khẩu Quản trị; Giáo viên đổi mật khẩu riêng của mình.
async function changePassword(newPass: string) {
  "use server";
  const u = await nguoiDungHienTai();
  if (!u || u.role !== "teacher") return { error: "Bạn cần đăng nhập Quản trị hoặc Giáo viên." };
  const pwd = String(newPass || "").trim();
  const kq = isAdminEmail(u.email) ? await setTeacherPassword(pwd) : await setTeacherPersonalPassword(u.email, pwd);
  return kq.ok ? { success: true } : { error: kq.error };
}

async function resetPassword() {
  "use server";
  if (!(await laQuanTri())) return { error: "Chỉ Quản trị mới được khôi phục mật khẩu." };
  await resetTeacherPasswordToEnv();
  return { success: true };
}

async function setSharedPassword(newPass: string) {
  "use server";
  if (!(await laQuanTri())) return { error: "Chỉ Quản trị mới được đặt mật khẩu ban đầu cho Giáo viên." };
  const kq = await setSharedTeacherPassword(String(newPass || "").trim());
  return kq.ok ? { success: true } : { error: kq.error };
}

// Quản trị cấp lại mật khẩu cho một Giáo viên (quên mật khẩu riêng).
async function resetTeacherPwd(teacherName: string) {
  "use server";
  if (!(await laQuanTri())) return { error: "Chỉ Quản trị mới được cấp lại mật khẩu." };
  const name = normalizePersonName(String(teacherName || ""));
  if (!name) return { error: "Họ tên không hợp lệ (viết hoa chữ cái đầu, ví dụ: Nguyễn Văn An)." };
  const had = await resetTeacherPersonalPassword(teacherEmailFromName(name));
  return had ? { success: true } : { error: `Chưa có giáo viên "${name}" nào đặt mật khẩu riêng (kiểm tra lại cách viết họ tên).` };
}

export default async function Home() {
  const user = await nguoiDungHienTai();

  if (!user) {
    return <LoginForm onLogin={handleLogin} onTeacherFirstLogin={handleTeacherFirstLogin} />;
  }

  return (
    <Dashboard
      initialUser={{ email: user.email, name: user.name, role: user.role }}
      logoutAction={handleLogout}
      changePasswordAction={changePassword}
      resetPasswordAction={resetPassword}
      setSharedPasswordAction={setSharedPassword}
      resetTeacherPwdAction={resetTeacherPwd}
      isAdmin={user.role === "teacher" && isAdminEmail(user.email)}
    />
  );
}
