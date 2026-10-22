// Files and folders the script keeps in the owner's Drive (receipts, Excel
// copies, the assistant workbook). The
// advanced Drive service with the `drive.file` scope only sees files the
// script created itself.

import { getMeta, setMeta } from './util';

type Spreadsheet = GoogleAppsScript.Spreadsheet.Spreadsheet;

export interface DriveFile {
  id: string;
  name?: string;
  mimeType?: string;
  size?: string;
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

const FOLDER_MIME = 'application/vnd.google-apps.folder';

/** The folder stored under `metaKey`; made on first use, remade if it was deleted. */
export function appFolder(ss: Spreadsheet, metaKey: string, name: string): string {
  const id = getMeta(ss, metaKey);
  if (id) {
    try {
      if (!getFile(id).trashed) return id;
    } catch {
      // Deleted: make a new one.
    }
  }
  const folder = Drive.Files.create({ name: `${name} - ${ss.getName()}`, mimeType: FOLDER_MIME });
  setMeta(ss, metaKey, folder.id);
  return folder.id;
}

export function createFile(
  folderId: string,
  blob: GoogleAppsScript.Base.Blob,
  name: string,
  mimeType: string,
): DriveFile {
  return Drive.Files.create({ name, mimeType, parents: [folderId] }, blob, {
    fields: 'id,name,webViewLink',
  });
}

/** A new, empty Google Sheets file (made through Drive so `drive.file` covers it). */
export function createSpreadsheetFile(name: string): DriveFile {
  return Drive.Files.create(
    { name, mimeType: 'application/vnd.google-apps.spreadsheet' },
    undefined,
    { fields: 'id,name,webViewLink' },
  );
}

export function getFile(id: string): DriveFile {
  return Drive.Files.get(id, { fields: 'id,name,mimeType,size,webViewLink,trashed' });
}

/** Moves a file to the Drive trash (the self-test cleans up with it). */
export function trashFile(id: string): void {
  Drive.Files.update({ trashed: true }, id);
}
