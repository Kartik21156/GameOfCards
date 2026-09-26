// Copies the Kenney assets the game uses into the client's public folder.
import { cpSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'boardgamePack_v2');
const out = join(root, 'packages', 'client', 'public', 'assets');

if (existsSync(join(out, '.done'))) process.exit(0);

const copyDir = (from, to, filter = () => true) => {
  mkdirSync(to, { recursive: true });
  for (const f of readdirSync(from)) if (filter(f)) cpSync(join(from, f), join(to, f));
};

copyDir(join(src, 'PNG', 'Cards'), join(out, 'cards'));
copyDir(join(src, 'PNG', 'Chips'), join(out, 'chips'));
copyDir(join(src, 'Bonus'), join(out, 'sounds'), (f) => f.endsWith('.ogg'));
for (const color of ['Black', 'Blue', 'Green', 'Purple', 'Red', 'White', 'Yellow']) {
  copyDir(join(src, 'PNG', `Pieces (${color})`), join(out, 'avatars'), (f) => f.includes('_single'));
}
cpSync(join(src, 'license.txt'), join(out, 'LICENSE-kenney.txt'));
mkdirSync(out, { recursive: true });
cpSync(join(src, 'license.txt'), join(out, '.done'));
console.log('assets copied to', out);
