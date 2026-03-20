import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin', 'vietnamese'] });

export const metadata: Metadata = {
  title: 'Quản lý Truyền thông - CĐ Bách khoa Tây Nguyên',
  description: 'Hệ thống quản lý kế hoạch truyền thông',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className={`${inter.className} bg-gray-50 text-gray-900 min-h-screen antialiased`}>
        {children}
      </body>
    </html>
  );
}
