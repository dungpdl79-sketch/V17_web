/* =====================================================================
   BẢNG LIÊN KẾT BỔ SUNG (mục "Nhúng Link Bổ Sung")

   VÌ SAO chuyển lên đây: trước kia danh sách này nằm trong localStorage của
   trình duyệt, nên mỗi máy một danh sách riêng. Thầy cô thêm link ở máy bàn
   thì máy tính xách tay không thấy, và xoá dữ liệu duyệt web là mất sạch.

   Chỉ số duy nhất trên (teacher_email, url) khiến một đường dẫn không thể
   vào bảng hai lần. Nhờ nó mà việc đưa danh sách cũ từ nhiều máy lên máy chủ
   có bấm nhầm mấy lần cũng không sinh ra bản trùng.
   ===================================================================== */
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const lienKet = sqliteTable(
  "lien_ket",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    teacherEmail: text("teacher_email").notNull(),
    name: text("name").notNull(),
    url: text("url").notNull(),
    createdAt: text("created_at"),
  },
  (t) => ({
    uq: uniqueIndex("uq_lien_ket").on(t.teacherEmail, t.url),
  })
);
