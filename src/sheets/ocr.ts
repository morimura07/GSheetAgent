// Reads the text in a screenshot with Google Drive's built-in text recognition:
// the image is uploaded as a Google Doc (Drive converts it with OCR), the text
// is exported, and the Doc is deleted for good straight away. Contact
// screenshots hold SSNs and card numbers, so nothing is left in Drive (not
// even in the trash) and the text is never logged.

type Blob = GoogleAppsScript.Base.Blob;

interface DriveV3 {
  Files: {
    create(resource: object, blob?: Blob, options?: object): { id: string };
    export(id: string, mimeType: string, options?: object): unknown;
    remove(id: string): void;
    list(options: object): { files?: { id: string }[] };
  };
}

declare const Drive: DriveV3;

const GOOGLE_DOC = 'application/vnd.google-apps.document';
const TEMP_NAME = 'Agent Tracker screenshot (deleted after reading)';
export const OCR_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const MAX_OCR_BYTES = 4 * 1024 * 1024;

export function ocrImage(base64: string, mimeType: string): string {
  if (!OCR_TYPES.includes(mimeType)) throw new Error('Screenshots must be JPEG or PNG images');
  const bytes = Utilities.base64Decode(base64);
  if (bytes.length > MAX_OCR_BYTES) throw new Error('Screenshot is too large (4 MB max)');
  const blob = Utilities.newBlob(bytes, mimeType, 'contact');
  const doc = Drive.Files.create({ name: TEMP_NAME, mimeType: GOOGLE_DOC }, blob, {
    ocrLanguage: 'en',
    fields: 'id',
  });
  try {
    return exportText(doc.id);
  } finally {
    Drive.Files.remove(doc.id);
  }
}

// The advanced Drive service cannot return a media download: it throws an
// HttpResponseException whose message is "Response Code: 200. Message: <body>".
// A 200 there is the export itself.
const EXPORT_BODY = /Response Code: 200\. Message: ([\s\S]*)$/;

function exportText(id: string): string {
  let out: unknown;
  try {
    out = Drive.Files.export(id, 'text/plain', { alt: 'media' });
  } catch (err) {
    const body = EXPORT_BODY.exec(String((err as Error).message ?? err));
    if (!body) throw err;
    out = body[1];
  }
  const blob = out as { getDataAsString?: () => string } | null;
  const text = typeof out === 'string' ? out : blob?.getDataAsString?.();
  if (text === undefined) throw new Error('Drive returned no text for the screenshot');
  // The OCR Doc starts with the image and a rule of underscores before the text.
  return text.replace(/^[\s\S]*?_{8,}\s*/, '').replace(/\r\n/g, '\n');
}

/** OCR Docs still in Drive, trash included (the self-test expects none). */
export function ocrLeftovers(): number {
  return Drive.Files.list({ q: `name = '${TEMP_NAME}'`, fields: 'files(id)' }).files?.length ?? 0;
}
