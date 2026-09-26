import type { Metadata } from "next";
import GameHub from "./GameHub";

export const metadata: Metadata = {
  title: "Kho trò chơi Toán học | Đỉnh Cao Trí Tuệ",
  description: "Học Toán qua các trò chơi tương tác, phản hồi tức thời và thử thách theo cấp độ.",
};

export default function MathGamesPage() {
  return <GameHub />;
}
