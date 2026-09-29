export function serverConfig(environment: Record<string, string | undefined>) {
  const port = Number(environment.PORT ?? 8789)
  if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new Error('PORT must be an integer between 0 and 65535.')
  const basePath = environment.EMIFOOT_BASE_PATH ?? '/'
  if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(basePath)) throw new Error('EMIFOOT_BASE_PATH must start and end with a slash.')
  return { port, host: environment.HOST ?? '127.0.0.1', basePath }
}
