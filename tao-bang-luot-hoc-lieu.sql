-- Bảng ghi lượt học sinh vào mục "Học Liệu Bài Học".
-- Chạy MỘT LẦN trước khi deploy bản mới:
--   npx wrangler d1 execute dinhcaotritue-db --remote --file=tao-bang-luot-hoc-lieu.sql
--
-- IF NOT EXISTS: chạy nhầm lần thứ hai cũng không hỏng gì, không mất dữ liệu.

CREATE TABLE IF NOT EXISTS luot_hoc_lieu (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  student_email TEXT    NOT NULL,
  tag           TEXT    NOT NULL,
  so_luot       INTEGER NOT NULL DEFAULT 0,
  lan_dau       TEXT,
  lan_cuoi      TEXT
);

-- Chỉ số duy nhất này là thứ khiến phép "thêm mới hoặc cộng dồn" chạy được.
-- Thiếu nó thì mỗi lần học sinh mở bài lại sinh một dòng mới, thống kê sai hết.
CREATE UNIQUE INDEX IF NOT EXISTS uq_luot_hoc_lieu
  ON luot_hoc_lieu (student_email, tag);
