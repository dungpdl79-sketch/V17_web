-- Bảng lưu danh sách "Nhúng Link Bổ Sung" trên máy chủ, thay cho localStorage.
-- Chạy MỘT LẦN trước khi deploy:
--   npx wrangler d1 execute dinhcaotritue-db --remote --file=tao-bang-lien-ket.sql

CREATE TABLE IF NOT EXISTS lien_ket (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_email TEXT NOT NULL,
  name          TEXT NOT NULL,
  url           TEXT NOT NULL,
  created_at    TEXT
);

-- Ngăn một đường dẫn vào bảng hai lần, kể cả khi đưa danh sách cũ lên từ
-- nhiều máy khác nhau.
CREATE UNIQUE INDEX IF NOT EXISTS uq_lien_ket
  ON lien_ket (teacher_email, url);
