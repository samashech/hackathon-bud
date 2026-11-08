// The website and the extension are static, so each gets its own copy of core/.
import { cp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
for (const target of ['web/core', 'extension/core']) {
  await rm(join(root, target), { recursive: true, force: true });
  await cp(join(root, 'core'), join(root, target), { recursive: true });
}
console.log('copied core/ into web/core and extension/core');
