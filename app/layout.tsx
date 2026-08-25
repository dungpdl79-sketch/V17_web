import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Đỉnh Cao Trí Tuệ V17",
  description: "Hệ thống quản lý lớp học, ngân hàng câu hỏi và kiểm tra Toán 12 nhiều thiết bị.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
