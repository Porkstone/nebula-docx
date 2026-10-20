export interface OpenedFile { name: string; bytes: Uint8Array; id?: string }
export interface RecentFile { id: string; name: string; openedAt: string }
export interface NativeBridge {
  open: () => Promise<OpenedFile | null>
  recent: () => Promise<RecentFile[]>
  openRecent: (id: string) => Promise<OpenedFile>
  save: (name: string, bytes: Uint8Array) => Promise<boolean>
  copy: (text: string) => Promise<void>
  print: (html: string) => Promise<{ success: boolean; reason?: string }>
  onOpen: (callback: (file: OpenedFile) => void) => () => void
  onCommand: (callback: (command: string) => void) => () => void
  ready: () => void
}
declare global { interface Window { nebula?: NativeBridge } }
