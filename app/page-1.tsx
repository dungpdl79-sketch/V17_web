import { cookies } from "next/headers";
import Dashboard, { LoginForm } from "./v17-dashboard";

export const dynamic = "force-dynamic";

async function handleLogin(formData: FormData) {
  "use server";
  const email = (formData.get("email") as string || "").toLowerCase();
  const name = formData.get("name") as string;
  const password = (formData.get("password") as string || "").trim();
  const roleType = formData.get("roleType") as string;

  const cookieStore = await cookies();
  const savedPass = cookieStore.get("admin_pwd")?.value || "123456"; 

  // Chỉ kiểm tra Pass đối với Giáo viên
  if (roleType === "teacher") {
     if (password !== savedPass) {
         return { error: "❌ Sai mật khẩu Giáo viên!" };
     }
  }

  if (email && name) {
    cookieStore.set("user_session", JSON.stringify({ email, name, role: roleType }), {
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60
    });
    return { success: true };
  }
  
  return { error: "❌ Vui lòng nhập đầy đủ thông tin!" };
}

async function handleLogout() {
  "use server";
  const cookieStore = await cookies();
  cookieStore.delete("user_session");
}

async function changePassword(newPass: string) {
  "use server";
  const cookieStore = await cookies();
  cookieStore.set("admin_pwd", newPass, {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 365 * 24 * 60 * 60
  });
}

async function resetPassword() {
  "use server";
  const cookieStore = await cookies();
  cookieStore.delete("admin_pwd");
}

// HÀM MỚI 1: TẠO VÀ GỬI MÃ XÁC MINH (Chống học sinh hack)
async function sendResetCode() {
  "use server";
  const code = Math.floor(100000 + Math.random() * 900000).toString(); // Sinh mã 6 số ngẫu nhiên
  const cookieStore = await cookies();
  
  // Lưu mã vào Cookie an toàn trong 5 phút
  cookieStore.set("reset_code", code, {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 300 // 5 phút
  });

  // HIỂN THỊ MÃ RA MÀN HÌNH MÁY CHỦ (Terminal/CMD) ĐỂ CHỈ ADMIN THẤY
  console.log("\n=======================================================");
  console.log("📧 ĐANG MÔ PHỎNG GỬI EMAIL TỚI: thuyetdung@gmail.com");
  console.log("MÃ XÁC MINH ĐỔI MẬT KHẨU CỦA BẠN LÀ:", code);
  console.log("=======================================================\n");

  return { success: true };
}

// HÀM MỚI 2: KIỂM TRA MÃ VÀ TIẾN HÀNH ĐỔI MẬT KHẨU
async function verifyAndResetPassword(code: string, newPass: string) {
  "use server";
  const cookieStore = await cookies();
  const savedCode = cookieStore.get("reset_code")?.value;

  if (!savedCode || savedCode !== code) {
     return { error: "❌ Mã xác minh không chính xác hoặc đã hết hạn (quá 5 phút)!" };
  }

  // Cập nhật pass mới
  cookieStore.set("admin_pwd", newPass, {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 365 * 24 * 60 * 60
  });
  
  cookieStore.delete("reset_code"); // Xóa mã sau khi dùng
  return { success: true };
}

export default async function Home() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("user_session");
  let user = null;

  if (sessionCookie) {
    try {
      user = JSON.parse(sessionCookie.value);
    } catch (e) {}
  }

  if (!user) {
    return <LoginForm 
              onLogin={handleLogin} 
              onSendCode={sendResetCode} 
              onVerifyReset={verifyAndResetPassword} 
           />;
  }

  return <Dashboard 
            initialUser={{ email: user.email, name: user.name, role: user.role }} 
            logoutAction={handleLogout} 
            changePasswordAction={changePassword}
            resetPasswordAction={resetPassword}
          />;
}