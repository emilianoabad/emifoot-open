import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readlink, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const installer = resolve(import.meta.dirname, 'install-release.mjs')
test('installs, prepares, updates, rolls back, and rejects corrupt or linked archives', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'emifoot-installer-test-'))
  const prefix = join(temporary, 'installation')
  const run = (...args) => execFileSync(process.execPath, [installer, '--prefix', prefix, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  const archive = async (version, linked = false) => {
    const source = join(temporary, version)
    await mkdir(join(source, 'web'), { recursive: true })
    await mkdir(join(source, 'server'))
    await writeFile(join(source, 'release.json'), JSON.stringify({ version }))
    await writeFile(join(source, 'web/index.html'), version)
    await writeFile(join(source, 'web/build.json'), '{}')
    await writeFile(join(source, 'server/index.js'), '')
    if (linked) await symlink('/tmp', join(source, 'web/link'))
    const file = `${source}.tar.gz`
    execFileSync('tar', ['-czf', file, '-C', source, 'web', 'server', 'release.json'], { env: { ...process.env, COPYFILE_DISABLE: '1' } })
    const hash = createHash('sha256').update(await readFile(file)).digest('hex')
    await writeFile(`${file}.sha256`, `${hash}  release.tar.gz\n`)
    return file
  }
  try {
    const first = await archive('1.0.0')
    const firstId = run('--archive', first)
    assert.equal(await readlink(join(prefix, 'current')), `releases/${firstId}`)
    assert.equal((await stat(join(prefix, 'current'))).mode & 0o777, 0o755)
    assert.equal(run('--archive', first), firstId)
    const second = await archive('1.0.1')
    const secondId = run('--archive', second, '--prepare')
    assert.equal(await readlink(join(prefix, 'current')), `releases/${firstId}`)
    run('--activate', secondId)
    assert.equal(await readFile(join(prefix, 'current/web/index.html'), 'utf8'), '1.0.1')
    run('--rollback')
    assert.equal(await readFile(join(prefix, 'current/web/index.html'), 'utf8'), '1.0.0')
    await writeFile(second, 'corrupted')
    assert.throws(() => run('--archive', second), /checksum mismatch/)
    assert.throws(() => run('--archive', first, '--rollback'), /separate operations/)
    assert.throws(() => run('--activate', '../escape'), /Invalid release ID/)
    const linked = await archive('1.0.2', true)
    assert.throws(() => run('--archive', linked), /Unsupported archive entry/)
    await mkdir(join(prefix, '.install-lock'))
    assert.throws(() => run('--archive', first), /EEXIST/)
    assert.equal(await readlink(join(prefix, 'current')), `releases/${firstId}`)
  } finally { await rm(temporary, { recursive: true, force: true }) }
})
