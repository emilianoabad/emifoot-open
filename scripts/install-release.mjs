import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, readlink, rename, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

const { values } = parseArgs({ options: {
  prefix: { type: 'string' }, archive: { type: 'string' }, repo: { type: 'string', default: 'emilianoabad/emifoot-open' },
  version: { type: 'string', default: 'latest' }, prepare: { type: 'boolean' }, activate: { type: 'string' }, rollback: { type: 'boolean' },
} })
if (!values.prefix) throw new Error('Usage: node scripts/install-release.mjs --prefix /srv/emifoot [--archive file.tar.gz | --version v1.0.0 | --rollback]')
if ([values.archive, values.activate, values.rollback].filter(Boolean).length > 1 || (values.prepare && (values.activate || values.rollback))) {
  throw new Error('Archive, activation, and rollback are separate operations.')
}
const prefix = resolve(values.prefix)
await mkdir(join(prefix, 'releases'), { recursive: true })
const lock = join(prefix, '.install-lock')
await mkdir(lock) // Concurrent installs must not exchange each other's current/previous links.
let temporary
try {
  const current = await linkTarget('current')
  if (values.rollback) {
    const previous = await linkTarget('previous')
    if (!previous) throw new Error('No previous release is available.')
    await activate(previous, current)
  } else if (values.activate) {
    if (!/^[a-zA-Z0-9._-]+$/.test(values.activate)) throw new Error('Invalid release ID.')
    await activate(`releases/${values.activate}`, current)
  } else {
    temporary = await mkdtemp(join(tmpdir(), 'emifoot-install-'))
    let archive = values.archive && resolve(values.archive)
    if (!archive) {
      const tag = values.version === 'latest' ? [] : [values.version]
      execFileSync('gh', ['release', 'download', ...tag, '--repo', values.repo, '--pattern', 'emifoot-*.tar.gz*', '--dir', temporary], { stdio: 'inherit' })
      const archives = (await readdir(temporary)).filter((file) => file.endsWith('.tar.gz'))
      if (archives.length !== 1) throw new Error('Expected exactly one release archive.')
      archive = join(temporary, archives[0])
    }
    const expected = (await readFile(`${archive}.sha256`, 'utf8')).trim().split(/\s+/)[0]
    const actual = createHash('sha256').update(await readFile(archive)).digest('hex')
    if (!/^[a-f0-9]{64}$/.test(expected) || actual !== expected) throw new Error('Release checksum mismatch; nothing was installed.')
    const paths = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).trim().split('\n')
    if (paths.some((path) => path.startsWith('/') || path.split('/').includes('..'))) throw new Error('Unsafe archive path.')
    // Release packages contain only regular files and directories, never links or devices.
    const listing = execFileSync('tar', ['-tvzf', archive], { encoding: 'utf8' }).trim().split('\n')
    if (listing.some((line) => !['-', 'd'].includes(line[0]))) throw new Error('Unsupported archive entry.')
    const staging = await mkdtemp(join(prefix, 'releases', '.staging-'))
    try {
      execFileSync('tar', ['-xzf', archive, '-C', staging, '--no-same-owner', '--no-same-permissions'])
      const release = JSON.parse(await readFile(join(staging, 'release.json'), 'utf8'))
      if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(release.version)) throw new Error('Invalid release version.')
      await validateRelease(staging)
      await readableTree(staging)
      const id = `${release.version}-${actual.slice(0, 12)}`
      const destination = join(prefix, 'releases', id)
      try { await lstat(destination) } catch (error) {
        if (error.code !== 'ENOENT') throw error
        await rename(staging, destination)
      }
      if (values.prepare) process.stdout.write(`${id}\n`)
      else await activate(`releases/${id}`, current)
    } finally { await rm(staging, { recursive: true, force: true }) }
  }
} finally {
  if (temporary) await rm(temporary, { recursive: true, force: true })
  await rm(lock, { recursive: true, force: true })
}

async function linkTarget(name) {
  try {
    const target = await readlink(join(prefix, name))
    if (!/^releases\/[a-zA-Z0-9._-]+$/.test(target)) throw new Error(`Invalid ${name} release link.`)
    return target
  } catch (error) {
    if (error.code === 'ENOENT') return undefined
    throw error
  }
}

async function validateRelease(directory) {
  for (const file of ['web/index.html', 'web/build.json', 'server/index.js', 'release.json']) {
    if (!(await lstat(join(directory, file))).isFile()) throw new Error(`Missing release file: ${file}`)
  }
}

async function readableTree(directory) {
  await chmod(directory, 0o755)
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) await readableTree(path)
    else await chmod(path, 0o644)
  }
}

async function replaceLink(name, target) {
  const temporaryLink = join(prefix, `.${name}-${randomUUID()}`)
  try {
    await symlink(target, temporaryLink)
    await rename(temporaryLink, join(prefix, name))
  } finally { await rm(temporaryLink, { force: true }) }
}

async function activate(target, current) {
  await validateRelease(join(prefix, target))
  if (target !== current) {
    if (current) await replaceLink('previous', current)
    await replaceLink('current', target)
  }
  process.stdout.write(`${basename(target)}\n`)
}
