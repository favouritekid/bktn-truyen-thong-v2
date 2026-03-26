import { NextRequest, NextResponse } from 'next/server';
import { google, type drive_v3 } from 'googleapis';
import { createClient } from '@supabase/supabase-js';

const SCOPES = ['https://www.googleapis.com/auth/drive'];

function getDriveClient() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}');
  const auth = new google.auth.GoogleAuth({ credentials, scopes: SCOPES });
  return google.drive({ version: 'v3', auth });
}

async function findFolder(
  drive: drive_v3.Drive,
  name: string,
  parentId: string,
): Promise<string | null> {
  const query = `name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const { data } = await drive.files.list({
    q: query,
    fields: 'files(id)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    corpora: 'allDrives',
  });
  return data.files?.[0]?.id || null;
}

async function listSubfolders(
  drive: drive_v3.Drive,
  parentId: string,
): Promise<{ id: string; name: string }[]> {
  const query = `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const { data } = await drive.files.list({
    q: query,
    fields: 'files(id, name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    corpora: 'allDrives',
  });
  return (data.files || []).map(f => ({ id: f.id!, name: f.name! }));
}

export async function POST(req: NextRequest) {
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
    const { type, campaignName, taskMonth, oldName, newName, taskTitle } = body as {
      type: 'task' | 'checklist';
      campaignName: string;
      taskMonth: string;
      oldName: string;
      newName: string;
      taskTitle?: string;
    };

    if (!oldName || !newName || oldName === newName) {
      return NextResponse.json({ error: 'Invalid names' }, { status: 400 });
    }

    const drive = getDriveClient();

    // Navigate: Root > Campaign > Month
    const campaignFolderId = await findFolder(drive, campaignName, rootFolderId);
    if (!campaignFolderId) {
      return NextResponse.json({ skipped: true, reason: 'Campaign folder not found' });
    }

    const monthFolderId = await findFolder(drive, taskMonth, campaignFolderId);
    if (!monthFolderId) {
      return NextResponse.json({ skipped: true, reason: 'Month folder not found' });
    }

    if (type === 'task') {
      const taskFolderId = await findFolder(drive, oldName, monthFolderId);
      if (!taskFolderId) {
        return NextResponse.json({ skipped: true, reason: 'Task folder not found' });
      }

      await drive.files.update({
        fileId: taskFolderId,
        requestBody: { name: newName },
        supportsAllDrives: true,
      });

      return NextResponse.json({ success: true, renamed: 'task' });
    }

    if (type === 'checklist') {
      if (!taskTitle) {
        return NextResponse.json({ error: 'taskTitle required for checklist rename' }, { status: 400 });
      }

      const taskFolderId = await findFolder(drive, taskTitle, monthFolderId);
      if (!taskFolderId) {
        return NextResponse.json({ skipped: true, reason: 'Task folder not found' });
      }

      // Scan all editor subfolders for the old checklist name
      const editorFolders = await listSubfolders(drive, taskFolderId);
      let renamedCount = 0;

      for (const editorFolder of editorFolders) {
        const checklistFolderId = await findFolder(drive, oldName, editorFolder.id);
        if (checklistFolderId) {
          await drive.files.update({
            fileId: checklistFolderId,
            requestBody: { name: newName },
            supportsAllDrives: true,
          });
          renamedCount++;
        }
      }

      return NextResponse.json({ success: true, renamed: 'checklist', count: renamedCount });
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  } catch (err: unknown) {
    console.error('Drive rename error:', err);
    const message = err instanceof Error ? err.message : 'Rename failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
