import { cp, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { spawn } from 'node:child_process'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const lib = join(root, 'lib')

await rm(lib, { recursive: true, force: true })

if (!process.argv.includes('--clean-only')) {
  await run(process.execPath, [join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', join(root, 'tsconfig.json')])
  await cp(join(root, 'src', 'client.js'), join(lib, 'client.js'))
  await cp(join(root, 'src', 'client.d.ts'), join(lib, 'client.d.ts'))
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`Build command failed (${signal ?? `exit ${code}`})`))
    })
  })
}
