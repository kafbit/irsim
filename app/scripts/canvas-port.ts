import { canvasPort, repoRoot } from '../src/lib/port'

const flag = process.argv.indexOf('--root')
const root = flag === -1 ? repoRoot() : (process.argv[flag + 1] ?? repoRoot())
console.log(await canvasPort(root))
