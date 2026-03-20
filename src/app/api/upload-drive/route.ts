import { NextRequest, NextResponse } from 'next/server';
import { google, type drive_v3 } from 'googleapis';
import { Readable } from 'stream';
import { createClient } from '@supabase/supabase-js';

const SCOPES = ['https://www.googleapis.com/auth/drive'];

function getDriveClient() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}');
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: SCOPES,
  });
  return google.drive({ version: 'v3', auth });
}

/**
 * Find or create a subfolder inside parentId.
 * Returns the folder's ID.
 */
async function getOrCreateFolder(
  drive: drive_v3.Drive,
  name: string,
  parentId: string,
): Promise<string> {
  // Search for existing folder
  const query = `name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const { data } = await drive.files.list({
    q: query,
    fields: 'files(id)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    corpora: 'allDrives',
  });

  if (data.files && data.files.length > 0) {
    return data.files[0].id!;
  }

  // Create folder
  const folder = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
    supportsAllDrives: true,
  });

  return folder.data.id!;
}

export async function POST(req: NextRequest) {
  // Verify user is authenticated via Supabase
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const token = authHeader.slice(7);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!rootFolderId) {
    return NextResponse.json({ error: 'Google Drive folder not configured' }, { status: 500 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const campaignName = (formData.get('campaignName') as string) || 'Không có chiến dịch';
    const taskTitle = (formData.get('taskTitle') as string) || 'Untitled Task';
    const uploaderName = (formData.get('uploaderName') as string) || 'Unknown';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // 50MB limit
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: 'File quá lớn (tối đa 50MB)' }, { status: 400 });
    }

    const drive = getDriveClient();

    // Build folder structure: Root > Campaign > Task > Editor
    const campaignFolderId = await getOrCreateFolder(drive, campaignName, rootFolderId);
    const taskFolderId = await getOrCreateFolder(drive, taskTitle, campaignFolderId);
    const editorFolderId = await getOrCreateFolder(drive, uploaderName, taskFolderId);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const stream = Readable.from(buffer);

    const driveResponse = await drive.files.create({
      requestBody: {
        name: file.name,
        parents: [editorFolderId],
      },
      media: {
        mimeType: file.type || 'application/octet-stream',
        body: stream,
      },
      fields: 'id, name, webViewLink',
      supportsAllDrives: true,
    });

    // Make file accessible to anyone with the link
    await drive.permissions.create({
      fileId: driveResponse.data.id!,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
      supportsAllDrives: true,
    });

    return NextResponse.json({
      fileId: driveResponse.data.id,
      fileName: driveResponse.data.name,
      url: driveResponse.data.webViewLink,
    });
  } catch (err: unknown) {
    console.error('Google Drive upload error:', err);
    const message = err instanceof Error ? err.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
