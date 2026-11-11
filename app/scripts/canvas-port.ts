import { projectRoot } from '../src/lib/design-dir'
import { canvasPort } from '../src/lib/port'

const flag = process.argv.indexOf('--root')
const root = flag === -1 ? projectRoot() : (process.argv[flag + 1] ?? projectRoot())
console.log(await canvasPort(root))
