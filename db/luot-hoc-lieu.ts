/* =====================================================================
   BẢNG GHI LƯỢT HỌC SINH VÀO HỌC LIỆU

   VÌ SAO tách thành tệp riêng thay vì thêm vào db/schema.ts: để thầy cô chỉ
   phải chép thêm một tệp mới, không phải sửa tệp cũ đang chạy tốt. Drizzle
   không bắt mọi bảng nằm chung một tệp.

   VÌ SAO không ghi mỗi lần mở thành một dòng riêng: một lớp 40 em, 19 bài,
   mỗi em mở lại nhiều lần thì bảng phình rất nhanh. Ở đây mỗi cặp
   (học sinh, bài) chỉ giữ ĐÚNG MỘT dòng, mở thêm lần nữa thì cộng vào
   so_luot. Tối đa 40 × 19 = 760 dòng cho một lớp, đọc rất nhanh.

   Chỉ số duy nhất trên (student_email, tag) là thứ khiến phép "thêm hoặc
   cộng dồn" (onConflictDoUpdate) hoạt động được — thiếu nó là mỗi lần mở
   lại sinh một dòng mới.
   ===================================================================== */
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const luotHocLieu = sqliteTable(
  "luot_hoc_lieu",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    studentEmail: text("student_email").notNull(),
    tag: text("tag").notNull(),           // mã bài, ví dụ chuong1_bai1
    soLuot: integer("so_luot").notNull().default(0),
    lanDau: text("lan_dau"),              // ISO time, lần mở đầu tiên
    lanCuoi: text("lan_cuoi"),            // ISO time, lần mở gần nhất
    // Tổng số giây em thực sự ở trong bài này, cộng dồn qua mọi lần mở.
    // Chỉ tính lúc tab đang hiện: chuyển tab hay khoá máy là dừng đếm,
    // nếu không thì em nào để máy qua đêm sẽ thành "học 9 tiếng".
    tongGiay: integer("tong_giay").notNull().default(0),
  },
  (t) => ({
    uq: uniqueIndex("uq_luot_hoc_lieu").on(t.studentEmail, t.tag),
  })
);
