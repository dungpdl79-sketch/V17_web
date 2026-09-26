-- Thêm cột lưu mật khẩu (đã băm) của học sinh vào bảng users.
-- Giáo viên vẫn đăng nhập bằng mật khẩu chung riêng (không liên quan cột này).
ALTER TABLE users ADD COLUMN password_hash TEXT;
