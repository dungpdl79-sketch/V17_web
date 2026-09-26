-- Bổ sung cột đo thời gian học sinh ở trong mỗi bài học liệu.
-- Chạy MỘT LẦN, sau khi đã tạo bảng luot_hoc_lieu:
--   npx wrangler d1 execute dinhcaotritue-db --remote --file=them-cot-thoi-gian.sql
--
-- Lưu ý: SQLite không có "ADD COLUMN IF NOT EXISTS". Chạy lần thứ hai sẽ báo
-- "duplicate column name: tong_giay" — đó là báo lành, nghĩa là cột đã có sẵn,
-- không hỏng gì cả.

ALTER TABLE luot_hoc_lieu ADD COLUMN tong_giay INTEGER NOT NULL DEFAULT 0;
