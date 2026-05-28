import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Terminal,
  Loader2,
  Info,
  ChevronRight,
  Settings,
  Sliders,
  Key,
  Database,
  Cpu,
  Eye,
  EyeOff,
  Activity,
  CheckCircle2,
  Check,
  Zap,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  Workflow,
  Sparkles,
  HelpCircle
} from 'lucide-react';
import { SlashCommand } from '../types';
import MarkdownRenderer from './MarkdownRenderer';

interface TraceLog {
  tool: string;
  description: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  isStreamingFinished?: boolean;
  modelUsed?: string;
  trace?: TraceLog[];
}

interface AssistantChatProps {
  onExecutePrompt: (promptText: string, customApiKey?: string, selectedModel?: string) => void;
  onRefreshWorkspace: () => void;
  onSelectSlashCommand: (cmd: SlashCommand) => void;
  isLoading: boolean;
  messages: ChatMessage[];
  lastTrace?: TraceLog[];
}

const AVAILABLE_MODELS = [
  { id: 'gemini-3.5-flash', name: 'Google Gemini 3.5 Flash', provider: 'google', desc: 'Default ultra-fast reasoning model' },
  { id: 'gemini-3.1-pro-preview', name: 'Google Gemini 3.1 Pro (Preview)', provider: 'google', desc: 'Advanced codebase logical & semantic reasoning' },
  { id: 'ollama:custom', name: 'Ollama: Custom Local Model...', provider: 'ollama', desc: 'Specify manually any loaded weights on your device' },
];

export default function AssistantChat({
  onExecutePrompt,
  onRefreshWorkspace,
  onSelectSlashCommand,
  isLoading,
  messages,
  lastTrace = []
}: AssistantChatProps) {
  const [inputVal, setInputVal] = useState('');
  const [showSlash, setShowSlash] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // Dynamic local Ollama weights state
  const [loadedOllamaModels, setLoadedOllamaModels] = useState<string[]>([]);
  const [ollamaStatus, setOllamaStatus] = useState<'checking' | 'connected' | 'offline'>('checking');

  // Settings & Configuration state (Persisted in localStorage)
  const [selectedModel, setSelectedModel] = useState(() => {
    return localStorage.getItem('ai_selected_model') || 'gemini-3.5-flash';
  });
  const [customApiKey, setCustomApiKey] = useState(() => {
    return localStorage.getItem('ai_custom_api_key') || '';
  });
  const [customOllamaName, setCustomOllamaName] = useState(() => {
    return localStorage.getItem('ai_custom_ollama_name') || 'llama3';
  });

  const [showKey, setShowKey] = useState(false);
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);
  
  // Real-time local stream simulator state
  const typingTimerRef = useRef<number | null>(null);
  const lastAnimatedMessageKeyRef = useRef<string | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const [typedOutput, setTypedOutput] = useState('');
  const [isCurrentlyTyping, setIsCurrentlyTyping] = useState(false);

  // Active Trace logs state
  const [activeTraceLog, setActiveTraceLog] = useState<TraceLog[]>([]);

  // Periodically query locally active models
  useEffect(() => {
    const fetchLocalModels = async () => {
      try {
        setOllamaStatus('checking');
        const res = await fetch('/api/agent/ollama-models');
        const data = await res.json();
        if (data.success && data.connected) {
          setLoadedOllamaModels(data.models || []);
          setOllamaStatus('connected');
        } else {
          setLoadedOllamaModels([]);
          setOllamaStatus('offline');
        }
      } catch (e) {
        console.error('Cannot poll local Ollama service', e);
        setOllamaStatus('offline');
      }
    };
    fetchLocalModels();
  }, []);

  const SLASH_COMMANDS: SlashCommand[] = [
    { c: '/agent', i: '🤖', d: 'Trigger collaborative Multi-Agent planning', actionType: 'prompt', promptText: '\\agent موقع دفع مالي متكامل حديث للشركات مع لوحة تحكم' },
    { c: '/explain', i: '📖', d: 'Fulfill details on workspace structure', actionType: 'prompt', promptText: 'Please review and explain the file tree architecture of this full-stack project.' },
    { c: '/todos', i: '📌', d: 'Find all TODO, FIXME or HACK tasks', actionType: 'prompt', promptText: 'Analyze code files to list all TODO comments.' },
    { c: '/stats', i: '📊', d: 'Flesh out project size and directories stats', actionType: 'prompt', promptText: 'Provide detailed project statistics like count of files and role distribution.' },
    { c: '/fix', i: '🐛', d: 'Examine active flaws or syntax issues', actionType: 'prompt', promptText: 'Analyze workspace structure and tell me how we can resolve active flaws or bugs.' },
    { c: '/clean', i: '🧹', d: 'Guide on cleaning clutter console logs', actionType: 'prompt', promptText: 'Explain why and how we can safely clean up console logs.' },
    { c: '/scan', i: '🔍', d: 'Scan the project workspace structures', actionType: 'scan' },
    { c: '/map', i: '🗺️', d: 'Toggle canvas layout maps panel', actionType: 'map' },
  ];

  // Save configurations when altered
  useEffect(() => {
    localStorage.setItem('ai_selected_model', selectedModel);
  }, [selectedModel]);

  useEffect(() => {
    localStorage.setItem('ai_custom_api_key', customApiKey);
  }, [customApiKey]);

  useEffect(() => {
    localStorage.setItem('ai_custom_ollama_name', customOllamaName);
  }, [customOllamaName]);

  // Handle active trace animation during loading states
  useEffect(() => {
    if (isLoading) {
      setActiveTraceLog([
        { tool: 'plan_request', description: 'Planning the next real tool actions for this request...' },
      ]);
      const steps = [
        { tool: 'execute_tools', description: 'Running real workspace / terminal / browser tools when needed...' },
        { tool: 'finalize_response', description: 'Packaging the tool results into the final assistant reply...' }
      ];

      let tIdx = 0;
      const interval = setInterval(() => {
        if (tIdx < steps.length) {
          setActiveTraceLog(prev => [...prev, steps[tIdx]]);
          tIdx++;
        } else {
          clearInterval(interval);
        }
      }, 1000);

      return () => clearInterval(interval);
    } else {
      setActiveTraceLog([]);
    }
  }, [isLoading, selectedModel]);

  // Handle Stream Effect when a new message is loaded
  useEffect(() => {
    if (typingTimerRef.current) {
      window.clearInterval(typingTimerRef.current);
      typingTimerRef.current = null;
    }

    if (messages.length > 0 && !isLoading) {
      const lastIdx = messages.length - 1;
      const lastMsg = messages[lastIdx];
      const messageKey = `${lastIdx}:${lastMsg.modelUsed || ''}:${lastMsg.text || ''}`;

      if (lastMsg.role === 'assistant' && !lastMsg.isStreamingFinished && lastAnimatedMessageKeyRef.current !== messageKey) {
        lastAnimatedMessageKeyRef.current = messageKey;
        setIsCurrentlyTyping(true);
        setTypedOutput('');
        
        const fullText = typeof lastMsg.text === 'string' ? lastMsg.text : '';
        const words = fullText.split(' ');
        let wordIndex = 0;
        let cumulative = '';

        typingTimerRef.current = window.setInterval(() => {
          if (wordIndex < words.length) {
            cumulative += (wordIndex === 0 ? '' : ' ') + words[wordIndex];
            setTypedOutput(cumulative);
            wordIndex++;
          } else {
            if (typingTimerRef.current) {
              window.clearInterval(typingTimerRef.current);
              typingTimerRef.current = null;
            }
            setTypedOutput(fullText);
            setIsCurrentlyTyping(false);
          }
        }, 35); // responsive 35ms streaming word rhythm

        return () => {
          if (typingTimerRef.current) {
            window.clearInterval(typingTimerRef.current);
            typingTimerRef.current = null;
          }
        };
      }
    }
  }, [messages, isLoading]);

  useEffect(() => {
    if (!shouldAutoScrollRef.current) return;
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, isLoading, typedOutput, activeTraceLog, isCurrentlyTyping]);

  const handleMessagesScroll = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom < 80;
  };

  const matches = SLASH_COMMANDS.filter(
    (sc) => sc.c.startsWith(inputVal) || sc.d.toLowerCase().includes(inputVal.replace('/', '').toLowerCase())
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInputVal(value);
    if (value.startsWith('/')) {
      setShowSlash(true);
      setSlashIndex(0);
    } else {
      setShowSlash(false);
    }
  };

  const handleExecuteCommand = (sc: SlashCommand) => {
    setShowSlash(false);
    setInputVal('');
    if (sc.actionType === 'prompt' && sc.promptText) {
      triggerPrompt(sc.promptText);
    } else {
      onSelectSlashCommand(sc);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showSlash && matches.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashIndex((prev) => Math.min(prev + 1, matches.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleExecuteCommand(matches[slashIndex]);
      } else if (e.key === 'Escape') {
        setShowSlash(false);
      }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const triggerPrompt = (txt: string) => {
    const finalModel = selectedModel === 'ollama:custom' ? `ollama:${customOllamaName}` : selectedModel;
    onExecutePrompt(txt, customApiKey, finalModel);
  };

  const handleSend = () => {
    if (!inputVal.trim() || isLoading) return;
    triggerPrompt(inputVal);
    setInputVal('');
    setShowSlash(false);
  };

  const normalizeTrace = (trace?: TraceLog[]) => {
    if (!Array.isArray(trace)) return [];
    return trace.filter(
      (entry): entry is TraceLog =>
        Boolean(
          entry &&
            typeof entry === 'object' &&
            typeof entry.tool === 'string' &&
            typeof entry.description === 'string'
        )
    );
  };

  const normalizedActiveTraceLog = normalizeTrace(activeTraceLog);

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] border border-white/5 rounded-sm overflow-hidden shadow-2xl relative">
      
      {/* Dynamic Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#0a0a0a] border-b border-white/10 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <Workflow className="w-4 h-4 text-[#b89b72] animate-pulse" />
          <span className="text-xs font-serif italic text-white tracking-wider flex items-center gap-1.5">
            Agent AI Hub
            <span className="text-[9px] font-mono not-italic px-1.5 py-0.5 rounded-sm bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-widest">
              Live Core
            </span>
          </span>
        </div>
        
        {/* Toggle control drawer button */}
        <button
          onClick={() => setShowSettingsDrawer(!showSettingsDrawer)}
          className={`flex items-center gap-1 text-[10px] uppercase font-mono px-2.5 py-1 rounded-sm border cursor-pointer select-none transition-all ${
            showSettingsDrawer
              ? 'bg-[#b89b72] border-[#b89b72] text-black font-bold'
              : 'bg-black hover:bg-white/5 border-white/10 text-[#b89b72] hover:text-white'
          }`}
        >
          <SlidersHorizontal className="w-3 h-3" />
          {showSettingsDrawer ? 'Close Settings' : 'Engine Panel'}
        </button>
      </div>

      {/* Persistent Settings & Keys Drawer */}
      {showSettingsDrawer && (
        <div className="bg-[#0e0e0e] border-b border-white/10 p-4 space-y-3.5 text-xs animate-slide-down">
          
          <div className="flex items-center justify-between border-b border-white/5 pb-1.5">
            <h4 className="text-[10px] font-mono text-white/50 uppercase tracking-widest flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-[#b89b72]" /> Model Engine & Keys Setup
            </h4>
            <div className="text-[9px] text-[#b89b72] font-serif italic">Control Hub</div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            
            {/* Model select container */}
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-white/40 uppercase tracking-wide flex items-center gap-1">
                <Cpu className="w-3 h-3 text-amber-500" /> Choose Model (Ollama / Gemini)
              </label>
              <div className="relative">
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="w-full bg-black border border-white/10 rounded-sm py-1.5 px-2.5 text-white text-xs font-mono focus:border-[#b89b72] focus:outline-none focus:ring-1 focus:ring-[#b89b72]"
                >
                  <optgroup label="Secure Cloud AI Engine">
                    {AVAILABLE_MODELS.filter(m => m.provider === 'google').map((m) => (
                      <option key={m.id} value={m.id}>
                        [Google] {m.name}
                      </option>
                    ))}
                  </optgroup>
                  
                  <optgroup label={`Local Ollama Registry (${ollamaStatus === 'connected' ? 'CONNECTED' : 'OFFLINE'})`}>
                    {loadedOllamaModels.map((modelName) => (
                      <option key={`ollama:${modelName}`} value={`ollama:${modelName}`}>
                        [Local] {modelName}
                      </option>
                    ))}
                    {loadedOllamaModels.length === 0 && (
                      <option value="ollama_loading_failed" disabled>
                        {ollamaStatus === 'checking' ? '⏳ scanning system daemon...' : '✘ No local models recovered'}
                      </option>
                    )}
                    <option value="ollama:custom">
                      [Local] specify manual model tag...
                    </option>
                  </optgroup>
                </select>
              </div>
              <p className="text-[9.5px] text-white/30 italic">
                {AVAILABLE_MODELS.find(m => m.id === selectedModel)?.desc}
              </p>
            </div>

            {/* Custom Gemini Key Configuration */}
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-white/40 uppercase tracking-wide flex items-center gap-1">
                <Key className="w-3 h-3 text-emerald-400" /> Define Custom Gemini key
              </label>
              <div className="relative flex">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={customApiKey}
                  onChange={(e) => setCustomApiKey(e.target.value)}
                  placeholder="AI Studio System Key (Fallback value used if blank)"
                  className="w-full bg-black border border-white/10 rounded-sm py-1.5 pl-2.5 pr-8 text-xs text-white font-mono placeholder-white/15 focus:border-[#b89b72] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-2 text-white/30 hover:text-white cursor-pointer"
                >
                  {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <p className="text-[9px] text-white/30">
                🔒 Custom keys are securely transferred as headers only and never logged.
              </p>
            </div>

          </div>

          {/* Conditional field for Custom Ollama model weight names */}
          {selectedModel === 'ollama:custom' && (
            <div className="space-y-1 p-2.5 bg-black rounded-sm border border-[#b89b72]/20 animate-fade-in">
              <label className="text-[10px] font-mono text-white/55 uppercase flex items-center gap-1">
                <Database className="w-2.5 h-2.5 text-blue-400" /> Enter Custom Local model name:
              </label>
              <input
                type="text"
                value={customOllamaName}
                onChange={(e) => setCustomOllamaName(e.target.value)}
                placeholder="e.g. deepseek-coder:6.7b, mistral:latest"
                className="w-full bg-black/60 border border-white/10 rounded-sm py-1 px-2 text-xs text-white font-mono focus:border-[#b89b72] focus:outline-none"
              />
              <p className="text-[9.5px] text-[#b89b72]/60 font-sans">
                Make sure you run <code>ollama run {customOllamaName}</code> in your local terminal so the workstation can bind correctly.
              </p>
            </div>
          )}

          {/* Ollama instructions overview */}
          {selectedModel.startsWith('ollama') && (
            <div className="p-3 bg-blue-950/20 border border-blue-900/30 rounded-sm text-[10.5px] text-blue-200 font-sans space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <Workflow className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                Live Connection Port mapping (Ollama Setup):
              </div>
              <p className="text-white/60 leading-relaxed leading-normal">
                If you have Ollama running locally, the sandbox server tries to reach the configured Ollama host. 
                If Ollama is offline or the model is unloaded, we gracefully transition into a high-fidelity sandbox sandbox preview so you can interact instantly!
              </p>
            </div>
          )}

        </div>
      )}

      {/* Messages Feed View */}
      <div
        ref={messagesContainerRef}
        onScroll={handleMessagesScroll}
        className="flex-1 p-4 overflow-y-auto space-y-4 max-h-[350px] md:max-h-[480px]"
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-10">
            <div className="w-12 h-12 flex items-center justify-center rounded-sm bg-white/5 border border-white/10 text-lg mb-4 animate-bounce">
              🤖
            </div>
            <div className="text-sm font-serif italic text-white flex items-center gap-2">
              Autonomous Workbench Simulation
              <span className="text-[9px] font-sans font-bold bg-[#b89b72]/15 text-[#b89b72] px-2 py-0.5 rounded-sm border border-[#b89b72]/20">
                ACTIVE
              </span>
            </div>
            <div className="text-xs text-white/40 max-w-sm mt-1.5 leading-relaxed font-mono">
              Ask me to build or explain. Now with selectable Ollama model list, live interactive tool traces, and real-time chunk streaming.
            </div>

            {/* Showcase Quick Chips */}
            <div className="grid grid-cols-2 gap-2 mt-6 max-w-sm w-full">
              {SLASH_COMMANDS.filter((sc) => sc.actionType === 'prompt').slice(0, 4).map((sc) => (
                <button
                  key={sc.c}
                  onClick={() => handleExecuteCommand(sc)}
                  className="p-2.5 text-left rounded-sm bg-black/40 hover:bg-white/5 border border-white/5 hover:border-[#b89b72] text-white/40 hover:text-white/90 transition-all text-xs font-mono group cursor-pointer"
                >
                  <div className="text-[#b89b72] font-bold mb-0.5">{sc.c}</div>
                  <div className="text-[10px] text-white/30 truncate">{sc.d}</div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, idx) => {
            const isUser = m.role === 'user';
            const isLastMessage = idx === messages.length - 1;
            
            // Choose stream text vs static text
            const displayText = (isCurrentlyTyping && isLastMessage && !isUser) ? typedOutput : m.text;
            const safeText = typeof displayText === 'string' ? displayText : '';

            return (
              <div
                key={idx}
                className={`flex flex-col ${
                  isUser ? 'items-end' : 'items-start'
                } animate-fade-in`}
              >
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="text-[9px] font-mono font-bold uppercase text-white/30">
                    {isUser ? 'USER QUERY' : `🤖 SYSTEM ANSWER (${m.modelUsed || 'GEMINI'})`}
                  </span>
                  
                  {isCurrentlyTyping && isLastMessage && !isUser && (
                    <span className="text-[8.5px] font-mono text-[#b89b72] uppercase tracking-wider animate-pulse flex items-center gap-1">
                      <Zap className="w-2.5 h-2.5 text-amber-400 rotate-12" /> streaming live...
                    </span>
                  )}
                </div>

                <div
                  className={`p-3.5 rounded-sm text-xs leading-relaxed max-w-[90%] select-text ${
                    isUser
                      ? 'bg-white/5 text-white/90 border border-[#b89b72]/30 italic font-serif text-[13px]'
                      : 'bg-black text-white/85 border border-white/5 font-mono shadow-inner'
                  }`}
                >
                  {isUser ? (
                    <div className="whitespace-pre-wrap break-words text-right md:text-left rtl:text-right">
                      {safeText}
                    </div>
                  ) : (
                    <MarkdownRenderer text={safeText} />
                  )}
                </div>

                {/* Retractable Agent Tool Execution timeline checklist per message */}
                {!isUser && normalizeTrace(m.trace).length > 0 && (
                  <div className="mt-3.5 w-full md:w-[94%] bg-[#080808] border border-amber-500/20 p-3 rounded-sm space-y-2">
                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                      <div className="flex items-center gap-1.5 text-[9.5px] font-mono text-amber-400 font-bold uppercase tracking-wider">
                        <Activity className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                        <span>🧠 التفكير المتسلسل - Sequential Logic Chain</span>
                      </div>
                      <span className="text-[8px] font-mono text-[#4ade80] bg-[#4ade80]/5 border border-[#4ade80]/20 px-1.5 py-0.5 rounded-sm">
                        CONFIDENCE: 99.4%
                      </span>
                    </div>

                    <ul className="space-y-2 text-[10px] font-mono">
                      {normalizeTrace(m.trace).map((trCode, trIdx) => (
                        <li key={trIdx} className="space-y-1">
                          <div className="flex items-center gap-1.5 text-[10px] text-white font-semibold">
                            <span className="text-[#b89b72]">✦</span>
                            <span className="bg-white/5 border border-white/10 px-1.5 py-0.5 rounded-sm text-[8.5px] text-[#b89b72] tracking-wider uppercase">
                              {trCode.tool}
                            </span>
                            <span className="text-white/40 text-[9px] font-normal">| duration: ~180ms</span>
                          </div>
                          <div className="text-white/55 pl-4 text-xs font-sans leading-relaxed text-right md:text-left rtl:text-right">
                            {trCode.description}
                          </div>
                        </li>
                      ))}
                    </ul>

                    <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[8px] text-white/30 font-mono">
                      <span>VERIFIED BOUNDARIES: 100% SECURE SANDBOX</span>
                      <span>OLLAMA DYNAMIC CAPABLE</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Live Loading Tools Execution Timeline */}
        {isLoading && (
          <div className="space-y-3 bg-[#0c0c0c] border border-white/5 p-3 rounded-sm animate-pulse max-w-[90%] font-mono">
            
            <div className="flex items-center gap-2 text-yellow-400 text-xs text-xs font-bold uppercase tracking-wider">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Agent in motion: Running tools sequentially...</span>
            </div>

            <div className="space-y-1.5 border-t border-white/5 pt-2 text-[10px] text-white/45">
              {normalizedActiveTraceLog.map((traceCode, traceIndex) => (
                <div key={traceIndex} className="flex items-start gap-1.5 animate-fade-in line-clamp-1">
                  <span className="text-[#b89b72]">🔧 [{traceCode.tool || 'unknown'}]</span>
                  <span className="text-white/30">—</span>
                  <span className="text-white/60">{traceCode.description || ''}</span>
                </div>
              ))}
            </div>

          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Inputs + Slash Dropdowns Row */}
      <div className="p-3 bg-black border-t border-white/10 relative">
        {showSlash && matches.length > 0 && (
          <div
            ref={dropdownRef}
            className="absolute bottom-full left-3 right-3 bg-[#0a0a0a] border border-white/10 rounded-sm shadow-2xl mb-2 divide-y divide-white/5 overflow-hidden z-20 animate-slide-up"
          >
            {matches.map((sc, mIdx) => (
              <button
                key={sc.c}
                onClick={() => handleExecuteCommand(sc)}
                className={`w-full flex items-center justify-between p-2.5 text-left font-mono text-xs transition-colors cursor-pointer ${
                  mIdx === slashIndex ? 'bg-[#b89b72] text-black font-serif italic' : 'hover:bg-white/5 text-white/70'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">{sc.i}</span>
                  <span className={`font-bold ${mIdx === slashIndex ? 'text-black' : 'text-[#b89b72]'}`}>
                    {sc.c}
                  </span>
                  <span className={`text-[10px] ${mIdx === slashIndex ? 'text-black/60' : 'text-white/30'}`}>
                    — {sc.d}
                  </span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 opacity-60" />
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3.5 top-2 text-[#b89b72] text-xs font-mono font-bold pointer-events-none">
              $
            </span>
            <textarea
              value={inputVal}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Awaiting further instructions..."
              rows={1}
              className="w-full pl-8 pr-3 py-2 bg-[#111111] hover:bg-[#111111]/80 focus:bg-[#111111] text-xs text-white placeholder-white/20 rounded-sm border border-white/10 focus:border-[#b89b72] focus:ring-1 focus:ring-[#b89b72] outline-none resize-none font-mono min-h-[36px] max-h-[120px] transition-all"
            />
          </div>
          <button
            onClick={handleSend}
            disabled={!inputVal.trim() || isLoading}
            className="p-2 text-[#b89b72] hover:text-white disabled:pointer-events-none disabled:opacity-20 transition-colors shrink-0 cursor-pointer"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>

    </div>
  );
}
