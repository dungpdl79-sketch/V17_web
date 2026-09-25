import { cookies, headers } from "next/headers";
import Dashboard, { LoginForm } from "./v17-dashboard";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  TEACHER_ACCOUNT,
  checkTeacherLogin,
  checkTeacherPassword,
  completeTeacherFirstLogin,
  createSessionToken,
  isAdminEmail,
  isValidStudentEmail,
  normalizePersonName,
  resetTeacherPasswordToEnv,
  resetTeacherPersonalPassword,
  setSharedTeacherPassword,
  setTeacherPassword,
  setTeacherPersonalPassword,
  teacherEmailFromName,
  verifySessionToken,
} from "./auth";

export const dynamic = "force-dynamic";

async function setSessionCookie(user: { email: string; name: string; role: "teacher" | "student" }) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, await createSessionToken(user), {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
  });
}

async function currentUser() {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
}

async function handleLogin(formData: FormData) {
  "use server";
  const roleType = String(formData.get("roleType") || "");

  const ip = (await headers()).get("cf-connecting-ip") || "unknown";

  // QUẢN TRỊ: email và tên do MÁY CHỦ quyết định, trình duyệt không tự khai được.
  if (roleType === "admin") {
    const password = String(formData.get("password") || "").trim();
    const kq = await checkTeacherPassword(password, ip);
    if (!kq.ok) return { error: kq.error };
    await setSessionCookie({ email: TEACHER_ACCOUNT.email, name: TEACHER_ACCOUNT.name, role: "teacher" });
    return { success: true };
  }

  // GIÁO VIÊN: họ tên + mật khẩu riêng. Lần đầu dùng mật khẩu ban đầu do Quản trị cấp,
  // khi đó máy chủ KHÔNG cho vào ngay mà yêu cầu đặt mật khẩu riêng trước (needChange).
  if (roleType === "teacher") {
    const name = normalizePersonName(String(formData.get("name") || ""));
    if (!name) return { error: "❌ Họ và tên Giáo viên phải từ 2 chữ, viết hoa chữ cái đầu, không có số (ví dụ: Nguyễn Văn An)." };
    const email = teacherEmailFromName(name);
    if (isAdminEmail(email)) return { error: "❌ Tên không hợp lệ." };
    const password = String(formData.get("password") || "").trim();
    const kq = await checkTeacherLogin(email, password, ip);
    if ("needChange" in kq && kq.needChange) return { needChange: true };
    if (!kq.ok) return { error: "error" in kq ? kq.error : "❌ Không hợp lệ." };
    await setSessionCookie({ email, name, role: "teacher" });
    return { success: true };
  }

  // HỌC SINH: chỉ chấp nhận email dạng hoten.malop@student.v17 do form tạo ra,
  // nên không thể khai email của giáo viên để vào quyền giáo viên.
  const email = String(formData.get("email") || "").toLowerCase().trim();
  const name = String(formData.get("name") || "").replace(/[<>]/g, "").trim().slice(0, 100);
  if (!name || !isValidStudentEmail(email)) return { error: "❌ Vui lòng nhập đầy đủ và đúng thông tin!" };
  await setSessionCookie({ email, name, role: "student" });
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
  await setSessionCookie({ email, name, role: "teacher" });
  return { success: true };
}

async function handleLogout() {
  "use server";
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  cookieStore.delete("admin_pwd"); // dọn cookie mật khẩu kiểu cũ nếu còn sót
}

async function requireAdmin() {
  const user = await currentUser();
  return !!user && user.role === "teacher" && isAdminEmail(user.email);
}

// Quản trị đổi mật khẩu Quản trị; Giáo viên đổi mật khẩu riêng của mình.
async function changePassword(newPass: string) {
  "use server";
  const user = await currentUser();
  if (!user || user.role !== "teacher") return { error: "Bạn cần đăng nhập Quản trị hoặc Giáo viên." };
  const pwd = String(newPass || "").trim();
  const kq = isAdminEmail(user.email) ? await setTeacherPassword(pwd) : await setTeacherPersonalPassword(user.email, pwd);
  return kq.ok ? { success: true } : { error: kq.error };
}

async function resetPassword() {
  "use server";
  if (!(await requireAdmin())) return { error: "Chỉ Quản trị mới được khôi phục mật khẩu." };
  await resetTeacherPasswordToEnv();
  return { success: true };
}

async function setSharedPassword(newPass: string) {
  "use server";
  if (!(await requireAdmin())) return { error: "Chỉ Quản trị mới được đặt mật khẩu chung cho Giáo viên." };
  const kq = await setSharedTeacherPassword(String(newPass || "").trim());
  return kq.ok ? { success: true } : { error: kq.error };
}

// Quản trị cấp lại mật khẩu cho một Giáo viên (quên mật khẩu riêng).
async function resetTeacherPwd(teacherName: string) {
  "use server";
  if (!(await requireAdmin())) return { error: "Chỉ Quản trị mới được cấp lại mật khẩu." };
  const name = normalizePersonName(String(teacherName || ""));
  if (!name) return { error: "Họ tên không hợp lệ (viết hoa chữ cái đầu, ví dụ: Nguyễn Văn An)." };
  const had = await resetTeacherPersonalPassword(teacherEmailFromName(name));
  return had ? { success: true } : { error: `Chưa có giáo viên "${name}" nào đặt mật khẩu riêng (kiểm tra lại cách viết họ tên).` };
}

export default async function Home() {
  const user = await currentUser();

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
