// Bundles src/ into dist/Code.js for Apps Script.
//
// Apps Script only sees top-level `function` declarations (menus, triggers,
// google.script.run), so the bundle is an IIFE under GLOBAL and every export
// of src/index.ts gets a top-level stub that forwards to it.
// The phone app (src/app/client.ts) is bundled separately and inlined into
// dist/App.html, since HtmlService serves a single file.
import { build } from 'esbuild';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';

const ENTRY = 'src/index.ts';
const CLIENT_ENTRY = 'src/app/client.ts';
const CLIENT_HTML = 'src/app/app.html';
const GLOBAL = '__GSA__';
// `node build.mjs --release`: the copy handed to the client (release/dist): no
// test screenshots, no DEV menu items, no Execution API (that is for `clasp run`).
const RELEASE = process.argv.includes('--release');
const OUT = RELEASE ? 'release/dist' : 'dist';

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const version = `${pkg.version}+${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}`;

const common = {
  entryPoints: [ENTRY],
  bundle: true,
  target: 'es2020',
  write: false,
  define: { __BUILD_VERSION__: JSON.stringify(version), __RELEASE__: String(RELEASE) },
  minifySyntax: RELEASE, // drops the DEV-only branches
};

// ESM pass only to learn the export names.
const esm = await build({ ...common, format: 'esm', metafile: true });
const exportNames = Object.values(esm.metafile.outputs).flatMap((o) => o.exports ?? []);
if (exportNames.length === 0) throw new Error(`${ENTRY} exports nothing`);

const iife = await build({ ...common, format: 'iife', globalName: GLOBAL });
const stubs = exportNames
  .map((name) => `function ${name}(...args) { return ${GLOBAL}.${name}(...args); }`)
  .join('\n');

await mkdir(OUT, { recursive: true });
await writeFile(`${OUT}/Code.js`, `${iife.outputFiles[0].text}\n${stubs}\n`);
const manifest = JSON.parse(await readFile('appsscript.json', 'utf8'));
if (RELEASE) delete manifest.executionApi;
await writeFile(`${OUT}/appsscript.json`, `${JSON.stringify(manifest, null, 2)}\n`);

const client = await build({
  entryPoints: [CLIENT_ENTRY],
  bundle: true,
  target: 'es2020', // iOS 14+ Safari
  format: 'iife',
  minify: true,
  write: false,
});
const clientJs = client.outputFiles[0].text;
if (clientJs.includes('</script')) throw new Error('client bundle contains </script>');
const html = await readFile(CLIENT_HTML, 'utf8');
if (!html.includes('<!-- CLIENT_SCRIPT -->'))
  throw new Error(`${CLIENT_HTML} has no CLIENT_SCRIPT marker`);
await writeFile(
  `${OUT}/App.html`,
  html.replace('<!-- CLIENT_SCRIPT -->', () => `<script>${clientJs}</script>`),
);

// The client's made-up test screenshots, for the Phase 4 self-test. samples/
// is git-ignored; without it the file is left out and those cases are skipped.
const sampleFiles =
  !RELEASE && existsSync('samples')
    ? (await readdir('samples')).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort()
    : [];
if (sampleFiles.length) {
  const samples = await Promise.all(
    sampleFiles.map(async (name) => ({
      name,
      mimeType: /\.png$/i.test(name) ? 'image/png' : 'image/jpeg',
      base64: (await readFile(`samples/${name}`)).toString('base64'),
    })),
  );
  await writeFile(`${OUT}/SampleImages.html`, JSON.stringify(samples));
} else {
  await rm(`${OUT}/SampleImages.html`, { force: true });
}

console.log(`Built ${OUT}/Code.js (${version}) exposing: ${exportNames.join(', ')}`);
if (sampleFiles.length)
  console.log(`Built ${OUT}/SampleImages.html (${sampleFiles.length} images)`);
console.log(`Built ${OUT}/App.html (${(clientJs.length / 1024).toFixed(1)} KB script)`);
