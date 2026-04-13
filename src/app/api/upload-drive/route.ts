import { NextRequest, NextResponse } from 'next/server';
import { google, type drive_v3 } from 'googleapis';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 60;

const SCOPES = ['https://www.googleapis.com/auth/drive'];

function getAuthAndDrive() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}');
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: SCOPES,
  });
  const drive = google.drive({ version: 'v3', auth });
  return { auth, drive };
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

/**
 * Accepts JSON metadata, creates folder structure on Google Drive,
 * initiates a resumable upload session, and returns the upload URL.
 * The client then uploads the file directly to Google Drive.
 */
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
    const body = await req.json();
    const {
      fileName,
      fileSize,
      fileMimeType,
      campaignName = 'Không có chiến dịch',
      taskMonth = '',
      taskTitle = 'Untitled Task',
      uploaderName = 'Unknown',
      checklistTitle = '',
      targetFolderId: existingFolderId,
    } = body as {
      fileName: string;
      fileSize?: number;
      fileMimeType?: string;
      campaignName?: string;
      taskMonth?: string;
      taskTitle?: string;
      uploaderName?: string;
      checklistTitle?: string;
      targetFolderId?: string;
    };

    if (!fileName) {
      return NextResponse.json({ error: 'fileName is required' }, { status: 400 });
    }

    const { auth, drive } = getAuthAndDrive();
    let targetFolderId: string;
    let folderUrl: string;
    let version = 0;

    if (existingFolderId) {
      // Subsequent file: reuse existing folder
      targetFolderId = existingFolderId;
      folderUrl = `https://drive.google.com/drive/folders/${targetFolderId}`;
    } else {
      // First file: create full folder structure
      const campaignFolderId = await getOrCreateFolder(drive, campaignName, rootFolderId);
      const monthFolderId = taskMonth
        ? await getOrCreateFolder(drive, taskMonth, campaignFolderId)
        : campaignFolderId;
      const taskFolderId = await getOrCreateFolder(drive, taskTitle, monthFolderId);
      const editorFolderId = await getOrCreateFolder(drive, uploaderName, taskFolderId);
      const checklistFolderId = checklistTitle
        ? await getOrCreateFolder(drive, checklistTitle, editorFolderId)
        : editorFolderId;

      // Auto-version: count existing version folders, create next one
      const { data: existingVersions } = await drive.files.list({
        q: `'${checklistFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false and name contains 'v'`,
        fields: 'files(name)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        corpora: 'allDrives',
      });
      const versionNumbers = (existingVersions?.files || [])
        .map(f => parseInt(f.name?.replace('v', '') || '0', 10))
        .filter(n => !isNaN(n));
      const nextVersion = versionNumbers.length > 0 ? Math.max(...versionNumbers) + 1 : 1;
      version = nextVersion;
      targetFolderId = await getOrCreateFolder(drive, `v${nextVersion}`, checklistFolderId);
      folderUrl = `https://drive.google.com/drive/folders/${targetFolderId}`;

      // Set folder permission so anyone with link can view
      await drive.permissions.create({
        fileId: targetFolderId,
        requestBody: { role: 'reader', type: 'anyone' },
        supportsAllDrives: true,
      }).catch(() => {
        // Shared Drive may restrict this - files inherit Drive permissions
      });
    }

    // Initiate resumable upload session with Google Drive
    const authClient = await auth.getClient();
    const tokenResponse = await authClient.getAccessToken();
    const accessToken = tokenResponse?.token;
    if (!accessToken) {
      return NextResponse.json({ error: 'Failed to get Google access token' }, { status: 500 });
    }

    const mimeType = fileMimeType || 'application/octet-stream';
    // Pass client origin so Google returns CORS headers on the upload URL
    const clientOrigin = req.headers.get('origin') || req.headers.get('referer')?.replace(/\/[^/]*$/, '') || '';
    const initHeaders: Record<string, string> = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': mimeType,
    };
    if (clientOrigin) {
      initHeaders['Origin'] = clientOrigin;
    }
    if (fileSize) {
      initHeaders['X-Upload-Content-Length'] = String(fileSize);
    }

    const initResponse = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true',
      {
        method: 'POST',
        headers: initHeaders,
        body: JSON.stringify({
          name: fileName,
          parents: [targetFolderId],
        }),
      },
    );

    if (!initResponse.ok) {
      const errorText = await initResponse.text();
      console.error('Resumable upload init error:', errorText);
      return NextResponse.json({ error: 'Failed to initiate upload session' }, { status: 500 });
    }

    const uploadUrl = initResponse.headers.get('Location');
    if (!uploadUrl) {
      return NextResponse.json({ error: 'No upload URL returned from Google Drive' }, { status: 500 });
    }

    return NextResponse.json({
      uploadUrl,
      targetFolderId,
      folderUrl,
      version,
    });
  } catch (err: unknown) {
    console.error('Upload init error:', err);
    const message = err instanceof Error ? err.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
