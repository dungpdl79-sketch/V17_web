import { cookies, headers } from "next/headers";
import Dashboard, { LoginForm } from "./v17-dashboard";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  TEACHER_ACCOUNT,
  checkTeacherPassword,
  createSessionToken,
  isValidStudentEmail,
  resetTeacherPasswordToEnv,
  setTeacherPassword,
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

  // GIÁO VIÊN: email và tên do MÁY CHỦ quyết định, trình duyệt không tự khai được.
  if (roleType === "teacher") {
    const password = String(formData.get("password") || "").trim();
    const ip = (await headers()).get("cf-connecting-ip") || "unknown";
    const kq = await checkTeacherPassword(password, ip);
    if (!kq.ok) return { error: kq.error };
    await setSessionCookie({ email: TEACHER_ACCOUNT.email, name: TEACHER_ACCOUNT.name, role: "teacher" });
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

async function handleLogout() {
  "use server";
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  cookieStore.delete("admin_pwd"); // dọn cookie mật khẩu kiểu cũ nếu còn sót
}

async function changePassword(newPass: string) {
  "use server";
  const user = await currentUser();
  if (!user || user.role !== "teacher") return { error: "Chỉ giáo viên đã đăng nhập mới được đổi mật khẩu." };
  const kq = await setTeacherPassword(String(newPass || "").trim());
  return kq.ok ? { success: true } : { error: kq.error };
}

async function resetPassword() {
  "use server";
  const user = await currentUser();
  if (!user || user.role !== "teacher") return { error: "Chỉ giáo viên đã đăng nhập mới được khôi phục mật khẩu." };
  await resetTeacherPasswordToEnv();
  return { success: true };
}

export default async function Home() {
  const user = await currentUser();

  if (!user) {
    return <LoginForm onLogin={handleLogin} />;
  }

  return (
    <Dashboard
      initialUser={{ email: user.email, name: user.name, role: user.role }}
      logoutAction={handleLogout}
      changePasswordAction={changePassword}
      resetPasswordAction={resetPassword}
    />
  );
}
