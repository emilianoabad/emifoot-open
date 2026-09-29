import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import type { Plugin } from 'vite'

export interface SiteConfig {
  base: string
  publicUrl?: string
}

export function siteConfig(environment: Record<string, string | undefined>): SiteConfig {
  let publicUrl: URL | undefined
  if (environment.EMIFOOT_PUBLIC_URL) {
    publicUrl = new URL(environment.EMIFOOT_PUBLIC_URL)
    if (!['http:', 'https:'].includes(publicUrl.protocol) || publicUrl.username || publicUrl.password || publicUrl.search || publicUrl.hash) {
      throw new Error('EMIFOOT_PUBLIC_URL must be an HTTP(S) URL without credentials, query, or fragment.')
    }
  }
  const path = environment.EMIFOOT_BASE_PATH ?? publicUrl?.pathname ?? '/'
  if (!/^\/(?:[a-zA-Z0-9_-]+\/?)*$/.test(path)) {
    throw new Error('EMIFOOT_BASE_PATH must be an absolute path containing letters, numbers, hyphens, underscores, and slashes.')
  }
  const base = path.endsWith('/') ? path : `${path}/`
  if (publicUrl) publicUrl.pathname = base
  return { base, publicUrl: publicUrl?.toString() }
}

export function siteMetadata(site: SiteConfig): Plugin {
  const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
  let revision = process.env.SOURCE_REVISION ?? 'source-archive'
  try {
    revision = process.env.SOURCE_REVISION ?? execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch { /* Source archives have no Git metadata. */ }
  return {
    name: 'emifoot-site-metadata',
    config: () => ({ define: { __EMIFOOT_VERSION__: JSON.stringify(version) } }),
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'build.json', source: JSON.stringify({ version, revision, basePath: site.base, publicUrl: site.publicUrl }, null, 2) + '\n' })
    },
    transformIndexHtml(html, context) {
      const pageUrl = site.publicUrl && new URL(context.path.includes('/invite/') ? 'invite/' : '', site.publicUrl).toString()
      const imageUrl = site.publicUrl ? new URL('og-emifoot.png', site.publicUrl).toString() : `${site.base}og-emifoot.png`
      // Absolute metadata belongs to the configured installation, never to a developer's site.
      return html
        .replace(/^.*__EMIFOOT_PAGE_URL__.*\n/gm, (line) => pageUrl ? line.replaceAll('__EMIFOOT_PAGE_URL__', pageUrl) : '')
        .replaceAll('__EMIFOOT_IMAGE_URL__', imageUrl)
    },
  }
}
