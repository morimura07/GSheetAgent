// Builds the release copy (node build.mjs --release) and pushes it to the
// TEMPLATE spreadsheet, a blank spreadsheet whose bound script is the tracker.
// The client opens its /copy link while signed in to their own account: the
// copy, its script and all data then belong to them; the developer has no access.
// The template is made on the first run (release/.clasp.json remembers it) and
// updated on later runs. It holds no data: the client runs "Set up workbook".
// Usage: npm run template
import { execSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const DIR = 'release';

function sh(cmd, cwd = '.') {
  try {
    return execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  } catch (err) {
    console.error(`\`${cmd}\` failed:\n${err.stdout ?? ''}${err.stderr ?? ''}`);
    process.exit(2);
  }
}

console.log('• release build');
sh('node build.mjs --release');
if (existsSync('release/dist/SampleImages.html'))
  throw new Error('test screenshots in the release');

// clasp writes .clasp.json into the folder it runs in, whatever -P says, so the
// template is created from an empty temporary folder outside the repo, and its
// .clasp.json moved into release/. -P then keeps push away from the DEV project.
const clasp = `npx clasp -P ${DIR}`;
if (!existsSync(`${DIR}/.clasp.json`)) {
  console.log('• creating the TEMPLATE spreadsheet and its script');
  const tmp = mkdtempSync(join(tmpdir(), 'agent-tracker-template-'));
  const bin = resolve('node_modules/.bin/clasp');
  sh(`"${bin}" create-script --type sheets --title "Agent Tracker"`, tmp);
  const project = JSON.parse(readFileSync(join(tmp, '.clasp.json'), 'utf8'));
  writeFileSync(`${DIR}/.clasp.json`, JSON.stringify({ ...project, rootDir: 'dist' }, null, 2));
  rmSync(tmp, { recursive: true, force: true });
}
console.log('• clasp push');
const pushed = sh(`${clasp} push -f`);
if (!pushed.includes('Code.js') || /SampleImages|\.\.[\/]dist/.test(pushed)) {
  throw new Error(`unexpected push:
${pushed}`);
}

const { parentId, scriptId } = JSON.parse(readFileSync(`${DIR}/.clasp.json`, 'utf8'));
const parent = Array.isArray(parentId) ? parentId[0] : parentId;
console.log(`
Template spreadsheet: https://docs.google.com/spreadsheets/d/${parent}/edit
Template script:      https://script.google.com/d/${scriptId}/edit

Hand-over link (share the template with the client's email as Viewer first):
https://docs.google.com/spreadsheets/d/${parent}/copy
`);
