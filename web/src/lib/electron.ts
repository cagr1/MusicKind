// Typed wrapper around `window.electronAPI`, exposed by electron/preload.cjs.
// In a plain browser (no Electron) every method resolves to a safe fallback
// instead of throwing, so the same UI code runs in `npm run dashboard`.

export interface PythonCheckResult {
  found: boolean
  cmd?: string
  version?: string
}

export interface PipPackageCheckResult {
  installed: boolean
}

export interface InstallFFmpegResult {
  success: boolean
  message?: string
  error?: string
}

interface ElectronApi {
  openDirectory: (title?: string) => Promise<string | null>
  openFiles: (title?: string, multiple?: boolean) => Promise<string | string[] | null>
  checkPython: () => Promise<PythonCheckResult>
  checkPipPackage: (pkg: string) => Promise<PipPackageCheckResult>
  checkFFmpeg: () => Promise<boolean>
  installFFmpeg: () => Promise<InstallFFmpegResult>
  isElectron: () => Promise<boolean>
  showInFolder: (filePath: string) => Promise<void>
  openExternal: (targetUrl: string) => Promise<void>
}

declare global {
  interface Window {
    electronAPI?: ElectronApi
  }
}

function getApi(): ElectronApi | undefined {
  return typeof window !== 'undefined' ? window.electronAPI : undefined
}

// Synchronous check, same pattern `ui/app.js` uses for `Runtime.isElectron`:
// presence of the bridge, not the async `is-electron` IPC round trip.
export const isElectron: boolean = Boolean(getApi()?.openDirectory)

export const electron = {
  isElectron,

  async openDirectory(title?: string): Promise<string | null> {
    const api = getApi()
    if (!api) return null
    return api.openDirectory(title)
  },

  async openFiles(title?: string, multiple = false): Promise<string | string[] | null> {
    const api = getApi()
    if (!api) return multiple ? [] : null
    return api.openFiles(title, multiple)
  },

  async checkPython(): Promise<PythonCheckResult> {
    const api = getApi()
    if (!api) return { found: false }
    return api.checkPython()
  },

  async checkPipPackage(pkg: string): Promise<PipPackageCheckResult> {
    const api = getApi()
    if (!api) return { installed: false }
    return api.checkPipPackage(pkg)
  },

  async checkFFmpeg(): Promise<boolean> {
    const api = getApi()
    if (!api) return false
    return api.checkFFmpeg()
  },

  async installFFmpeg(): Promise<InstallFFmpegResult> {
    const api = getApi()
    if (!api) return { success: false, error: 'not-electron' }
    return api.installFFmpeg()
  },

  // Round trip to the main process, kept for parity with the full preload
  // surface. Prefer the synchronous `isElectron` above for render decisions.
  async checkIsElectron(): Promise<boolean> {
    const api = getApi()
    if (!api) return false
    return api.isElectron()
  },

  async showInFolder(filePath: string): Promise<void> {
    const api = getApi()
    if (!api) return
    await api.showInFolder(filePath)
  },

  async openExternal(targetUrl: string): Promise<void> {
    const api = getApi()
    if (!api) return
    await api.openExternal(targetUrl)
  },
}
