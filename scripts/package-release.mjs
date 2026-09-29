import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, resolve, join } from 'node:path'

// Package already verified builds. No build-time dependencies are needed to run them.
const root = resolve(import.meta.dirname, '..')
const metadata = JSON.parse(await readFile(join(root, 'dist/build.json'), 'utf8'))
const serverMetadata = JSON.parse(await readFile(join(root, 'server-dist/build.json'), 'utf8'))
if (metadata.version !== serverMetadata.version || metadata.revision !== serverMetadata.revision) {
  throw new Error('Browser and server builds must come from the same version and revision.')
}
const output = resolve(process.argv[2] ?? join(root, '.artifacts'))
await mkdir(output, { recursive: true })
const staging = await mkdtemp(join(tmpdir(), 'emifoot-package-'))
try {
  await cp(join(root, 'dist'), join(staging, 'web'), { recursive: true })
  await cp(join(root, 'server-dist'), join(staging, 'server'), { recursive: true })
  for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) await cp(join(root, file), join(staging, file))
  await writeFile(join(staging, 'package.json'), JSON.stringify({ name: 'emifoot', version: metadata.version, private: true, type: 'module' }) + '\n')
  const licenses = JSON.parse(execFileSync('pnpm', ['licenses', 'list', '--prod', '--json'], { cwd: root, encoding: 'utf8' }))
  const dependencies = Object.values(licenses).flat()
  const require = createRequire(join(root, 'package.json'))
  const resolvers = [require]
  for (const dependency of dependencies) {
    try { resolvers.push(createRequire(require.resolve(`${dependency.name}/package.json`))) } catch { /* Transitive package. */ }
  }
  let notices = '# Bundled dependency licenses\n\n'
  for (const dependency of dependencies) {
    let directory
    for (const resolver of resolvers) {
      try { directory = dirname(resolver.resolve(`${dependency.name}/package.json`)); break } catch { /* Try the next dependency tree. */ }
    }
    if (!directory) throw new Error(`Cannot locate dependency notices: ${dependency.name}`)
    const files = (await readdir(directory)).filter((name) => /^licen[cs]e(?:\.|$)/i.test(name))
    if (!files.length) throw new Error(`Missing license text: ${dependency.name}`)
    notices += `## ${dependency.name} ${dependency.versions.join(', ')}\n\n`
    for (const file of files) notices += `${await readFile(join(directory, file), 'utf8')}\n\n`
  }
  await writeFile(join(staging, 'DEPENDENCY_LICENSES.md'), notices)
  await writeFile(join(staging, 'release.json'), JSON.stringify({ ...metadata, node: '>=22.12 <23 || >=24 <25' }, null, 2) + '\n')
  const name = `emifoot-${metadata.version}.tar.gz`
  execFileSync('tar', ['--no-xattrs', '-czf', join(output, name), '-C', staging, 'web', 'server', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'DEPENDENCY_LICENSES.md', 'package.json', 'release.json'], {
    env: { ...process.env, COPYFILE_DISABLE: '1' },
  })
  const hash = createHash('sha256').update(await readFile(join(output, name))).digest('hex')
  await writeFile(join(output, `${name}.sha256`), `${hash}  ${name}\n`)
  process.stdout.write(`${join(output, name)}\n`)
} finally {
  await rm(staging, { recursive: true, force: true })
}
