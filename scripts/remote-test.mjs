// Builds and pushes to the DEV Apps Script project, runs the in-Sheets
// integration tests with `clasp run`, and prints the results.
// Usage: node scripts/remote-test.mjs [phase1|phase2|phase3|phase4|phase6]   (default: every suite)
// Exit code: 0 all passed, 1 test failures, 2 could not run.
import { execSync } from 'node:child_process';

function sh(cmd) {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  } catch (err) {
    console.error(`\`${cmd}\` failed:\n${err.stdout ?? ''}${err.stderr ?? ''}`);
    process.exit(2);
  }
}

console.log('• build');
sh('node build.mjs');
console.log('• clasp push');
sh('npx clasp push -f');
// One `clasp run` per suite: each resets the SELF-TEST sheet and must finish
// inside the 6-minute Apps Script limit on its own.
const SUITES = ['Phase1', 'Phase2', 'Phase3', 'Phase4', 'Phase6'];
const only = process.argv[2]?.toLowerCase();
let failed = 0;

for (const suite of SUITES.filter((s) => !only || s.toLowerCase() === only)) {
  console.log(`• clasp run runSelfTest${suite}Json (takes a minute or two)`);
  const report = parseReport(sh(`npx clasp run runSelfTest${suite}Json`));
  const secs = (report.ms / 1000).toFixed(1);
  console.log(
    `\n${suite} · build ${report.build} · ${report.passed} passed, ${report.failed} failed · ${secs}s`,
  );
  console.log(`Self-test sheet: ${report.spreadsheetUrl}\n`);
  for (const r of report.results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  (${r.ms} ms)`);
    if (!r.ok) console.log(`      ${r.error.replace(/\n/g, '\n      ')}`);
    if (r.note) console.log(`      ${r.note}`);
  }
  console.log('');
  failed += report.failed;
}
process.exit(failed ? 1 : 0);

// clasp prints the returned string, possibly quoted; accept either form.
function parseReport(out) {
  for (const candidate of [out.trim(), out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1)]) {
    try {
      const parsed = JSON.parse(candidate);
      const report = typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
      if (report?.results) return report;
    } catch {
      // try the next form
    }
  }
  console.error(`Could not read a test report from clasp:\n${out}`);
  process.exit(2);
}
