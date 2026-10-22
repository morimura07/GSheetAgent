// The client's made-up test contact screenshots (samples/, git-ignored), which
// build.mjs copies into the DEV script project as SampleImages.html when the
// folder is present. Used by the Phase 4 self-test and by `ocrSamplesJson`.

export interface SampleImage {
  name: string;
  mimeType: string;
  base64: string;
}

export function sampleImages(): SampleImage[] {
  try {
    return JSON.parse(HtmlService.createHtmlOutputFromFile('SampleImages').getContent());
  } catch {
    return []; // built without samples/
  }
}
