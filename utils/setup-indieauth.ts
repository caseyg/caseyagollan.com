/** Run interactively on the owner's Mac. Never prints or writes bootstrap secrets. */
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
const args = new Set(process.argv.slice(2));
const preview = args.has('--preview');
if ((preview === args.has('--production')) || !args.has('--copy') || process.platform !== 'darwin') {
 console.error('Usage: bun utils/setup-indieauth.ts (--preview | --production) --copy');
 console.error('The setup key is copied locally to the macOS clipboard; it is never printed.');
 process.exit(1);
}
const config = preview ? 'wrangler.publishing-preview.jsonc' : 'wrangler.jsonc';
const origin = preview ? 'https://caseyagollan-publishing-preview.caseygollan.workers.dev' : 'https://caseyagollan.com';
const status = await fetch(origin + '/auth/session', { redirect: 'error' });
if (!status.ok) throw new Error('Deploy this environment with AUTH_ENABLED=true before initializing setup.');
const state = await status.json() as { credentialCount: number };
if (state.credentialCount !== 0) throw new Error('A passkey is already enrolled. Sign in to add another; bootstrap cannot reset an existing owner.');
const random = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
const setup = random();
const payload = JSON.stringify({ AUTH_SETUP_TOKEN: setup, AUTH_INTROSPECTION_TOKEN: random() });
const child = Bun.spawn(['bun','run','wrangler','secret','bulk','--config',resolve(config)], { stdin:'pipe',stdout:'pipe',stderr:'pipe',env:{...process.env,WRANGLER_LOG_PATH:resolve(tmpdir(),'casey-indieauth-bootstrap.log')} });
child.stdin.write(payload); child.stdin.end();
// Drain CLI output without exposing request bodies or values in the terminal/chat.
await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text()]);
if (await child.exited !== 0) throw new Error('Could not set setup credentials. Check Wrangler authentication and retry; values were withheld.');
const clipboard = Bun.spawn(['/usr/bin/pbcopy'], { stdin:'pipe',stdout:'ignore',stderr:'pipe' });
clipboard.stdin.write(setup); clipboard.stdin.end();
if (await clipboard.exited !== 0) throw new Error('Clipboard transfer failed. Rerun setup before enrolling; no secret was printed.');
console.log('Setup key copied to your clipboard. Paste it into “Setup token”, then choose “Create first passkey”.');
console.log(origin + '/account');
console.log('After enrollment, add a second passkey for recovery. This key cannot reset an enrolled account.');
