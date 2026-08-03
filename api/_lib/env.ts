/**
 * Read env at runtime with a dynamic key.
 * Sensitive Vercel vars are unavailable at build time; static `process.env.FOO`
 * access can get inlined as undefined by the serverless bundler.
 */
export function readEnv(name: string): string {
  const value = process.env[name]
  return typeof value === 'string' ? value.trim() : ''
}

export function hasEnv(name: string): boolean {
  return Boolean(readEnv(name))
}
