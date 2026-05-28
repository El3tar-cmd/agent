import React, { useState, useEffect } from 'react';
import {
  File,
  Folder,
  Save,
  Eye,
  Edit3,
  X,
  FileCode,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  FolderArchive,
  Download
} from 'lucide-react';
import { WorkspaceFile } from '../types';

interface TreeNode {
  name: string;
  path: string;
  isFolder: boolean;
  children: { [key: string]: TreeNode };
  file?: WorkspaceFile;
}

interface FileInspectorProps {
  files: WorkspaceFile[];
  onRefreshWorkspace: () => void;
  selectedFile: WorkspaceFile | null;
  onSelectFile: (file: WorkspaceFile) => void;
}

// Recursive directory node renderer
function FileNodeView({
  node,
  selectedPath,
  onSelectFile
}: {
  key?: string;
  node: TreeNode;
  selectedPath?: string;
  onSelectFile: (file: WorkspaceFile) => void;
}) {
  const [isOpen, setIsOpen] = useState(true);

  if (!node.isFolder) {
    const isSelected = selectedPath === node.file?.path;
    return (
      <button
        onClick={() => node.file && onSelectFile(node.file)}
        className={`w-full flex items-center justify-between p-1.5 rounded-sm text-left font-mono text-[11px] transition-all cursor-pointer ${
          isSelected
            ? 'bg-white/5 border-l-2 border-[#b89b72] text-white font-medium pl-2'
            : 'bg-transparent border-transparent hover:bg-white/5 text-white/55 hover:text-white pl-2'
        }`}
      >
        <div className="flex items-center gap-2 truncate">
          <File className="w-3.5 h-3.5 text-[#b89b72]/60 shrink-0" />
          <span className="truncate">{node.name}</span>
        </div>
        {node.file && (
          <span className="text-[8px] opacity-50 uppercase tracking-widest bg-black border border-white/5 text-white/45 px-1 py-0.5 rounded-sm shrink-0">
            {node.file.ext.replace('.', '')}
          </span>
        )}
      </button>
    );
  }

  const sortedChildren = Object.values(node.children).sort((a, b) => {
    if (a.isFolder && !b.isFolder) return -1;
    if (!a.isFolder && b.isFolder) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="space-y-0.5">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-1.5 p-1 px-1.5 rounded-sm text-left text-[11px] font-sans font-medium text-white/75 hover:bg-white/5 transition-all cursor-pointer select-none"
      >
        {isOpen ? (
          <ChevronDown className="w-3.5 h-3.5 text-[#b89b72]/85 shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-[#b89b72]/50 shrink-0" />
        )}
        <Folder className="w-3.5 h-3.5 text-amber-500/85 fill-amber-500/10 shrink-0" />
        <span className="truncate">{node.name}</span>
      </button>

      {isOpen && (
        <div className="pl-3 border-l border-white/5 ml-2.5 space-y-0.5">
          {sortedChildren.map((child) => (
            <FileNodeView
              key={child.path}
              node={child}
              selectedPath={selectedPath}
              onSelectFile={onSelectFile}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function FileInspector({
  files,
  onRefreshWorkspace,
  selectedFile,
  onSelectFile,
}: FileInspectorProps) {
  const [content, setContent] = useState<string>('');
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [loadingFile, setLoadingFile] = useState<boolean>(false);
  const [exportingZip, setExportingZip] = useState<boolean>(false);

  const handleExportZip = async () => {
    try {
      setExportingZip(true);
      const link = document.createElement('a');
      link.href = '/api/agent/export-zip';
      link.setAttribute('download', '');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => setExportingZip(false), 2000);
    } catch (e) {
      console.error('Export zip failed:', e);
      setExportingZip(false);
    }
  };

  // Helper to compile hierarchical tree
  const buildTree = (workspaceFiles: WorkspaceFile[]): TreeNode => {
    const root: TreeNode = {
      name: 'root',
      path: '/',
      isFolder: true,
      children: {},
    };

    workspaceFiles.forEach((file) => {
      const cleanedPath = file.path.startsWith('/') ? file.path.slice(1) : file.path;
      const parts = cleanedPath.split('/').filter(Boolean);

      let current = root;
      let accumulatedPath = '';

      parts.forEach((part, index) => {
        accumulatedPath = `${accumulatedPath}/${part}`;
        const isLast = index === parts.length - 1;

        if (!current.children[part]) {
          current.children[part] = {
            name: part,
            path: accumulatedPath,
            isFolder: !isLast,
            children: {},
            file: isLast ? file : undefined,
          };
        }
        current = current.children[part];
      });
    });

    return root;
  };

  const fileTreeRoot = buildTree(files);
  const sortedRootKeys = Object.values(fileTreeRoot.children).sort((a, b) => {
    if (a.isFolder && !b.isFolder) return -1;
    if (!a.isFolder && b.isFolder) return 1;
    return a.name.localeCompare(b.name);
  });

  // Load selected file content dynamically from Node server API
  useEffect(() => {
    if (!selectedFile) return;
    setLoadingFile(true);
    setSaveStatus('idle');

    fetch(`/api/file?path=${encodeURIComponent(selectedFile.path)}`)
      .then((res) => {
        if (!res.ok) throw new Error('File read blocked');
        return res.json();
      })
      .then((data) => {
        setContent(data.content || '');
        setLoadingFile(false);
      })
      .catch((err) => {
        setContent(`// ERROR: Failed to retrieve file contents.\n// ${err.message}`);
        setLoadingFile(false);
      });
  }, [selectedFile]);

  const handleSaveFile = async () => {
    if (!selectedFile) return;
    setSaveStatus('saving');

    try {
      const response = await fetch('/api/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: selectedFile.path,
          content,
        }),
      });

      if (!response.ok) throw new Error('Unable to preserve edits server-side');

      setSaveStatus('saved');
      onRefreshWorkspace();
      setTimeout(() => setSaveStatus('idle'), 2500);
    } catch (err) {
      setSaveStatus('error');
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] border border-white/5 rounded-sm overflow-hidden shadow-2xl">
      
      {/* HUD Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#0a0a0a] border-b border-white/10">
        <div className="flex items-center gap-2">
          <FileCode className="w-4 h-4 text-[#b89b72]" />
          <span className="text-xs font-serif italic text-white tracking-widest">
            Active Workspace Inspector
          </span>
        </div>
        
        {selectedFile && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsEditing(!isEditing)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-[10px] font-serif italic transition-all cursor-pointer ${
                isEditing
                  ? 'bg-[#b89b72]/10 text-[#b89b72] border border-[#b89b72]/30'
                  : 'bg-white/5 text-white/80 border border-white/10 hover:border-[#b89b72]'
              }`}
            >
              {isEditing ? (
                <>
                  <Eye className="w-3 h-3" /> View Mode
                </>
              ) : (
                <>
                  <Edit3 className="w-3 h-3" /> Edit Mode
                </>
              )}
            </button>

            {isEditing && (
              <button
                onClick={handleSaveFile}
                disabled={saveStatus === 'saving'}
                className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-sans font-bold uppercase rounded-sm bg-[#b89b72] hover:bg-[#b89b72]/90 text-black shadow transition-all active:scale-95 cursor-pointer"
              >
                <Save className="w-3 h-3" /> Save Edits
              </button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 flex-1 divide-y md:divide-y-0 md:divide-x divide-white/5 min-h-[300px]">
        
        {/* Workspace Files List */}
        <div className="md:col-span-4 p-3 bg-[#080808] overflow-y-auto max-h-[220px] md:max-h-[410px] border-b md:border-b-0 border-white/5">
          <div className="flex items-center justify-between mb-3 px-1">
            <span className="text-[10px] font-mono tracking-widest font-semibold uppercase text-[#b89b72]">
              Files Tree ({files.length})
            </span>
            <button
              onClick={handleExportZip}
              disabled={exportingZip}
              className={`flex items-center gap-1 px-2 py-0.5 text-[9px] font-mono font-bold uppercase rounded-sm border transition-all cursor-pointer select-none active:scale-95 ${
                exportingZip
                  ? 'bg-amber-500/15 border-amber-500/30 text-amber-400 animate-pulse'
                  : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:border-emerald-500/50'
              }`}
              title="تصدير المشروع بالكامل كملف ZIP مضغوط"
            >
              {exportingZip ? (
                <>
                  <span className="animate-spin text-amber-500">↻</span> Packaging
                </>
              ) : (
                <>
                  <FolderArchive className="w-3 h-3 text-emerald-400" /> export .zip
                </>
              )}
            </button>
          </div>

          <div className="space-y-1.5">
            {sortedRootKeys.map((node) => (
              <FileNodeView
                key={node.path}
                node={node}
                selectedPath={selectedFile?.path || undefined}
                onSelectFile={(f) => {
                  onSelectFile(f);
                  setIsEditing(false);
                }}
              />
            ))}
          </div>
        </div>

        {/* Source viewer pane */}
        <div className="md:col-span-8 flex flex-col bg-[#050505] font-mono text-xs relative">
          
          {loadingFile && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#050505]/80 text-white/40">
              <span className="animate-spin text-[#b89b72] mb-1">↻</span>
              Reading file content...
            </div>
          )}

          {selectedFile ? (
            <div className="flex flex-col h-full">
              {/* File details sub banner */}
              <div className="px-4 py-2 bg-[#0a0a0a] border-b border-white/5 flex items-center justify-between text-[11px] text-white/40 font-mono">
                <span className="text-white/45 truncate max-w-[200px]" title={selectedFile.path}>
                  File: <span className="text-[#b89b72]">{selectedFile.name}</span>
                </span>

                {saveStatus === 'saving' && (
                  <span className="text-[#b89b72] flex items-center gap-1 text-[10px] uppercase font-bold animate-pulse">
                    Saving edits to server...
                  </span>
                )}
                {saveStatus === 'saved' && (
                  <span className="text-[#4ade80] flex items-center gap-1 text-[10px] uppercase font-bold">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Saved Successfully!
                  </span>
                )}
                {saveStatus === 'error' && (
                  <span className="text-rose-400 flex items-center gap-1 text-[10px] uppercase font-bold">
                    <AlertCircle className="w-3.5 h-3.5" /> Save Failure
                  </span>
                )}
              </div>

              {/* Viewer or Editor Area */}
              <div className="flex-1 p-3 overflow-y-auto max-h-[300px] md:max-h-[380px] bg-[#050505] font-mono select-text font-medium leading-relaxed">
                {isEditing ? (
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    className="w-full h-full bg-[#050505] text-white/80 placeholder-white/20 font-mono text-xs border-0 outline-none resize-none min-h-[220px] md:min-h-[320px] focus:ring-1 focus:ring-white/5 selection:bg-white/10"
                    placeholder="// Write custom typescript code here..."
                  />
                ) : (
                  <div className="flex font-mono text-xs leading-5">
                    {/* Line numbers column */}
                    <div className="text-right text-white/20 select-none pr-3 border-r border-white/5 shrink-0 text-[10px] pt-0.5">
                      {content.split('\n').map((_, idx) => (
                        <div key={idx}>{idx + 1}</div>
                      ))}
                    </div>
                    {/* Raw content text column */}
                    <pre className="pl-4 select-all text-white/75 overflow-x-auto selection:bg-white/10">
                      {content || '// No content inside this file.'}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-white/40">
              <div className="text-lg mb-1.5">📄</div>
              <div className="font-serif italic text-white/30 max-w-sm">Select a workspace file catalog on the left or the interactive Mind Map nodes to begin inspection.</div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
