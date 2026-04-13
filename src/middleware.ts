import { updateSession } from '@/lib/supabase/middleware';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/zalo-webhook|api/notifications/zalo|api/upload-drive|api/rename-drive-folder|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
