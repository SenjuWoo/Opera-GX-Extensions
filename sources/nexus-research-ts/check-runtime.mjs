import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyRuntime } from '../../tools/runtime-parity.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
console.log(verifyRuntime(path.join(root, 'dist'), path.resolve(root, '../../extensions/nexus-research')));
