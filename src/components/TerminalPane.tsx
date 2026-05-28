import React, { useState } from 'react';
import { Play, RotateCcw, ShieldCheck, Terminal as TermIcon } from 'lucide-react';

interface TerminalPaneProps {
  onRefreshWorkspace: () => void;
}

interface CommandLog {
  id: string;
  command: string;
  timestamp: string;
  success?: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  status: 'idle' | 'running' | 'done' | 'failed';
}

export default function TerminalPane({ onRefreshWorkspace }: TerminalPaneProps) {
  const [logs, setLogs] = useState<CommandLog[]>([]);
  const [activeLogId, setActiveLogId] = useState<string | null>(null);
  const [customCmd, setCustomCmd] = useState<string>('');
  const [mobileTab, setMobileTab] = useState<'commands' | 'console'>('commands');

  const testCommands = [
    { label: 'Check TypeScript Types', command: 'tsc --noEmit', icon: '🔷' },
    { label: 'Lint Coding Syntax', command: 'npm run lint', icon: '✨' },
    { label: 'Read Git Status', command: 'git status', icon: '🌿' },
    { label: 'View Latest Commit logs', command: 'git log --oneline -10', icon: '📜' },
  ];

  const handleCommandExec = async (cmdStr: string) => {
    const logId = `log-${Date.now()}`;
    const newLog: CommandLog = {
      id: logId,
      command: cmdStr,
      timestamp: new Date().toLocaleTimeString(),
      status: 'running',
    };

    setLogs((prev) => [newLog, ...prev].slice(0, 30));
    setActiveLogId(logId);
    setMobileTab('console');

    try {
      const response = await fetch('/api/run-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmdStr }),
      });
      const data = await response.json();

      setLogs((prev) =>
        prev.map((l) => {
          if (l.id === logId) {
            return {
              ...l,
              status: data.success ? 'done' : 'failed',
              success: data.success,
              exitCode: data.exitCode,
              stdout: data.stdout,
              stderr: data.stderr || data.error,
            };
          }
          return l;
        })
      );
      if (cmdStr.includes('git') || cmdStr.includes('patch')) {
        // Refresh directories if state changed
        onRefreshWorkspace();
      }
    } catch (err: any) {
      setLogs((prev) =>
        prev.map((l) => {
          if (l.id === logId) {
            return {
              ...l,
              status: 'failed',
              success: false,
              stderr: err.message || 'System pipe command error',
            };
          }
          return l;
        })
      );
    }
  };

  const clearSessionLogs = () => {
    setLogs([]);
    setActiveLogId(null);
  };

  const activeLog = logs.find((l) => l.id === activeLogId) || logs[0];

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] border border-white/5 rounded-sm overflow-hidden shadow-xl">
      {/* Terminal Title Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#0a0a0a] border-b border-white/10">
        <div className="flex items-center gap-2">
          <TermIcon className="w-4 h-4 text-[#b89b72]" />
          <span className="text-xs font-serif italic text-white tracking-widest">
            Sanitized Sandbox Shell Console
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] bg-white/5 text-white/40 border border-white/5 font-mono">
            <ShieldCheck className="w-3 h-3 text-[#4ade80]" /> Secure Sandbox Bounds
          </span>
          <button
            onClick={clearSessionLogs}
            className="p-1 text-white/30 hover:text-[#b89b72] rounded hover:bg-white/5 transition-all cursor-pointer"
            title="Clear Console Memory"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Modern Responsive Tab Swapper for Mobile Screen Sizes */}
      <div className="flex md:hidden border-b border-white/5 bg-[#080808] p-1 gap-1">
        <button
          type="button"
          onClick={() => setMobileTab('commands')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[10px] font-mono font-bold uppercase rounded-sm transition-all ${
            mobileTab === 'commands'
              ? 'bg-[#b89b72]/15 text-[#b89b72] border border-[#b89b72]/25'
              : 'text-white/40 hover:text-white/65 hover:bg-white/5 border border-transparent'
          }`}
        >
          ⚙️ Workspace Tasks
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('console')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[10px] font-mono font-bold uppercase rounded-sm transition-all relative ${
            mobileTab === 'console'
              ? 'bg-[#b89b72]/15 text-[#b89b72] border border-[#b89b72]/25'
              : 'text-white/40 hover:text-white/65 hover:bg-white/5 border border-transparent'
          }`}
        >
          🖥️ Live Console Output
          {logs.some(l => l.status === 'running') && (
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-[#b89b72] rounded-full animate-ping" />
          )}
        </button>
      </div>

      {/* Grid Layout: Controls + Console screen */}
      <div className="grid grid-cols-1 md:grid-cols-12 flex-1 min-h-[300px] divide-y md:divide-y-0 md:divide-x divide-white/5 overflow-hidden">
        
        {/* Approved Commands Controls Column */}
        <div className={`md:col-span-4 p-4 flex flex-col gap-2 bg-[#080808] ${mobileTab === 'commands' ? 'flex' : 'hidden md:flex'}`}>
          
          {/* Custom Terminal Prompt Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (customCmd.trim()) {
                handleCommandExec(customCmd.trim());
                setCustomCmd('');
              }
            }}
            className="mb-3 space-y-1.5"
          >
            <span className="text-[10px] font-mono font-semibold tracking-widest text-[#b89b72] uppercase block">
              💻 Execute Custom Command
            </span>
            <div className="flex items-center gap-1.5 bg-black border border-white/10 rounded-sm p-1.5">
              <span className="text-[#b89b72] font-mono text-xs pl-1 select-none font-bold">$</span>
              <input
                type="text"
                value={customCmd}
                onChange={(e) => setCustomCmd(e.target.value)}
                placeholder="e.g., ls -la, node -v, ps"
                className="flex-1 bg-transparent text-white font-mono text-xs focus:outline-none placeholder-white/25 pr-1"
              />
              <button
                type="submit"
                className="px-2.5 py-1 bg-[#b89b72] hover:bg-[#9a7e58] text-black text-[9px] font-mono font-extrabold uppercase rounded-sm transition-all active:scale-95 cursor-pointer"
              >
                Run
              </button>
            </div>
          </form>

          <span className="text-[10px] font-mono font-semibold tracking-wider text-white/35 uppercase mb-1">
            Permitted Tasks Workspace Commands
          </span>

          <div className="flex flex-col gap-2">
            {testCommands.map((tc) => (
              <button
                key={tc.command}
                onClick={() => handleCommandExec(tc.command)}
                className="group flex flex-col items-start p-2.5 rounded-sm border border-white/5 hover:border-[#b89b72] bg-black/40 hover:bg-white/5 text-left transition-all active:scale-95 cursor-pointer"
              >
                <div className="flex items-center gap-2 mb-1 w-full justify-between">
                  <span className="text-[11px] font-mono font-semibold text-white/80 group-hover:text-[#b89b72]">
                    {tc.icon} {tc.label}
                  </span>
                  <Play className="w-3 h-3 text-white/20 group-hover:text-[#4ade80] transition-colors" />
                </div>
                <div className="text-[10px] font-mono text-white/35 truncate w-full">
                  $ {tc.command}
                </div>
              </button>
            ))}
          </div>

          {logs.length > 0 && (
            <div className="flex-1 mt-4 overflow-y-auto max-h-[140px] md:max-h-[220px]">
              <div className="text-[10px] font-mono uppercase text-white/30 mb-2">Previous runs</div>
              <div className="flex flex-col gap-1.5">
                {logs.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => {
                      setActiveLogId(l.id);
                      setMobileTab('console');
                    }}
                    className={`flex items-center justify-between p-2 rounded-sm text-left font-mono text-xs border transition-all cursor-pointer ${
                      l.id === activeLogId
                        ? 'bg-white/5 border-l-2 border-[#b89b72] text-white'
                        : 'bg-transparent border-transparent hover:bg-white/5 text-white/45'
                    }`}
                  >
                    <span className="truncate pr-2 max-w-[140px]">{l.command}</span>
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded-sm font-bold uppercase shrink-0 ${
                        l.status === 'running'
                          ? 'bg-[#b89b72]/10 text-[#b89b72] border border-[#b89b72]/20 animate-pulse'
                          : l.status === 'done'
                          ? 'bg-[#4ade80]/10 text-[#4ade80] border border-[#4ade80]/20'
                          : 'bg-rose-950/50 text-rose-400 border border-rose-900/30'
                      }`}
                    >
                      {l.status}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Output Screen */}
        <div className={`md:col-span-8 flex flex-col bg-[#050505] font-mono text-xs ${mobileTab === 'console' ? 'flex' : 'hidden md:flex'}`}>
          {activeLog ? (
            <div className="flex flex-col h-full">
              <div className="px-4 py-2.5 bg-[#0a0a0a] border-b border-white/5 flex items-center justify-between text-[11px] text-white/40">
                <span className="text-white/40">
                  Target: <span className="text-[#b89b72] select-all">$ {activeLog.command}</span>
                </span>
                <span>Time: {activeLog.timestamp}</span>
              </div>

              <div className="flex-1 p-4 overflow-y-auto select-text max-h-[380px] md:max-h-[420px] leading-relaxed text-white/80 font-mono whitespace-pre-wrap select-all selection:bg-white/10">
                {activeLog.status === 'running' && (
                  <div className="flex items-center gap-2 text-[#b89b72]">
                    <span className="animate-spin">↻</span> Executing command in sandbox shell environment...
                  </div>
                )}

                {activeLog.status !== 'running' && (
                  <>
                    {activeLog.stdout && <div className="text-white/80">{activeLog.stdout}</div>}
                    {activeLog.stderr && <div className="text-rose-400 font-semibold">{activeLog.stderr}</div>}
                    {!activeLog.stdout && !activeLog.stderr && (
                      <div className="text-white/35 italic font-serif">Command finished with standard clean code output.</div>
                    )}
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-white/40">
              <div className="text-lg mb-2">🐚</div>
              <div className="font-serif italic text-white/30 max-w-sm">Select a command on the left column block to execute inside safe sandbox environment constraints.</div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
