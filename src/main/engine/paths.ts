import { existsSync } from 'node:fs'
import { join } from 'node:path'

let engineDir = ''

/** Dev: <repo>/engine/orca. Packaged: <resources>/engine/orca. FFPRINT_ENGINE_DIR overrides both. */
export function initEngineDir(appPath: string, resourcesPath: string, packaged: boolean): void {
  engineDir = process.env.FFPRINT_ENGINE_DIR || (packaged ? join(resourcesPath, 'engine', 'orca') : join(appPath, 'engine', 'orca'))
}

export const engine = {
  get dir(): string {
    return engineDir
  },
  get exe(): string {
    return join(engineDir, process.platform === 'win32' ? 'orca-slicer.exe' : 'orca-slicer')
  },
  get profiles(): string {
    return join(engineDir, 'resources', 'profiles')
  },
  get present(): boolean {
    return existsSync(this.exe) && existsSync(this.profiles)
  }
}

export const ENGINE_VERSION = '2.4.2'
