import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Quản lý Truyền thông - CĐ Bách khoa Tây Nguyên',
  description: 'Hệ thống quản lý kế hoạch truyền thông',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="bg-gray-100 text-gray-900 min-h-screen font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
