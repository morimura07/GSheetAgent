// Publishes the current code as the phone app. Re-uses the "Phone app"
// deployment so its URL (saved on the client's home screen) never changes.
// Access is set in appsscript.json (webapp.access = MYSELF: owner only).
import { execSync } from 'node:child_process';

const DESCRIPTION = 'Phone app';
const run = (cmd) => execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

run('node build.mjs');
run('npx clasp push -f');

// The plain-text listing omits versioned deployments (clasp 3.4); JSON has them.
const existing = JSON.parse(run('npx clasp list-deployments --json')).find(
  (d) => d.description === DESCRIPTION,
);

const out = existing
  ? run(`npx clasp update-deployment ${existing.deploymentId} --description "${DESCRIPTION}"`)
  : run(`npx clasp create-deployment --description "${DESCRIPTION}"`);
console.log(out.trim());

const id = existing?.deploymentId ?? /(AKfy\S+)/.exec(out)?.[1];
if (id) console.log(`\nPhone app URL: https://script.google.com/macros/s/${id}/exec`);
