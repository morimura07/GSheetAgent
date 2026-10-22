// Bundles src/ into dist/Code.js for Apps Script.
//
// Apps Script only sees top-level `function` declarations (menus, triggers,
// google.script.run), so the bundle is an IIFE under GLOBAL and every export
// of src/index.ts gets a top-level stub that forwards to it.
// The phone app (src/app/client.ts) is bundled separately and inlined into
// dist/App.html, since HtmlService serves a single file.
import { build } from 'esbuild';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';

const ENTRY = 'src/index.ts';
const CLIENT_ENTRY = 'src/app/client.ts';
const CLIENT_HTML = 'src/app/app.html';
const GLOBAL = '__GSA__';

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const version = `${pkg.version}+${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}`;

const common = {
  entryPoints: [ENTRY],
  bundle: true,
  target: 'es2020',
  write: false,
  define: { __BUILD_VERSION__: JSON.stringify(version) },
};

// ESM pass only to learn the export names.
const esm = await build({ ...common, format: 'esm', metafile: true });
const exportNames = Object.values(esm.metafile.outputs).flatMap((o) => o.exports ?? []);
if (exportNames.length === 0) throw new Error(`${ENTRY} exports nothing`);

const iife = await build({ ...common, format: 'iife', globalName: GLOBAL });
const stubs = exportNames
  .map((name) => `function ${name}(...args) { return ${GLOBAL}.${name}(...args); }`)
  .join('\n');

await mkdir('dist', { recursive: true });
await writeFile('dist/Code.js', `${iife.outputFiles[0].text}\n${stubs}\n`);
await copyFile('appsscript.json', 'dist/appsscript.json');

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
  'dist/App.html',
  html.replace('<!-- CLIENT_SCRIPT -->', () => `<script>${clientJs}</script>`),
);

console.log(`Built dist/Code.js (${version}) exposing: ${exportNames.join(', ')}`);
console.log(`Built dist/App.html (${(clientJs.length / 1024).toFixed(1)} KB script)`);
