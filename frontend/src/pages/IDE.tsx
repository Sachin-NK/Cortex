import { useState, useCallback, useRef, useEffect } from 'react'
import Editor, { OnMount } from '@monaco-editor/react'
import { Code2, Save, Bot, Terminal as TermIcon, X } from 'lucide-react'
import { api } from '../api'
import type { FileEntry } from '../api'

import ActivityBar from '../components/ide/ActivityBar'
import FileExplorer from '../components/ide/FileExplorer'
import SearchPanel from '../components/ide/SearchPanel'
import GitPanel from '../components/ide/GitPanel'
import AgentsPanel from '../components/ide/AgentsPanel'
import ProblemsPanel from '../components/ide/ProblemsPanel'
import type { Problem } from '../components/ide/ProblemsPanel'
import type { TabItem } from '../components/ide/EditorTabs'
import Breadcrumb from '../components/ide/Breadcrumb'
import StatusBar from '../components/ide/StatusBar'
import QuickActions from '../components/ide/QuickActions'
import CommandPalette from '../components/ide/CommandPalette'
import TerminalTabs from '../components/ide/TerminalTabs'
import FolderBrowser from '../components/ide/FolderBrowser'
import AIPanel from '../components/AIPanel'

// -- Language detection --------------------------------------------------------
function detectLang(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  const m: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', rs: 'rust', go: 'go', java: 'java', cpp: 'cpp', c: 'c',
    cs: 'csharp', rb: 'ruby', php: 'php', swift: 'swift', kt: 'kotlin',
    sh: 'shell', bash: 'shell', ps1: 'powershell', zsh: 'shell',
    json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml',
    md: 'markdown', html: 'html', css: 'css', scss: 'scss',
    sql: 'sql', txt: 'plaintext', xml: 'xml',
  }
  if (filename.toLowerCase() === 'dockerfile') return 'dockerfile'
  return m[ext] ?? 'plaintext'
}

// Language accent colors for tab indicator
const LANG_COLORS: Record<string, string> = {
  typescript: '#3b82f6', javascript: '#f59e0b', python: '#22c55e',
  json: '#f97316', markdown: '#a78bfa', css: '#06b6d4', html: '#ef4444',
  rust: '#f87171', go: '#67e8f9', shell: '#4ade80', sql: '#fb923c',
  dockerfile: '#38bdf8', plaintext: '#71717a',
}

interface Tab { path: string; name: string; content: string; modified: boolean; language: string }
type Panel = 'files' | 'search' | 'git' | 'agents' | 'problems' | ''
type PaletteMode = 'files' | 'commands' | null

export default function IDE() {
  const [panel, setPanel]         = useState<Panel>('files')
  const [tree, setTree]           = useState<FileEntry[]>([])
  const [workspace, setWorkspace] = useState('')
  const [tabs, setTabs]           = useState<Tab[]>([])
  const [activeTab, setActiveTab] = useState('')
  const [saving, setSaving]       = useState(false)
  const [aiOpen, setAiOpen]       = useState(true)
  const [termOpen, setTermOpen]   = useState(false)
  const [termH, setTermH]         = useState(240)
  const [problems, setProblems]   = useState<Problem[]>([])
  const [aiAction, setAiAction]   = useState<{ code: string; lang: string; action: string } | null>(null)
  const [aiLoading]               = useState<string | null>(null)
  const [lastProvider, setLastProvider] = useState<string | undefined>()
  const [palette, setPalette]     = useState<PaletteMode>(null)
  const [recentFiles, setRecentFiles] = useState<string[]>([])
  const [folderBrowser, setFolderBrowser] = useState(false)
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 })
  const [renameState, setRenameState] = useState<{ entry: FileEntry; name: string } | null>(null)
  const editorRef = useRef<any>(null)
  const modifiedSet = new Set(tabs.filter(t => t.modified).map(t => t.path))

  // -- Load workspace ---------------------------------------------------------
  const loadTree = useCallback(async () => {
    try {
      const [entries, ws] = await Promise.all([api.listFiles(), api.workspace()])
      setTree(entries)
      setWorkspace(ws.workspace)
    } catch {}
  }, [])

  useEffect(() => { loadTree() }, [loadTree])

  // -- Keyboard shortcuts -----------------------------------------------------
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key === 's')             { e.preventDefault(); saveActive() }
      if (mod && !e.shiftKey && e.key === 'p') { e.preventDefault(); setPalette('files') }
      if (mod && e.shiftKey && e.key === 'P')  { e.preventDefault(); setPalette('commands') }
      if (mod && e.key === '`')             { e.preventDefault(); setTermOpen(o => !o) }
      if (mod && e.key === 'b')             { e.preventDefault(); setPanel(p => p ? '' : 'files') }
      if (e.key === 'Escape')               { setPalette(null); setRenameState(null) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  // -- File operations --------------------------------------------------------
  const openFile = useCallback(async (entry: FileEntry, line?: number) => {
    if (tabs.find(t => t.path === entry.path)) {
      setActiveTab(entry.path)
      if (line && editorRef.current) setTimeout(() => editorRef.current.revealLineInCenter(line), 80)
      return
    }
    try {
      const { content } = await api.readFile(entry.path)
      setTabs(ts => [...ts, { path: entry.path, name: entry.name, content, modified: false, language: detectLang(entry.name) }])
      setActiveTab(entry.path)
      setRecentFiles(r => [entry.path, ...r.filter(x => x !== entry.path)].slice(0, 20))
    } catch (e: any) { alert(`Cannot open: ${e.message}`) }
  }, [tabs])

  const closeTab = (path: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const idx = tabs.findIndex(t => t.path === path)
    const next = tabs.filter(t => t.path !== path)
    setTabs(next)
    if (activeTab === path) setActiveTab(next[Math.max(0, idx - 1)]?.path ?? '')
  }

  const saveActive = useCallback(async () => {
    const tab = tabs.find(t => t.path === activeTab)
    if (!tab) return
    setSaving(true)
    try {
      await api.writeFile(tab.path, tab.content)
      setTabs(ts => ts.map(t => t.path === activeTab ? { ...t, modified: false } : t))
      if (tab.language === 'python') lintFile(tab.path, tab.content)
    } finally { setSaving(false) }
  }, [tabs, activeTab])

  const lintFile = async (path: string, code: string) => {
    try {
      const res = await api.invokeTool('code_lint', { code, language: 'python' })
      if (res.success && (res.output as any)?.issues) {
        setProblems((res.output as any).issues.map((i: any) => ({
          file: path, line: i.line ?? 1, message: i.message,
          severity: i.severity === 'error' ? 'error' : 'warning' as const,
        })))
      }
    } catch {}
  }

  const onChange = (value: string | undefined) => {
    if (value === undefined) return
    setTabs(ts => ts.map(t => t.path === activeTab ? { ...t, content: value, modified: true } : t))
  }

  const deleteEntry = async (entry: FileEntry) => {
    if (!confirm(`Delete "${entry.name}"?`)) return
    try { await api.deleteFile(entry.path); loadTree() } catch (e: any) { alert(e.message) }
  }

  const doRename = async () => {
    if (!renameState?.name.trim()) return
    try { await api.renameFile(renameState.entry.path, renameState.name.trim()); setRenameState(null); loadTree() }
    catch (e: any) { alert(e.message) }
  }

  const newFile = async (dir: string) => {
    const name = prompt('File name:')
    if (!name) return
    const path = dir ? `${dir}/${name}` : name
    try { await api.createFile(path); loadTree(); openFile({ name, path, is_dir: false, size: 0 }) }
    catch (e: any) { alert(e.message) }
  }

  const newFolder = async (dir: string) => {
    const name = prompt('Folder name:')
    if (!name) return
    const path = dir ? `${dir}/${name}` : name
    try { await api.createFile(`${path}/.keep`); loadTree() } catch (e: any) { alert(e.message) }
  }

  const copyPath = (entry: FileEntry, relative: boolean) => {
    const p = relative ? entry.path : `${workspace}/${entry.path}`.replace(/\/+/g, '/')
    navigator.clipboard.writeText(p)
  }

  const handleOpenFolder = async (path: string) => {
    try { await api.setWorkspace(path); setTabs([]); setActiveTab(''); loadTree() }
    catch (e: any) { alert(e.message) }
  }

  const handleQuickAction = async (action: string) => {
    if (!activeTabData) return
    let selectedCode = ''
    if (editorRef.current) {
      const sel = editorRef.current.getSelection()
      if (sel && !sel.isEmpty()) selectedCode = editorRef.current.getModel().getValueInRange(sel)
    }
    setAiAction({ code: selectedCode, lang: activeTabData.language, action })
    setAiOpen(true)
  }

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor
    editor.onDidChangeCursorPosition(e => setCursorPos({ line: e.position.lineNumber, col: e.position.column }))
  }

  const activeTabData = tabs.find(t => t.path === activeTab)
  const wordCount = activeTabData ? activeTabData.content.trim().split(/\s+/).filter(Boolean).length : 0

  const paletteActions = [
    { id: 'save',        label: 'Save File',        description: 'Ctrl+S',    onRun: saveActive },
    { id: 'open-folder', label: 'Open Folder',       description: 'Open device folder', onRun: () => setFolderBrowser(true) },
    { id: 'new-file',    label: 'New File',          description: 'Create file', onRun: () => newFile('') },
    { id: 'terminal',    label: 'Toggle Terminal',   description: 'Ctrl+`',    onRun: () => setTermOpen(o => !o) },
    { id: 'ai',          label: 'Toggle AI Panel',   description: 'Show/hide AI', onRun: () => setAiOpen(o => !o) },
    { id: 'explain',     label: 'Explain Code',      description: 'AI explain', onRun: () => handleQuickAction('explain') },
    { id: 'refactor',    label: 'Refactor Code',     description: 'AI refactor', onRun: () => handleQuickAction('refactor') },
    { id: 'test',        label: 'Write Tests',       description: 'AI write tests', onRun: () => handleQuickAction('test') },
  ]

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#0d0d0f', color: '#e4e4e7' }}>

      {/* -- Activity Bar -------------- */}
      <ActivityBar active={panel} onChange={p => setPanel(p as Panel)} problemCount={problems.length} />

      {/* -- Sidebar ------------------- */}
      {panel && (
        <div className="shrink-0 flex flex-col overflow-hidden"
          style={{ width: 240, background: '#111114', borderRight: '1px solid #1e1e24' }}>
          {panel === 'files'    && <FileExplorer tree={tree} workspace={workspace} activeFile={activeTab}
            modifiedFiles={modifiedSet} onOpenFile={openFile} onNewFile={newFile} onNewFolder={newFolder}
            onRename={e => setRenameState({ entry: e, name: e.name })} onDelete={deleteEntry}
            onCopyPath={copyPath} onOpenFolder={() => setFolderBrowser(true)} onRefresh={loadTree} />}
          {panel === 'search'   && <SearchPanel onOpenFile={openFile} />}
          {panel === 'git'      && <GitPanel />}
          {panel === 'agents'   && <AgentsPanel />}
          {panel === 'problems' && <ProblemsPanel problems={problems} onJumpTo={(file, line) =>
            openFile({ name: file.split('/').pop()!, path: file, is_dir: false, size: 0 }, line)} />}
        </div>
      )}

      {/* -- Editor column ------------ */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* -- Top bar: tabs + controls --- */}
        <div className="flex items-stretch shrink-0"
          style={{ background: '#0d0d0f', borderBottom: '1px solid #1e1e24', minHeight: 38 }}>

          {/* Scrollable tab list */}
          <div className="flex items-end overflow-x-auto flex-1 min-w-0">
            {tabs.map(tab => {
              const isActive = tab.path === activeTab
              const lc = LANG_COLORS[tab.language] ?? '#71717a'
              return (
                <div key={tab.path} onClick={() => setActiveTab(tab.path)}
                  className="flex items-center gap-2 px-3 cursor-pointer select-none shrink-0 whitespace-nowrap group transition-colors"
                  style={{
                    height: 38, minWidth: 100, maxWidth: 180,
                    background: isActive ? '#1a1a1f' : 'transparent',
                    borderRight: '1px solid #1e1e24',
                    borderTop: isActive ? `2px solid ${lc}` : '2px solid transparent',
                    color: isActive ? '#e4e4e7' : '#71717a',
                  }}
                  onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.color = '#a1a1aa' }}
                  onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.color = '#71717a' }}>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: lc, opacity: 0.8 }} />
                  <span className="text-xs flex-1 truncate">
                    {tab.name}{tab.modified ? ' ●' : ''}
                  </span>
                  <button
                    onClick={e => closeTab(tab.path, e)}
                    className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity rounded"
                    style={{ color: '#71717a' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#e4e4e7'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#71717a'}>
                    <X size={12} />
                  </button>
                </div>
              )
            })}
          </div>

          {/* Right controls — always visible */}
          <div className="flex items-center gap-1 px-2 shrink-0" style={{ borderLeft: '1px solid #1e1e24' }}>
            {/* Terminal toggle */}
            <button onClick={() => setTermOpen(o => !o)} title="Toggle Terminal  Ctrl+`"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-all"
              style={{
                background: termOpen ? 'rgba(99,102,241,0.15)' : 'transparent',
                color: termOpen ? '#818cf8' : '#71717a',
                border: `1px solid ${termOpen ? 'rgba(99,102,241,0.4)' : 'transparent'}`,
              }}
              onMouseEnter={e => { if (!termOpen) { (e.currentTarget as HTMLElement).style.color = '#a1a1aa'; (e.currentTarget as HTMLElement).style.border = '1px solid #2a2a35' }}}
              onMouseLeave={e => { if (!termOpen) { (e.currentTarget as HTMLElement).style.color = '#71717a'; (e.currentTarget as HTMLElement).style.border = '1px solid transparent' }}}>
              <TermIcon size={13} />
              <span>Terminal</span>
            </button>

            {/* AI toggle */}
            <button onClick={() => setAiOpen(o => !o)} title="Toggle AI Panel"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-all"
              style={{
                background: aiOpen ? 'rgba(99,102,241,0.15)' : 'transparent',
                color: aiOpen ? '#818cf8' : '#71717a',
                border: `1px solid ${aiOpen ? 'rgba(99,102,241,0.4)' : 'transparent'}`,
              }}
              onMouseEnter={e => { if (!aiOpen) { (e.currentTarget as HTMLElement).style.color = '#a1a1aa'; (e.currentTarget as HTMLElement).style.border = '1px solid #2a2a35' }}}
              onMouseLeave={e => { if (!aiOpen) { (e.currentTarget as HTMLElement).style.color = '#71717a'; (e.currentTarget as HTMLElement).style.border = '1px solid transparent' }}}>
              <Bot size={13} />
              <span>AI</span>
            </button>

            {/* Save */}
            {activeTabData && (
              <button onClick={saveActive} disabled={saving} title="Save  Ctrl+S"
                className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ml-1"
                style={{ background: '#1a1a1f', color: '#a1a1aa', border: '1px solid #2a2a35', opacity: saving ? 0.5 : 1 }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = '#52525b'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = '#2a2a35'}>
                <Save size={12} />
                <span>{saving ? 'Saving…' : 'Save'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Breadcrumb */}
        {activeTabData && <Breadcrumb path={activeTabData.path} language={activeTabData.language} />}

        {/* Quick Actions */}
        {activeTabData && (
          <QuickActions onAction={handleQuickAction} loading={aiLoading} lastProvider={lastProvider} />
        )}

        {/* -- Editor + Terminal vertical split -- */}
        <div className="flex-1 flex flex-col min-h-0">

          {/* Monaco editor — fills all space when terminal closed */}
          <div className="min-h-0" style={{ flex: 1 }}>
            {activeTabData ? (
              <Editor
                height="100%"
                theme="vs-dark"
                language={activeTabData.language}
                value={activeTabData.content}
                onChange={onChange}
                onMount={handleEditorMount}
                options={{
                  fontSize: 13,
                  fontFamily: '"Cascadia Code","Fira Code",Consolas,monospace',
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  wordWrap: 'on',
                  padding: { top: 8, bottom: 8 },
                  smoothScrolling: true,
                  renderLineHighlight: 'gutter',
                  cursorBlinking: 'smooth',
                  bracketPairColorization: { enabled: true },
                  guides: { bracketPairs: true },
                  renderWhitespace: 'none',
                  suggestFontSize: 12,
                  tabSize: 2,
                }}
              />
            ) : (
              /* Empty state */
              <div className="flex flex-col items-center justify-center h-full gap-4"
                style={{ color: '#2a2a35' }}>
                <Code2 size={52} />
                <div className="text-center">
                  <p className="text-lg font-light" style={{ color: '#52525b' }}>No file open</p>
                  <p className="text-sm mt-1.5" style={{ color: '#3a3a45' }}>
                    Pick a file from the explorer, or{' '}
                    <button onClick={() => setFolderBrowser(true)} style={{ color: '#6366f1' }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#818cf8'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#6366f1'}>
                      open a folder
                    </button>
                  </p>
                  <div className="mt-6 grid grid-cols-1 gap-2 text-xs text-left mx-auto"
                    style={{ maxWidth: 240 }}>
                    {[
                      ['Ctrl+P', 'Quick open file'],
                      ['Ctrl+`', 'Toggle terminal'],
                      ['Ctrl+B', 'Toggle sidebar'],
                      ['Ctrl+Shift+P', 'Command palette'],
                    ].map(([key, desc]) => (
                      <div key={key} className="flex items-center justify-between gap-4">
                        <kbd className="px-2 py-0.5 rounded text-[11px]"
                          style={{ background: '#1e1e24', color: '#52525b', fontFamily: 'monospace' }}>
                          {key}
                        </kbd>
                        <span style={{ color: '#3a3a45' }}>{desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* -- Terminal panel — slides in from bottom -- */}
          {termOpen && (
            <TerminalTabs
              height={termH}
              onHeightChange={setTermH}
              onClose={() => setTermOpen(false)}
            />
          )}
        </div>

        {/* Status bar */}
        <StatusBar
          language={activeTabData?.language ?? ''}
          line={cursorPos.line}
          col={cursorPos.col}
          wordCount={wordCount}
          hasProblems={problems.length > 0}
          lastProvider={lastProvider}
          onAIToggle={() => setAiOpen(o => !o)}
        />
      </div>

      {/* -- AI Panel ------------------- */}
      {aiOpen && (
        <AIPanel
          currentFile={activeTabData?.path}
          currentLanguage={activeTabData?.language}
          initialAction={aiAction}
          onClose={() => setAiOpen(false)}
          onInsert={text => {
            if (!editorRef.current) return
            const sel = editorRef.current.getSelection()
            editorRef.current.executeEdits('ai', [{ range: sel, text }])
          }}
        />
      )}

      {/* -- Overlays ------------------- */}
      {palette && (
        <CommandPalette
          mode={palette}
          recentFiles={recentFiles}
          workspaceFiles={tree}
          onOpen={(path, name) => openFile({ name, path, is_dir: false, size: 0 })}
          onClose={() => setPalette(null)}
          actions={paletteActions}
        />
      )}

      {folderBrowser && (
        <FolderBrowser onSelect={handleOpenFolder} onClose={() => setFolderBrowser(false)} />
      )}

      {/* Rename modal */}
      {renameState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.75)' }}>
          <div className="rounded-xl shadow-2xl p-5 w-80"
            style={{ background: '#111114', border: '1px solid #2a2a35' }}>
            <p className="text-sm font-medium mb-3" style={{ color: '#e4e4e7' }}>
              Rename "{renameState.entry.name}"
            </p>
            <input
              autoFocus
              value={renameState.name}
              onChange={e => setRenameState(s => s ? { ...s, name: e.target.value } : s)}
              onKeyDown={e => { if (e.key === 'Enter') doRename(); if (e.key === 'Escape') setRenameState(null) }}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none mb-4"
              style={{ background: '#0d0d0f', border: '1px solid #2a2a35', color: '#e4e4e7' }}
              onFocus={e => (e.target as HTMLElement).style.borderColor = '#6366f1'}
              onBlur={e => (e.target as HTMLElement).style.borderColor = '#2a2a35'}
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setRenameState(null)}
                className="px-3 py-1.5 text-sm rounded-lg"
                style={{ background: '#1a1a1f', color: '#71717a', border: '1px solid #2a2a35' }}>
                Cancel
              </button>
              <button onClick={doRename}
                className="px-4 py-1.5 text-sm rounded-lg font-medium"
                style={{ background: '#6366f1', color: '#fff' }}>
                Rename
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
