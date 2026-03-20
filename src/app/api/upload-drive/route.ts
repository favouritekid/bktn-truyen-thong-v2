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
    const files = formData.getAll('files') as File[];
    const campaignName = (formData.get('campaignName') as string) || 'Không có chiến dịch';
    const taskTitle = (formData.get('taskTitle') as string) || 'Untitled Task';
    const uploaderName = (formData.get('uploaderName') as string) || 'Unknown';
    const checklistTitle = (formData.get('checklistTitle') as string) || '';

    if (files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    // 50MB per file limit
    const oversized = files.find(f => f.size > 50 * 1024 * 1024);
    if (oversized) {
      return NextResponse.json({ error: `File "${oversized.name}" quá lớn (tối đa 50MB)` }, { status: 400 });
    }

    const drive = getDriveClient();

    // Build folder structure: Root > Campaign > Task > Editor > [Checklist item]
    const campaignFolderId = await getOrCreateFolder(drive, campaignName, rootFolderId);
    const taskFolderId = await getOrCreateFolder(drive, taskTitle, campaignFolderId);
    const editorFolderId = await getOrCreateFolder(drive, uploaderName, taskFolderId);
    const targetFolderId = checklistTitle
      ? await getOrCreateFolder(drive, checklistTitle, editorFolderId)
      : editorFolderId;

    // Upload all files in parallel
    const uploadedFiles = await Promise.all(
      files.map(async (file) => {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const stream = Readable.from(buffer);

        const driveResponse = await drive.files.create({
          requestBody: {
            name: file.name,
            parents: [targetFolderId],
          },
          media: {
            mimeType: file.type || 'application/octet-stream',
            body: stream,
          },
          fields: 'id, name, webViewLink',
          supportsAllDrives: true,
        });

        return {
          fileId: driveResponse.data.id,
          fileName: driveResponse.data.name,
          url: driveResponse.data.webViewLink,
        };
      })
    );

    // Set folder permission so anyone with link can view
    // (Shared Drive may already handle this, but set on folder to be safe)
    await drive.permissions.create({
      fileId: targetFolderId,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
      supportsAllDrives: true,
    }).catch(() => {
      // Shared Drive may restrict this - files inherit Drive permissions
    });

    // Return folder link + individual file info
    const folderUrl = `https://drive.google.com/drive/folders/${targetFolderId}`;

    return NextResponse.json({
      folderUrl,
      fileCount: uploadedFiles.length,
      files: uploadedFiles,
    });
  } catch (err: unknown) {
    console.error('Google Drive upload error:', err);
    const message = err instanceof Error ? err.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
