import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, rm } from 'node:fs/promises'
import { basename, dirname, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptPath = process.argv[2]
if (!scriptPath) {
  throw new Error('Usage: node scripts/run-engine-script.mjs <script.ts>')
}

const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const entryPoint = resolve(projectDir, scriptPath)
const scriptName = basename(entryPoint, extname(entryPoint)).replace(/[^a-z0-9_-]/gi, '-')
const outputPath = resolve(
  projectDir,
  `node_modules/.cache/abjad-${scriptName}-${randomUUID()}.mjs`
)

await mkdir(dirname(outputPath), { recursive: true })

try {
  await build({
    entryPoints: [entryPoint],
    bundle: true,
    format: 'esm',
    platform: 'node',
    packages: 'external',
    outfile: outputPath,
    logLevel: 'warning'
  })

  await new Promise((resolveProcess, reject) => {
    const child = spawn(process.execPath, [outputPath], {
      cwd: projectDir,
      stdio: 'inherit'
    })
    child.once('error', reject)
    child.once('close', (code) => {
      if (code === 0) resolveProcess()
      else reject(new Error(`${scriptPath} exited with code ${code}`))
    })
  })
} finally {
  await rm(outputPath, { force: true })
}
