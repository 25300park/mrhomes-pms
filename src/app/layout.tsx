import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "mrhomes PMS",
  description: "mrhomes Property Management System",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className="bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
