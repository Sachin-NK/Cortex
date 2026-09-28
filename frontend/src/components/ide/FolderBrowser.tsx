import { useState } from 'react'
import { FolderInput, FolderOpen, FileText, X, Loader2, AlertTriangle, Folder } from 'lucide-react'

// File System Access API types
export interface FSFileEntry {
  name: string
  path: string
  is_dir: boolean
  size: number
  handle?: FileSystemFileHandle
  dirHandle?: FileSystemDirectoryHandle
  content?: string
}

interface Props {
  onFilesLoaded: (files: FSFileEntry[]) => void
  onClose: () => void
}

// Check if the browser supports the File System Access API
const supportsFileSystemAPI = typeof window !== 'undefined' && 'showDirectoryPicker' in window

// Recursively read a directory handle into FSFileEntry[]
async function readDirectory(
  dirHandle: FileSystemDirectoryHandle,
  basePath: string,
  depth: number = 0,
  maxDepth: number = 4
): Promise<FSFileEntry[]> {
  const entries: FSFileEntry[] = []
  if (depth > maxDepth) return entries

  const SKIP = new Set(['.git', 'node_modules', '__pycache__', '.venv', 'dist', '.pytest_cache'])

  for await (const [name, handle] of (dirHandle as any).entries()) {
    if (SKIP.has(name)) continue

    const path = basePath ? `${basePath}/${name}` : name

    if (handle.kind === 'directory') {
      const children = await readDirectory(handle as FileSystemDirectoryHandle, path, depth + 1, maxDepth)
      entries.push({ name, path, is_dir: true, size: 0, dirHandle: handle as FileSystemDirectoryHandle })
      entries.push(...children)
    } else {
      entries.push({ name, path, is_dir: false, size: 0, handle: handle as FileSystemFileHandle })
    }
  }

  // Sort: dirs first, then files, both alphabetical
  entries.sort((a, b) => {
    if (a.is_dir && !b.is_dir) return -1
    if (!a.is_dir && b.is_dir) return 1
    return a.name.localeCompare(b.name)
  })

  return entries
}

// Read file content from a FileSystemFileHandle
export async function readFileContent(handle: FileSystemFileHandle): Promise<string> {
  const file = await handle.getFile()
  if (file.size > 2 * 1024 * 1024) throw new Error(`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB)`)
  return file.text()
}

// Fallback: <input type="file"> for browsers without showDirectoryPicker
function FallbackPicker({ onFilesLoaded, onClose }: Props) {
  const [loading, setLoading] = useState(false)
  const [count, setCount] = useState(0)

  const handleInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    setLoading(true)

    const SKIP = new Set(['.git', 'node_modules', '__pycache__', '.venv', 'dist'])
    const entries: FSFileEntry[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const path = (file as any).webkitRelativePath || file.name
      const parts = path.split('/')
      // Skip hidden/vendor dirs
      if (parts.some((p: string) => SKIP.has(p))) continue
      if (file.size > 2 * 1024 * 1024) continue

      entries.push({ name: file.name, path, is_dir: false, size: file.size })
    }

    setCount(entries.length)
    setLoading(false)
    onFilesLoaded(entries)
    onClose()
  }

  return (
    <div className="px-6 pb-6 flex flex-col items-center gap-4">
      <div className="w-12 h-12 rounded-xl flex items-center justify-center"
        style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)' }}>
        <FolderOpen size={22} style={{ color: '#818cf8' }} />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium mb-1" style={{ color: '#e4e4e7' }}>Select a folder</p>
        <p className="text-xs" style={{ color: '#52525b' }}>
          Your browser doesn't support the modern folder picker.<br />
          Use the classic file selector below.
        </p>
      </div>
      <label className="flex items-center gap-2 px-4 py-2.5 rounded-xl cursor-pointer text-sm font-medium transition-colors"
        style={{ background: '#6366f1', color: '#fff' }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#4f46e5'}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = '#6366f1'}>
        {loading ? <Loader2 size={15} className="animate-spin" /> : <FolderInput size={15} />}
        {loading ? 'Reading files…' : 'Choose Folder'}
        <input
          type="file"
          className="hidden"
          {...{ webkitdirectory: '', directory: '' } as any}
          multiple
          onChange={handleInput}
        />
      </label>
      {count > 0 && (
        <p className="text-xs" style={{ color: '#4ade80' }}>{count} files loaded</p>
      )}
    </div>
  )
}

// Main component
export default function FolderBrowser({ onFilesLoaded, onClose }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [picked, setPicked] = useState('')

  const openPicker = async () => {
    setError('')
    setLoading(true)
    try {
      const dirHandle: FileSystemDirectoryHandle = await (window as any).showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'documents',
      })

      setPicked(dirHandle.name)
      const entries = await readDirectory(dirHandle, '')

      // Attach dirHandle to root so IDE can use it for writes
      const result: FSFileEntry[] = [
        { name: dirHandle.name, path: '', is_dir: true, size: 0, dirHandle },
        ...entries,
      ]

      onFilesLoaded(result)
      onClose()
    } catch (e: any) {
      if (e.name === 'AbortError') {
        // User cancelled - not an error
      } else {
        setError(e.message || 'Failed to open folder')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.8)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="rounded-2xl shadow-2xl overflow-hidden"
        style={{ width: 420, background: '#111114', border: '1px solid #2a2a35' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5"
          style={{ borderBottom: '1px solid #1e1e24' }}>
          <div className="flex items-center gap-2">
            <FolderInput size={16} style={{ color: '#6366f1' }} />
            <span className="font-semibold text-sm" style={{ color: '#e4e4e7' }}>Open Folder</span>
          </div>
          <button onClick={onClose} style={{ color: '#52525b' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#e4e4e7'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#52525b'}>
            <X size={15} />
          </button>
        </div>

        <div className="p-6">
          {supportsFileSystemAPI ? (
            /* Modern browser - native folder picker */
            <div className="flex flex-col items-center gap-5">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)' }}>
                {loading
                  ? <Loader2 size={26} className="animate-spin" style={{ color: '#818cf8' }} />
                  : <FolderOpen size={26} style={{ color: '#818cf8' }} />}
              </div>

              <div className="text-center">
                <p className="text-sm font-medium mb-1.5" style={{ color: '#e4e4e7' }}>
                  Open a folder from your device
                </p>
                <p className="text-xs leading-relaxed" style={{ color: '#52525b' }}>
                  Files are read directly in your browser.<br />
                  Nothing is uploaded to any server.
                </p>
              </div>

              {picked && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg w-full"
                  style={{ background: '#0d1f14', border: '1px solid #166534' }}>
                  <Folder size={13} style={{ color: '#4ade80', flexShrink: 0 }} />
                  <span className="text-xs truncate" style={{ color: '#86efac' }}>{picked}</span>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 px-3 py-2 rounded-lg w-full"
                  style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <AlertTriangle size={13} style={{ color: '#f87171', flexShrink: 0, marginTop: 1 }} />
                  <p className="text-xs" style={{ color: '#fca5a5' }}>{error}</p>
                </div>
              )}

              <button onClick={openPicker} disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-colors"
                style={{ background: loading ? '#4338ca' : '#6366f1', color: '#fff', opacity: loading ? 0.7 : 1 }}
                onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLElement).style.background = '#4f46e5' }}
                onMouseLeave={e => { if (!loading) (e.currentTarget as HTMLElement).style.background = '#6366f1' }}>
                <FolderInput size={15} />
                {loading ? 'Reading folder…' : 'Choose Folder'}
              </button>

              <p className="text-xs text-center" style={{ color: '#3f3f46' }}>
                Your browser will ask for permission to read the folder.
              </p>
            </div>
          ) : (
            /* Fallback for older browsers */
            <FallbackPicker onFilesLoaded={onFilesLoaded} onClose={onClose} />
          )}
        </div>
      </div>
    </div>
  )
}
