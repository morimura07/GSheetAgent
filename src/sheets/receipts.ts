// Receipt photos go to a Drive folder the script creates. Uses the advanced
// Drive service (v3) so the script only needs the `drive.file` scope (files it
// created itself), not access to the whole Drive.

import { getMeta, setMeta } from './util';

type Spreadsheet = GoogleAppsScript.Spreadsheet.Spreadsheet;

interface DriveFile {
  id: string;
  webViewLink?: string;
  trashed?: boolean;
}

interface DriveV3 {
  Files: {
    create(resource: object, blob?: GoogleAppsScript.Base.Blob, options?: object): DriveFile;
    get(id: string, options?: object): DriveFile;
    update(resource: object, id: string): DriveFile;
  };
}

declare const Drive: DriveV3;

const FOLDER_KEY = 'receiptsFolderId';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/webp', 'application/pdf'];

export function saveReceipt(
  ss: Spreadsheet,
  upload: { base64: string; mimeType: string },
  name: string,
): DriveFile {
  if (!ALLOWED_TYPES.includes(upload.mimeType)) {
    throw new Error('Receipt must be a photo or a PDF');
  }
  const bytes = Utilities.base64Decode(upload.base64);
  if (bytes.length > MAX_RECEIPT_BYTES) throw new Error('Receipt file is too large (10 MB max)');
  const blob = Utilities.newBlob(bytes, upload.mimeType, name);
  return Drive.Files.create(
    { name, mimeType: upload.mimeType, parents: [receiptsFolder(ss)] },
    blob,
    { fields: 'id,webViewLink' },
  );
}

/** Moves a receipt to the Drive trash (used by the self-test to clean up). */
export function trashReceipt(id: string): void {
  Drive.Files.update({ trashed: true }, id);
}

export function getReceipt(id: string): DriveFile {
  return Drive.Files.get(id, { fields: 'id,webViewLink,trashed' });
}

/** The workbook's receipts folder; made on first use, remade if it was deleted. */
function receiptsFolder(ss: Spreadsheet): string {
  const id = getMeta(ss, FOLDER_KEY);
  if (id) {
    try {
      if (!getReceipt(id).trashed) return id;
    } catch {
      // Deleted: make a new one.
    }
  }
  const folder = Drive.Files.create({ name: `Receipts - ${ss.getName()}`, mimeType: FOLDER_MIME });
  setMeta(ss, FOLDER_KEY, folder.id);
  return folder.id;
}
