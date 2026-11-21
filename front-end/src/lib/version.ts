import { API_ROOT, API_VERSION } from '@/auth/api'

/** The build that's running on this device. */
export const BUILD = {
  version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0',
  builtAt: typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : null,
  commit: typeof __BUILD_COMMIT__ === 'string' && __BUILD_COMMIT__ ? __BUILD_COMMIT__ : null,
  api: API_VERSION,
}

/** What's deployed on the server. */
export interface ServerVersion {
  version: string
  api: string
  apis: string[]
  commit: string | null
}

export async function fetchServerVersion(signal?: AbortSignal): Promise<ServerVersion> {
  const response = await fetch(`${API_ROOT}/version`, { signal, cache: 'no-store' })
  if (!response.ok) throw new Error(`Version check failed (${response.status})`)
  return (await response.json()) as ServerVersion
}

/** Compares dotted versions numerically: -1, 0 or 1. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((part) => Number.parseInt(part, 10) || 0)
  const pb = b.split('.').map((part) => Number.parseInt(part, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff > 0 ? 1 : -1
  }
  return 0
}

export type VersionMatch = 'same' | 'update' | 'ahead' | 'unsupported'

/**
 * How this build stands against the server: the same, behind it (an update is waiting),
 * ahead of it (the server hasn't been deployed yet), or speaking an API it no longer serves.
 */
export function matchVersions(
  build: Pick<typeof BUILD, 'version' | 'api'>,
  server: Pick<ServerVersion, 'version' | 'apis'>,
): VersionMatch {
  if (!server.apis.includes(build.api)) return 'unsupported'
  const order = compareVersions(build.version, server.version)
  return order === 0 ? 'same' : order < 0 ? 'update' : 'ahead'
}
