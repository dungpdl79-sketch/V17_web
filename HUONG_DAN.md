# Đã sửa theo 2 ảnh chú thích — Đăng nhập học sinh có mật khẩu + Quản lý danh sách lớp

## Copy file vào đúng chỗ trong dự án `V17_WEB_SỬ DỤNG`

```
db/schema.ts              ← ghi đè
db/password.ts             ← file MỚI
db/migrations/0002_them_mat_khau_hoc_sinh.sql  ← file MỚI (tham khảo, xem bước 2)
app/page.tsx               ← ghi đè
app/v17-dashboard.tsx      ← ghi đè
app/api/v17/route.ts       ← ghi đè
```

Nếu đường dẫn import (`../../../db`, `../db`...) trong dự án thật của bạn khác với 4 file gốc bạn gửi, sửa lại phần `import` ở đầu 3 file `page.tsx`, `route.ts` cho khớp — code còn lại giữ nguyên.

## 1. Những gì đã đổi (đúng theo 2 ảnh)

**Ảnh 1 — Đăng nhập học sinh có mật khẩu:**
- Form đăng nhập học sinh giờ có 3 ô: Họ và tên, Mã lớp (mã THẬT do giáo viên cấp, hiện ở khung "Quản Lý Lớp Học"), Mật khẩu.
- Học sinh **không còn tự đăng ký** bằng cách gõ bừa tên + mã lớp như trước (đây là lỗ hổng bảo mật khá nghiêm trọng của bản cũ — ai cũng vào được bằng cách đoán tên bạn học). Nay phải đúng cả ba: tên đã có trong lớp, đúng mã lớp, đúng mật khẩu.
- Mật khẩu được băm bằng SHA-256 (có muối riêng từng học sinh) trước khi lưu vào D1, không lưu dạng chữ thường (plain text).

**Ảnh 2 — Quản Lý Lớp Học:**
- ✅ Tải danh sách học sinh lên bằng file Excel (cột đầu tiên là họ tên, có hoặc không có dòng tiêu đề).
- ✅ Xem danh sách học sinh trong từng lớp (bấm "▼ Quản lý danh sách học sinh" để mở rộng).
- ✅ Xóa từng học sinh khỏi lớp.
- ✅ Đổi tên lớp (bấm vào tên lớp).
- ✅ Tự động cấp mật khẩu ngẫu nhiên (6 ký tự, bỏ các ký tự dễ nhầm như 0/O, 1/I) ngay khi thêm học sinh — dù thêm tay hay từ Excel.
- ✅ Cấp lại mật khẩu mới cho từng học sinh (nút "🔑 Đặt lại MK").
- Mật khẩu vừa tạo/cấp lại chỉ hiện **một lần** ngay trên màn hình (vì đã băm nên không xem lại được), có nút tải về dạng bảng để in phát cho học sinh.

## 2. Việc cần làm trước khi deploy

**Bước 1 — Cài thư viện đọc Excel (chạy trong thư mục dự án):**
```
npm install xlsx
```

**Bước 2 — Thêm cột `password_hash` vào D1.** Chọn 1 trong 2 cách:

- Cách nhanh (chạy thẳng, không cần qua drizzle-kit):
  ```
  npx wrangler d1 execute dinhcaotritue-db --remote --command "ALTER TABLE users ADD COLUMN password_hash TEXT;"
  ```
- Hoặc theo đúng quy trình migration bạn đang dùng: copy nội dung file `db/migrations/0002_them_mat_khau_hoc_sinh.sql` vào migration tiếp theo của bạn rồi `npx wrangler d1 migrations apply dinhcaotritue-db --remote`.

**Bước 3 — Deploy như bình thường:**
```
npm run build
npx wrangler deploy -c dist\server\wrangler.json
```

## 3. Lưu ý quan trọng — tài khoản học sinh cũ (6 em lớp 12A09)

Trước đây học sinh tự đăng ký nên định danh tài khoản (email nội bộ) được ghép từ tên + chữ các em tự gõ ở ô "mã lớp". Nay giáo viên thêm học sinh trực tiếp vào lớp (theo `classId` thật), định danh được ghép lại theo cách khác để tránh trùng giữa các lớp. Nghĩa là:

- 6 học sinh hiện tại trong 12A09 cần được **thêm lại một lần** qua màn hình "Quản Lý Lớp Học" (gõ tay hoặc Excel) để có mật khẩu.
- Điểm số cũ của các em (nếu có) gắn với tài khoản cũ sẽ không tự động hiện dưới tài khoản mới, vì email nội bộ đổi khác. Vì lớp mới triển khai và chỉ có 6 em, ảnh hưởng chắc không lớn — nhưng nếu bạn muốn giữ lại lịch sử điểm cũ, báo mình để mình viết thêm một đoạn script nối dữ liệu theo tên học sinh.

## 4. Giới hạn còn lại (chưa đụng tới, để dành nếu bạn cần sau)

- Phiên đăng nhập (cookie `user_session`) vẫn chỉ là JSON thường, không ký số/mã hóa — một học sinh rất rành kỹ thuật vẫn có thể tự sửa cookie để giả làm bạn khác. Việc này đã tồn tại từ trước, không phải lỗi mới phát sinh; nếu muốn bịt luôn, mình có thể ký cookie bằng HMAC ở lần sau.
- Form "Quên mật khẩu" hiện tại chỉ dành cho giáo viên (khôi phục mật khẩu admin dùng chung), không đụng tới học sinh — học sinh quên mật khẩu thì giáo viên bấm "🔑 Đặt lại MK" giúp.
