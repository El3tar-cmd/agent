import React, { useState, useEffect } from 'react';
import {
  WorkspaceNode,
  WorkspaceFile,
  WorkspaceStats,
  WorkspaceIndex,
  SlashCommand,
  AgentEvent,
} from './types';
import MindMap from './components/MindMap';
import TerminalPane from './components/TerminalPane';
import AssistantChat from './components/AssistantChat';
import FileInspector from './components/FileInspector';
import MultiAgentPlan from './components/MultiAgentPlan';
import InteractiveStudio from './components/InteractiveStudio';
import {
  Cpu,
  Layers,
  Database,
  BarChart3,
  Terminal as ConsoleIcon,
  BookOpen,
  Info,
  Compass,
  Sparkles,
  GitFork,
} from 'lucide-react';

type AgentKey = 'structure' | 'database' | 'backend' | 'frontend' | 'qa' | 'documentation';

export default function App() {
  const [tree, setTree] = useState<WorkspaceNode | null>(null);
  const [flattenedFiles, setFlattenedFiles] = useState<WorkspaceFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<WorkspaceFile | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [stats, setStats] = useState<WorkspaceStats | null>(null);
  const [workspaceIndex, setWorkspaceIndex] = useState<WorkspaceIndex | null>(null);
  const [rootPath, setRootPath] = useState<string>('');
  const [leftPanelMode, setLeftPanelMode] = useState<'mindmap' | 'multiagent' | 'studio'>('multiagent');
  const [autoTriggerQuery, setAutoTriggerQuery] = useState<string>('');
  const [autoAgentFocus, setAutoAgentFocus] = useState<AgentKey[]>([]);
  const [autoAgentReason, setAutoAgentReason] = useState<string>('');
  const [autoStudioQuery, setAutoStudioQuery] = useState<string>('');

  // Assistant chatbot states
  const [messages, setMessages] = useState<Array<{
    role: 'user' | 'assistant';
    text: string;
    modelUsed?: string;
    trace?: Array<{ tool: string; description: string }>;
  }>>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const normalizeTrace = (trace: unknown): Array<{ tool: string; description: string }> => {
    if (!Array.isArray(trace)) return [];
    return trace.filter(
      (entry): entry is { tool: string; description: string } =>
        Boolean(
          entry &&
            typeof entry === 'object' &&
            'tool' in entry &&
            'description' in entry &&
            typeof (entry as any).tool === 'string' &&
            typeof (entry as any).description === 'string'
        )
    );
  };

  const deriveAgentFocus = (prompt: string): { agents: AgentKey[]; reason: string } => {
    const text = prompt.toLowerCase();
    const selected = new Set<AgentKey>(['structure']);
    const add = (key: AgentKey) => selected.add(key);

    if (/(database|schema|sql|prisma|migration|migrate|table|tables|collection|collections|postgres|mysql|sqlite|data model|db|قاعدة بيانات|جداول|مخطط البيانات|بيانات)/i.test(text)) {
      add('database');
    }
    if (/(backend|api|server|route|routes|endpoint|express|auth|login|signup|webhook|controller|middleware|service|سيرفر|خادم|مسار|مسارات|نقطة نهاية|مصادقة|تسجيل دخول)/i.test(text)) {
      add('backend');
    }
    if (/(frontend|ui|ux|react|component|page|pages|dashboard|tailwind|css|responsive|layout|screen|screens|view|views|واجهة|واجهات|صفحة|صفحات|تصميم|تخطيط|شاشة|شاشات)/i.test(text)) {
      add('frontend');
    }
    if (/(test|qa|quality|bug|validation|verify|edge case|e2e|unit test|integration test|regression|اختبار|جودة|تحقق|تصحيح|أخطاء)/i.test(text)) {
      add('qa');
    }
    if (/(doc|docs|documentation|readme|guide|setup|deploy|install|api reference|توثيق|دليل|شرح|README|مستندات)/i.test(text)) {
      add('documentation');
    }
    if (/(architecture|arch|structure|folder|folders|file tree|project structure|scaffold|boilerplate|organize|هيكل|بنية|مجلدات|شجرة الملفات|تنظيم|معمارية)/i.test(text)) {
      add('structure');
    }

    const prioritized: AgentKey[] = ['structure', 'backend', 'frontend', 'database', 'qa', 'documentation'];
    const agents = prioritized.filter((key) => selected.has(key));

    const reasonMap: Record<AgentKey, string> = {
      structure: 'تنظيم الهيكل والمسارات',
      database: 'نمذجة البيانات',
      backend: 'الخادم والـ APIs',
      frontend: 'الواجهة والتجربة',
      qa: 'الاختبار والتحقق',
      documentation: 'التوثيق والتسليم',
    };

    return {
      agents: agents.length > 0 ? agents : ['structure', 'backend', 'frontend'],
      reason: agents.map((key) => reasonMap[key]).join('، ')
    };
  };

  // Load directory structures initially
  const fetchWorkspace = async (refresh = false) => {
    try {
      const response = await fetch(`/api/workspace${refresh ? '?refresh=1' : ''}`);
      const data = await response.json();
      if (data.success) {
        setTree(data.tree);
        setRootPath(data.rootPath);
        setWorkspaceIndex(data.workspaceIndex || null);

        // Compute statistics and flatten files
        const list: WorkspaceFile[] = [];

        const processNode = (node: WorkspaceNode) => {
          if (node.files) {
            node.files.forEach((file) => {
              list.push(file);
            });
          }
          if (node.children) {
            node.children.forEach(processNode);
          }
        };

        if (data.tree) {
          processNode(data.tree);
        }

        setFlattenedFiles(list);
        setStats(data.stats || data.workspaceIndex?.stats || null);

        // Set default selected file to README or package.json if available
        if (list.length > 0 && !selectedFile) {
          const defaultF = list.find((f) => f.name === 'package.json') || list[0];
          setSelectedFile(defaultF);
        }
      }
    } catch (e) {
      console.error('Workspace scan failed', e);
    }
  };

  useEffect(() => {
    fetchWorkspace();
  }, []);

  const handleExecutePrompt = async (promptText: string, customApiKey?: string, selectedModel?: string) => {
    const normalizedPrompt = promptText.trim();
    const isDrawCmd =
      /^(\/draw|draw|\/sketch|sketch|ارسم|صمم)\b/i.test(normalizedPrompt) ||
      /\b(draw|diagram|flowchart|sketch|render)\b/i.test(normalizedPrompt);

    if (isDrawCmd) {
      const cleanQuery = normalizedPrompt.replace(/^(\/draw|draw|\/sketch|sketch|ارسم|صمم)\s*/i, '').trim() || 'مخطط معماري بسيط';
      setLeftPanelMode('studio');
      setAutoStudioQuery(cleanQuery + '|||' + Date.now());

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: `## Studio Opened\n\n- I routed your drawing request to **Diagram Studio**.\n- A prompt-based visual sketch is being prepared from: \`${cleanQuery}\`.\n- Open the **Studio Canvas** panel to inspect and refine the diagram.`,
          modelUsed: 'Studio Router',
          trace: [
            { tool: 'detect_draw_command', description: 'Detected drawing/diagram intent in prompt.' },
            { tool: 'open_studio', description: 'Switched UI to the Studio Canvas for visual rendering.' },
            { tool: 'seed_canvas', description: 'Prepared a prompt-based diagram preset.' }
          ]
        }
      ]);
      return;
    }

    // Check if triggering autonomous agent planner mode
    const isAgentCmd = normalizedPrompt.startsWith('\\agent') || normalizedPrompt.startsWith('/agent');
    if (isAgentCmd) {
      const cleanQuery = normalizedPrompt.replace(/^(\\agent|\/agent)\s*/i, '').trim() || "موقع ويب احترافي متكامل";
      const focus = deriveAgentFocus(cleanQuery);
      
      // Add user message
      const withUserMsg = [...messages, { role: 'user' as const, text: promptText }];
      setMessages(withUserMsg);
      
      setLeftPanelMode('multiagent');
      setAutoTriggerQuery(cleanQuery + "|||" + Date.now());
      setAutoAgentFocus(focus.agents);
      setAutoAgentReason(focus.reason);
      
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: `## Agent Focused Orchestration\n\n- Received: \`${cleanQuery}\`\n- Selected agents: **${focus.agents.join(' → ')}**\n- Focus: ${focus.reason}\n\nThe workspace planner will now run only the relevant agents and keep handovers sequential.`,
          modelUsed: 'Orchestrating Platform Agent v5',
          trace: [
            { tool: 'detect_command', description: 'Parsed active \\agent/slash prompt trigger successfully.' },
            { tool: 'agent_focus', description: `Selected focused agents: ${focus.agents.join(', ')}` },
            { tool: 'orchestrate', description: 'Switching Layout panel state to Multiagent and beginning targeted file decomposition...' }
          ]
        }
      ]);
      return;
    }

    setIsLoading(true);
    // Add user message immediately
    const updatedMessages = [...messages, { role: 'user' as const, text: promptText }];
    setMessages(updatedMessages);

    try {
      const response = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptText,
          messages: updatedMessages.map(m => ({ role: m.role, text: m.text })),
          customApiKey,
          selectedModel,
        }),
      });
      const data = await response.json();
      if (data.success) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: data.text,
            modelUsed: data.modelUsed,
            trace: normalizeTrace(data.trace)
          }
        ]);
        if (data.workspaceChanged) {
          fetchWorkspace(true);
        }
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: `⚠️ ERROR: ${data.error || 'The Gemini server was unable to fulfill your task.'}`,
            trace: normalizeTrace(data.trace)
          },
        ]);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: `⚠️ ERROR: The connection to the Node agent endpoint failed. Reason: ${err.message}`,
          trace: []
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectSlashCommand = (sc: SlashCommand) => {
    if (sc.actionType === 'scan') {
      fetchWorkspace(true);
    } else if (sc.actionType === 'map') {
      // Just toggle zoom factors of mindmap
      setActiveFilter('all');
    }
  };

  const handleSelectNodeFromFileMap = (file: WorkspaceFile) => {
    setSelectedFile(file);
  };

  const handleInjectNodeToPrompt = (filePath: string) => {
    // Custom action if requested to bind files in prompt
  };

  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col font-sans select-none antialiased selection:bg-white/10">
      
      {/* 1. Global Navigation HUD Bar */}
      <header className="px-5 py-4 bg-[#0a0a0a] border-b border-white/5 sticky top-0 z-55 backdrop-blur-md flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 flex items-center justify-center rounded-sm bg-[#111111] border border-white/10 text-white font-mono shadow-md">
            🤖
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-serif italic text-white tracking-widest">
                AI Coding Agent UI
              </span>
              <span className="text-[9px] font-sans font-bold tracking-widest px-1.5 py-0.5 rounded-sm bg-[#b89b72]/10 text-[#b89b72] border border-[#b89b72]/20 uppercase">
                v5.5 STABLE
              </span>
            </div>
            <p className="text-[10px] text-white/30 font-mono tracking-wider mt-0.5 uppercase">
              Secure Fullstack Workbench Simulator
            </p>
          </div>
        </div>

        {/* Dashboard Live Stats Indicators */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-black rounded-sm border border-white/5 text-[11px] font-mono">
            <Layers className="w-3.5 h-3.5 text-[#b89b72]" />
            <span className="text-white/40">Files:</span>
            <span className="text-[#b89b72] font-semibold">{stats?.totalFiles || 0}</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-black rounded-sm border border-white/5 text-[11px] font-mono">
            <Database className="w-3.5 h-3.5 text-[#9a815c]" />
            <span className="text-white/40">Dirs:</span>
            <span className="text-[#9a815c] font-semibold">{stats?.totalDirs || 0}</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-black rounded-sm border border-white/5 text-[11px] font-mono">
            <Compass className="w-3.5 h-3.5 text-[#e0e0e0]" />
            <span className="text-white/40">Code Size:</span>
            <span className="text-[#b89b72] font-semibold">{formatSize(stats?.totalSize || 0)}</span>
          </div>
        </div>
      </header>

      {/* 2. Main Content Dashboard Container */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto p-5 grid grid-cols-1 xl:grid-cols-12 gap-5 min-h-0">
        
        {/* LEFT COLUMN: CODEBASE HEURISTICS, MIND MAP, & MULTI-AGENT PLANNERS (xl: col-span-5) */}
        <section className="xl:col-span-5 flex flex-col gap-4 min-h-[450px]">
          
          {/* A. Professional Layout Mode Selector Switcher */}
          <div className="grid grid-cols-3 p-1 bg-black border border-white/5 rounded-sm">
            <button
              onClick={() => setLeftPanelMode('multiagent')}
              className={`py-2 text-[10px] font-sans font-bold uppercase tracking-wider rounded-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer select-none ${
                leftPanelMode === 'multiagent'
                  ? 'bg-[#111111] border border-white/10 text-[#b89b72]'
                  : 'text-white/40 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Orchestrator
            </button>
            <button
              onClick={() => setLeftPanelMode('mindmap')}
              className={`py-2 text-[10px] font-sans font-bold uppercase tracking-wider rounded-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer select-none ${
                leftPanelMode === 'mindmap'
                  ? 'bg-[#111111] border border-white/10 text-[#b89b72]'
                  : 'text-white/40 hover:text-white'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              Mind Map
            </button>
            <button
              onClick={() => setLeftPanelMode('studio')}
              className={`py-2 text-[10px] font-sans font-bold uppercase tracking-wider rounded-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer select-none ${
                leftPanelMode === 'studio'
                  ? 'bg-[#111111] border border-white/10 text-amber-500'
                  : 'text-white/40 hover:text-white'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              Studio Canvas
            </button>
          </div>

          {leftPanelMode === 'multiagent' ? (
            <div className="flex-1 min-h-[500px]">
              <MultiAgentPlan autoTriggerQuery={autoTriggerQuery} focusAgents={autoAgentFocus} focusSummary={autoAgentReason} />
            </div>
          ) : leftPanelMode === 'studio' ? (
            <div className="flex-1 min-h-[500px]">
              <InteractiveStudio autoTriggerQuery={autoStudioQuery} />
            </div>
          ) : (
            <>
              {/* B. Animated Codebase Mind Map */}
              <div className="flex flex-col flex-1 bg-[#0a0a0a] border border-white/5 rounded-sm overflow-hidden shadow-xl min-h-[300px]">
                <div className="px-4 py-3 border-b border-white/10 bg-black/40 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Compass className="w-4 h-4 text-[#b89b72]" />
                    <span className="text-xs font-serif italic text-white tracking-widest">
                      Interactive Codebase Mind Map
                    </span>
                  </div>
                  <button
                    onClick={() => fetchWorkspace(true)}
                    className="text-[10px] font-sans font-bold uppercase bg-black hover:bg-white/5 border border-white/10 rounded-sm px-2.5 py-1 text-white/40 hover:text-white transition-all active:scale-95 cursor-pointer"
                  >
                    ↻ Rescan Folder
                  </button>
                </div>

                <div className="p-3 bg-black flex flex-wrap items-center gap-1.5 border-b border-white/5">
                  <span className="text-[10px] font-mono font-bold uppercase text-white/30 shrink-0">TagsFilter:</span>
                  {['all', 'entry', 'code', 'config', 'style', 'test'].map((f) => (
                    <button
                      key={f}
                      onClick={() => setActiveFilter(f)}
                      className={`px-2.5 py-0.5 rounded-sm font-mono text-[9px] uppercase font-bold border transition-all cursor-pointer ${
                        activeFilter === f
                          ? 'bg-[#b89b72] border-[#b89b72] text-black shadow'
                          : 'bg-[#111111]/80 border-white/5 hover:border-white/10 text-white/45 hover:text-white'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>

                <div className="flex-1 relative min-h-[220px]">
                  <MindMap
                    tree={tree}
                    onSelectNode={handleSelectNodeFromFileMap}
                    onInjectNode={handleInjectNodeToPrompt}
                    activeFilter={activeFilter}
                    workspaceIndex={workspaceIndex}
                  />
                </div>
              </div>

              {/* C. Codebase Role Statistics Bento Box */}
              <div className="p-4 bg-[#0a0a0a] border border-white/5 rounded-sm shadow-xl">
                <div className="flex items-center gap-2 mb-3">
                  <BarChart3 className="w-4 h-4 text-[#b89b72]" />
                  <span className="text-xs font-serif italic text-white tracking-widest">
                    Workspace Role Distribution Heuristics
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { label: 'Modules PKG', count: stats?.roles['pkg'] || 0, color: 'border-white/5 text-[#b89b72] bg-black/40' },
                    { label: 'Code Base', count: (stats?.roles['code'] || 0) + (stats?.roles['entry'] || 0), color: 'border-white/5 text-white bg-black/40 animate-pulse' },
                    { label: 'Workspace Conf', count: stats?.roles['config'] || 0, color: 'border-white/5 text-[#9a815c] bg-black/40' },
                    { label: 'Tests Logs', count: stats?.roles['test'] || 0, color: 'border-white/5 text-white/55 bg-black/40' },
                  ].map((stat) => (
                    <div
                      key={stat.label}
                      className={`p-3 rounded-sm border text-center flex flex-col items-center justify-center ${stat.color} hover:border-[#b89b72] transition-colors`}
                    >
                      <div className="text-base font-mono font-bold">{stat.count}</div>
                      <div className="text-[10px] font-mono text-white/30 mt-0.5 truncate w-full">{stat.label}</div>
                    </div>
                  ))}
                </div>
                
                <div className="bg-black rounded-sm p-2.5 mt-3 border border-white/5 flex items-center gap-2 text-[10px] font-mono text-white/40">
                  <Info className="w-3.5 h-3.5 text-[#b89b72] shrink-0" />
                  <div className="truncate">
                    Server Root Path: <span className="text-white/65 select-all font-bold">{rootPath || 'resolving...'}</span>
                  </div>
                </div>
                {workspaceIndex && (
                  <div className="bg-black rounded-sm p-2.5 mt-2 border border-white/5 text-[10px] font-mono text-white/45 space-y-1">
                    <div className="text-[#b89b72] uppercase tracking-wider">Workspace Index</div>
                    <div className="text-white/65 leading-relaxed">{workspaceIndex.summary}</div>
                    <div className="text-white/35">
                      Cached: {new Date(workspaceIndex.generatedAt).toLocaleString()}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

        </section>

        {/* CENTER COLUMN: ASSISTANT CHAT CONSOLE (xl: col-span-4) */}
        <section className="xl:col-span-4 flex flex-col min-h-[450px]">
          <AssistantChat
            onExecutePrompt={handleExecutePrompt}
            onRefreshWorkspace={fetchWorkspace}
            onSelectSlashCommand={handleSelectSlashCommand}
            isLoading={isLoading}
            messages={messages}
          />
        </section>

        {/* RIGHT COLUMN: ACTIVE FILE EDITOR & SANITISED TERMINAL (xl: col-span-3) */}
        <section className="xl:col-span-3 flex flex-col gap-5 min-h-[450px]">
          
          {/* A. Active File Editor Inspector */}
          <div className="flex-1 min-h-[250px]">
            <FileInspector
              files={flattenedFiles}
              onRefreshWorkspace={fetchWorkspace}
              selectedFile={selectedFile}
              onSelectFile={handleSelectNodeFromFileMap}
            />
          </div>

          {/* B. Sanitised Terminal Tool */}
          <div className="h-[430px] md:h-[480px] shrink-0">
            <TerminalPane onRefreshWorkspace={fetchWorkspace} />
          </div>

        </section>

      </main>

      {/* 3. Global Dashboard Footer */}
      <footer className="py-3 px-5 border-t border-white/5 bg-[#0a0a0a] flex items-center justify-between text-[10px] font-mono text-white/35 font-medium">
        <div>🔒 Fully secured Workspace bounds simulator and full-stack API hooks.</div>
        <div>Local Time: {new Date().toLocaleTimeString()}</div>
      </footer>

    </div>
  );
}
