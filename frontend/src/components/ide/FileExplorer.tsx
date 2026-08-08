import { useState, useCallback } from 'react'
import {
  FolderOpen, Folder, FileText, Plus, FolderPlus, RefreshCw, FolderInput,
  ChevronRight, ChevronDown,
} from 'lucide-react'
import type { FileEntry } from '../../api'
import ContextMenu from './ContextMenu'

// -- File icon color by extension ----------------------------------------------
function fileColor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['ts','tsx'].includes(ext)) return '#3b82f6'
  if (['js','jsx','mjs'].includes(ext)) return '#f59e0b'
  if (['py'].includes(ext)) return '#22c55e'
  if (['json','yaml','yml','toml'].includes(ext)) return '#f97316'
  if (['md','mdx'].includes(ext)) return '#a78bfa'
  if (['css','scss','sass'].includes(ext)) return '#06b6d4'
  if (['html','htm'].includes(ext)) return '#ef4444'
  if (['rs'].includes(ext)) return '#f87171'
  if (['go'].includes(ext)) return '#67e8f9'
  return '#71717a'
}

// -- Single tree node ----------------------------------------------------------
interface NodeProps {
  entry: FileEntry
  depth: number
  active: string
  modified: Set<string>
  onOpen: (e: FileEntry) => void
  onCtxMenu: (e: React.MouseEvent, entry: FileEntry) => void
}

function FileNode({ entry, depth, active, modified, onOpen, onCtxMenu }: NodeProps) {
  const [expanded, setExpanded] = useState(depth < 2)
  const isActive = active === entry.path
  const isMod = modified.has(entry.path)

  return (
    <div>
      <div
        onClick={() => entry.is_dir ? setExpanded(x => !x) : onOpen(entry)}
        onContextMenu={e => { e.preventDefault(); onCtxMenu(e, entry) }}
        className="flex items-center gap-1.5 py-[3px] pr-2 rounded cursor-pointer text-xs select-none transition-colors group"
        style={{
          paddingLeft: `${8 + depth * 14}px`,
          color: isActive ? '#e4e4e7' : '#a1a1aa',
          background: isActive ? 'rgba(99,102,241,0.15)' : 'transparent',
        }}
        onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = '#1e1e24' }}
        onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
      >
        {entry.is_dir ? (
          <>
            {expanded
              ? <ChevronDown size={12} style={{ color: '#52525b', flexShrink: 0 }} />
              : <ChevronRight size={12} style={{ color: '#52525b', flexShrink: 0 }} />}
            <Folder size={13} style={{ color: '#f59e0b', flexShrink: 0 }} />
          </>
        ) : (
          <>
            <span style={{ width: 12, flexShrink: 0 }} />
            <FileText size={13} style={{ color: fileColor(entry.name), flexShrink: 0 }} />
          </>
        )}
        <span className="flex-1 truncate min-w-0">{entry.name}</span>
        {isMod && <span style={{ color: '#f59e0b', fontSize: 8 }}>●</span>}
      </div>
      {entry.is_dir && expanded && entry.children?.map(c => (
        <FileNode key={c.path} entry={c} depth={depth + 1}
          active={active} modified={modified}
          onOpen={onOpen} onCtxMenu={onCtxMenu} />
      ))}
    </div>
  )
}

// -- Explorer panel ------------------------------------------------------------
interface Props {
  tree: FileEntry[]
  workspace: string
  activeFile: string
  modifiedFiles: Set<string>
  onOpenFile: (e: FileEntry) => void
  onNewFile: (dir: string) => void
  onNewFolder: (dir: string) => void
  onRename: (e: FileEntry) => void
  onDelete: (e: FileEntry) => void
  onCopyPath: (e: FileEntry, relative: boolean) => void
  onOpenFolder: () => void
  onRefresh: () => void
}

export default function FileExplorer({
  tree, workspace, activeFile, modifiedFiles,
  onOpenFile, onNewFile, onNewFolder, onRename, onDelete, onCopyPath,
  onOpenFolder, onRefresh,
}: Props) {
  const [ctx, setCtx] = useState<{ x: number; y: number; entry: FileEntry } | null>(null)

  const handleCtx = useCallback((e: React.MouseEvent, entry: FileEntry) => {
    e.preventDefault()
    setCtx({ x: e.clientX, y: e.clientY, entry })
  }, [])

  const wsName = workspace ? workspace.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? workspace : 'No folder'

  return (
    <div className="flex flex-col h-full" style={{ color: '#d4d4d8' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 shrink-0"
        style={{ borderBottom: '1px solid #1e1e24' }}>
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#71717a' }}>
          Explorer
        </span>
        <div className="flex gap-0.5">
          <button title="Open folder from device" onClick={onOpenFolder}
            className="p-1 rounded transition-colors" style={{ color: '#52525b' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#f59e0b'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#52525b'}>
            <FolderInput size={14} />
          </button>
          <button title="New File" onClick={() => onNewFile('')}
            className="p-1 rounded transition-colors" style={{ color: '#52525b' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#e4e4e7'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#52525b'}>
            <Plus size={14} />
          </button>
          <button title="New Folder" onClick={() => onNewFolder('')}
            className="p-1 rounded transition-colors" style={{ color: '#52525b' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#e4e4e7'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#52525b'}>
            <FolderPlus size={14} />
          </button>
          <button title="Refresh" onClick={onRefresh}
            className="p-1 rounded transition-colors" style={{ color: '#52525b' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#e4e4e7'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#52525b'}>
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      {/* Workspace label */}
      <div className="px-3 py-1.5 shrink-0" style={{ borderBottom: '1px solid #1e1e24' }}>
        <div className="flex items-center gap-1.5 text-xs" style={{ color: '#71717a' }}>
          <FolderOpen size={12} style={{ color: '#f59e0b', flexShrink: 0 }} />
          <span className="truncate font-medium uppercase tracking-wide text-[11px]">{wsName}</span>
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-1">
        {tree.length === 0 ? (
          <div className="px-4 py-8 text-center" style={{ color: '#52525b' }}>
            <FolderOpen size={28} className="mx-auto mb-3 opacity-30" />
            <p className="text-xs">No folder open</p>
            <button onClick={onOpenFolder}
              className="mt-2 text-xs" style={{ color: '#6366f1' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#818cf8'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#6366f1'}>
              Open a folder
            </button>
          </div>
        ) : tree.map(e => (
          <FileNode key={e.path} entry={e} depth={0}
            active={activeFile} modified={modifiedFiles}
            onOpen={onOpenFile} onCtxMenu={handleCtx} />
        ))}
      </div>

      {/* Context menu */}
      {ctx && (
        <ContextMenu x={ctx.x} y={ctx.y} onClose={() => setCtx(null)} items={[
          { label: 'New File', icon: Plus, onClick: () => onNewFile(ctx.entry.is_dir ? ctx.entry.path : ctx.entry.path.split('/').slice(0,-1).join('/')) },
          { label: 'New Folder', icon: FolderPlus, onClick: () => onNewFolder(ctx.entry.is_dir ? ctx.entry.path : ctx.entry.path.split('/').slice(0,-1).join('/')) },
          { separator: true, label: '', onClick: ()=>{} },
          { label: 'Rename', icon: undefined, onClick: () => onRename(ctx.entry) },
          { label: 'Copy Relative Path', icon: undefined, onClick: () => onCopyPath(ctx.entry, true) },
          { label: 'Copy Absolute Path', icon: undefined, onClick: () => onCopyPath(ctx.entry, false) },
          { separator: true, label: '', onClick: ()=>{} },
          { label: 'Delete', icon: undefined, danger: true, onClick: () => onDelete(ctx.entry) },
        ]} />
      )}
    </div>
  )
}
