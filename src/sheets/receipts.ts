// Receipt photos go to a Drive folder the script creates (see drive.ts for why
// this needs only the `drive.file` scope).

import { appFolder, createFile, getFile, trashFile, type DriveFile } from './drive';

type Spreadsheet = GoogleAppsScript.Spreadsheet.Spreadsheet;

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
  return createFile(appFolder(ss, 'receiptsFolderId', 'Receipts'), blob, name, upload.mimeType);
}

/** Moves a receipt to the Drive trash (used by the self-test to clean up). */
export const trashReceipt = trashFile;

export const getReceipt = getFile;
