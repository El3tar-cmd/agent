import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  MousePointer,
  Square,
  Circle as CircleIcon,
  TrendingUp,
  Type as TypeIcon,
  Trash2,
  Download,
  Plus,
  RefreshCw,
  Cpu,
  Bookmark,
  Terminal,
  Grid,
  Paintbrush
} from 'lucide-react';

interface CanvasElement {
  id: string;
  type: 'rectangle' | 'circle' | 'arrow' | 'text';
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  text: string;
}

interface ThinkingStep {
  id: string;
  title: string;
  subtitle: string;
  durationMs: number;
  confidence: number;
  tags: string[];
  findings: string[];
  status: 'pending' | 'thinking' | 'done';
}

interface InteractiveStudioProps {
  autoTriggerQuery?: string;
}

export default function InteractiveStudio({ autoTriggerQuery }: InteractiveStudioProps = {}) {
  const [activeTab, setActiveTab] = useState<'diagram' | 'sequential'>('diagram');

  // --- DIAGRAM CANVAS STATES ---
  const [elements, setElements] = useState<CanvasElement[]>([
    // Default architectural template nodes
    { id: '1', type: 'rectangle', x: 50, y: 120, w: 140, h: 60, color: '#b89b72', text: 'Client UI (Vite)' },
    { id: '2', type: 'rectangle', x: 260, y: 120, w: 140, h: 60, color: '#3b82f6', text: 'Express API Gateway' },
    { id: '3', type: 'rectangle', x: 470, y: 70, w: 150, h: 60, color: '#10b981', text: 'Gemini Agent Engine' },
    { id: '4', type: 'rectangle', x: 470, y: 170, w: 150, h: 60, color: '#f43f5e', text: 'Local Database' },
  ]);

  const [tool, setTool] = useState<'select' | 'rectangle' | 'circle' | 'arrow' | 'text'>('select');
  const [brushColor, setBrushColor] = useState<string>('#b89b72');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [inputText, setInputText] = useState<string>('');

  const svgRef = useRef<SVGSVGElement | null>(null);

  // --- SEQUENTIAL THINKING STATES ---
  const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([
    {
      id: 'step-1',
      title: 'Deconstruct User Query & Bounds',
      subtitle: 'Analyzing user request, constraints, and ambient framework variables',
      durationMs: 380,
      confidence: 99.4,
      tags: ['parsing', 'tokenization'],
      findings: [
        'Detected prompt language: Arabic (عربي) - requesting local Ollama dynamic models and Diagram Studio.',
        'Extracted target output: Multi-agent interactive system with drawing diagrams.',
        'Identified sandbox limits: Node.js standard environment port 3000.'
      ],
      status: 'done'
    },
    {
      id: 'step-2',
      title: 'Scan Local System Integrations',
      subtitle: 'Querying local socket interfaces and running daemons',
      durationMs: 410,
      confidence: 97.2,
      tags: ['ollama-api', 'probe'],
      findings: [
        'Checking the configured Ollama API service...',
        'Ollama service mapped correctly. Preparing dynamic model fetcher API endpoint in Node / Express server.',
        'Filtered out static hardcoded Ollama models, enabling true dynamic integration.'
      ],
      status: 'done'
    },
    {
      id: 'step-3',
      title: 'Synthesize Canvas Architecture Plan',
      subtitle: 'Modeling SVG vector element representations in React',
      durationMs: 530,
      confidence: 98.8,
      tags: ['vector-svg', 'state-machine'],
      findings: [
        'Selected fully-scalable SVG canvas output over raw canvas to support seamless component resizing.',
        'Established element list with coordinates {x, y}, dimensions {w, h}, color definitions, and texts.',
        'Configured touch/drag event coordinates calculation inside workspace container boundaries.'
      ],
      status: 'done'
    },
    {
      id: 'step-4',
      title: 'Generate Diagram Presets & Flowcharts',
      subtitle: 'Building professional predefined structural configurations',
      durationMs: 250,
      confidence: 96.5,
      tags: ['design-patterns', 'preset-blueprint'],
      findings: [
        'Compiled fullstack pipeline preset connecting Client Frontend to server API to DB layer.',
        'Compiled Multi-Agent layout representing Sequential Task handovers.',
        'Provided high-quality direct download of the diagrams in pure standard SVG vector format.'
      ],
      status: 'done'
    }
  ]);

  const [thinkingActive, setThinkingActive] = useState<boolean>(false);
  const [currentThinkingStepIndex, setCurrentThinkingStepIndex] = useState<number>(4);

  const applyPromptSketch = (promptText: string) => {
    const normalized = promptText.toLowerCase();

    if (/(agent|multi-agent|أكثر من خطوة|workflow|handover)/i.test(normalized)) {
      setElements([
        { id: 'a1', type: 'circle', x: 70, y: 150, w: 90, h: 90, color: '#fbbf24', text: 'Planner' },
        { id: 'a2', type: 'circle', x: 250, y: 150, w: 90, h: 90, color: '#ec4899', text: 'Structure' },
        { id: 'a3', type: 'circle', x: 430, y: 150, w: 90, h: 90, color: '#a855f7', text: 'Frontend' },
        { id: 'a4', type: 'circle', x: 610, y: 150, w: 90, h: 90, color: '#10b981', text: 'Deploy' },
      ]);
      return;
    }

    if (/(db|database|قاعدة|schema|sql|collection)/i.test(normalized)) {
      setElements([
        { id: 'd1', type: 'rectangle', x: 70, y: 70, w: 150, h: 50, color: '#a855f7', text: 'Users' },
        { id: 'd2', type: 'rectangle', x: 70, y: 190, w: 150, h: 50, color: '#3b82f6', text: 'Projects' },
        { id: 'd3', type: 'rectangle', x: 340, y: 130, w: 170, h: 60, color: '#10b981', text: 'Relations' },
        { id: 'd4', type: 'rectangle', x: 610, y: 190, w: 150, h: 50, color: '#f59e0b', text: 'Indexes' },
      ]);
      return;
    }

    setElements([
      { id: 'p1', type: 'rectangle', x: 40, y: 120, w: 160, h: 60, color: '#b89b72', text: promptText.slice(0, 18) || 'Input' },
      { id: 'p2', type: 'rectangle', x: 260, y: 120, w: 160, h: 60, color: '#3b82f6', text: 'Transform' },
      { id: 'p3', type: 'rectangle', x: 480, y: 120, w: 160, h: 60, color: '#10b981', text: 'Output' },
    ]);
  };

  useEffect(() => {
    if (!autoTriggerQuery) return;
    const cleanText = autoTriggerQuery.split('|||')[0].trim();
    if (!cleanText) return;
    setActiveTab('diagram');
    applyPromptSketch(cleanText);
  }, [autoTriggerQuery]);

  // Clear diagram elements inside canvas workspace
  const handleClearCanvas = () => {
    setElements([]);
    setSelectedId(null);
  };

  // Prepopulate with gorgeous architectural presets
  const loadPreset = (type: 'fullstack' | 'agent' | 'db') => {
    if (type === 'fullstack') {
      setElements([
        { id: '1', type: 'rectangle', x: 50, y: 120, w: 140, h: 60, color: '#b89b72', text: 'Client UI (Vite)' },
        { id: '2', type: 'rectangle', x: 260, y: 120, w: 140, h: 60, color: '#3b82f6', text: 'Express API Gateway' },
        { id: '3', type: 'rectangle', x: 470, y: 70, w: 150, h: 60, color: '#10b981', text: 'Gemini Agent Engine' },
        { id: '4', type: 'rectangle', x: 470, y: 170, w: 150, h: 60, color: '#f43f5e', text: 'Local DB' },
      ]);
    } else if (type === 'agent') {
      setElements([
        { id: 'a1', type: 'circle', x: 80, y: 150, w: 90, h: 90, color: '#fbbf24', text: 'Planner Agent' },
        { id: 'a2', type: 'circle', x: 260, y: 150, w: 90, h: 90, color: '#ec4899', text: 'Structure Agent' },
        { id: 'a3', type: 'circle', x: 440, y: 150, w: 90, h: 90, color: '#a855f7', text: 'Frontend UI' },
        { id: 'a4', type: 'circle', x: 620, y: 150, w: 90, h: 90, color: '#10b981', text: 'Deploy Agent' },
      ]);
    } else if (type === 'db') {
      setElements([
        { id: 'd1', type: 'rectangle', x: 80, y: 80, w: 150, h: 50, color: '#a855f7', text: 'Users (Collection)' },
        { id: 'd2', type: 'rectangle', x: 80, y: 220, w: 150, h: 50, color: '#3b82f6', text: 'Projects (Collection)' },
        { id: 'd3', type: 'rectangle', x: 340, y: 150, w: 160, h: 60, color: '#10b981', text: 'Task Handover Rules' },
      ]);
    }
    setSelectedId(null);
  };

  // Handle canvas mouse presses
  const handleCanvasMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left);
    const y = Math.round(e.clientY - rect.top);

    if (tool === 'select') {
      // Find element under cursor
      const found = [...elements].reverse().find(el => {
        if (el.type === 'rectangle' || el.type === 'text') {
          return x >= el.x && x <= el.x + el.w && y >= el.y && y <= el.y + el.h;
        } else if (el.type === 'circle') {
          const r = el.w / 2;
          const cx = el.x + r;
          const cy = el.y + r;
          return Math.pow(x - cx, 2) + Math.pow(y - cy, 2) <= Math.pow(r, 2);
        }
        return false;
      });

      if (found) {
        setSelectedId(found.id);
        setInputText(found.text);
        setIsDragging(true);
        setDragOffset({ x: x - found.x, y: y - found.y });
      } else {
        setSelectedId(null);
        setInputText('');
      }
    } else {
      // Create new element
      const newEl: CanvasElement = {
        id: Date.now().toString(),
        type: tool === 'arrow' ? 'rectangle' : tool, // fallback map
        x: x - 40,
        y: y - 25,
        w: tool === 'circle' ? 80 : 130,
        h: tool === 'circle' ? 80 : 50,
        color: brushColor,
        text: tool === 'text' ? 'A text label...' : `New ${tool.toUpperCase()}`
      };

      setElements([...elements, newEl]);
      setSelectedId(newEl.id);
      setInputText(newEl.text);
      setTool('select'); // switch back to pointer automatically
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!isDragging || !selectedId || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left);
    const y = Math.round(e.clientY - rect.top);

    setElements(elements.map(el => {
      if (el.id === selectedId) {
        // Bound element inside canvas
        const nextX = Math.max(10, Math.min(x - dragOffset.x, 700));
        const nextY = Math.max(10, Math.min(y - dragOffset.y, 400));
        return { ...el, x: nextX, y: nextY };
      }
      return el;
    }));
  };

  const handleCanvasMouseUp = () => {
    setIsDragging(false);
  };

  // Update selected element text label
  const handleUpdateText = (txt: string) => {
    setInputText(txt);
    if (selectedId) {
      setElements(elements.map(el => {
        if (el.id === selectedId) {
          return { ...el, text: txt };
        }
        return el;
      }));
    }
  };

  // Change element color dynamically
  const handleChangeColor = (color: string) => {
    setBrushColor(color);
    if (selectedId) {
      setElements(elements.map(el => {
        if (el.id === selectedId) {
          return { ...el, color };
        }
        return el;
      }));
    }
  };

  // Delete selected item from board
  const handleDeleteElement = () => {
    if (selectedId) {
      setElements(elements.filter(el => el.id !== selectedId));
      setSelectedId(null);
      setInputText('');
    }
  };

  // Export Canvas layout as valid downloadable SVG
  const handleExportSVG = () => {
    if (!svgRef.current) return;
    try {
      const svgContent = svgRef.current.outerHTML;
      const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `diagram-${Date.now()}.svg`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error('Error exporting SVG diagram', e);
    }
  };

  // Sequential thinking trigger simulation loop
  const triggerThinkingSequence = () => {
    if (thinkingActive) return;
    setThinkingActive(true);
    
    // Reset steps
    setThinkingSteps(prev => prev.map((s, idx) => ({
      ...s,
      status: 'pending'
    })));

    let currentIndex = 0;
    const interval = setInterval(() => {
      setThinkingSteps(prev => prev.map((s, idx) => {
        if (idx === currentIndex) {
          return { ...s, status: 'thinking' };
        }
        if (idx < currentIndex) {
          return { ...s, status: 'done' };
        }
        return s;
      }));

      setTimeout(() => {
        setThinkingSteps(prev => prev.map((s, idx) => {
          if (idx === currentIndex) {
            return { ...s, status: 'done' };
          }
          return s;
        }));
        currentIndex++;
        if (currentIndex >= 4) {
          clearInterval(interval);
          setThinkingActive(false);
        }
      }, 900);

    }, 1200);
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] border border-white/5 rounded-sm overflow-hidden shadow-2xl">
      
      {/* Visual Header */}
      <div className="px-4 py-3 border-b border-white/10 bg-black/40 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#b89b72]" />
          <span className="text-xs font-serif italic text-white tracking-widest uppercase">
            System Workspace Diagram & Thinking Engine
          </span>
        </div>
        
        {/* Simple Tab Control Switches */}
        <div className="flex items-center p-0.5 bg-[#111111] rounded border border-white/5">
          <button
            onClick={() => setActiveTab('diagram')}
            className={`px-3 py-1 font-mono text-[9px] uppercase font-bold rounded transition-all cursor-pointer ${
              activeTab === 'diagram' ? 'bg-[#b89b72] text-black' : 'text-white/45 hover:text-white'
            }`}
          >
            🎨 Diagram Studio
          </button>
          <button
            onClick={() => setActiveTab('sequential')}
            className={`px-3 py-1 font-mono text-[9px] uppercase font-bold rounded transition-all cursor-pointer ${
              activeTab === 'sequential' ? 'bg-[#b89b72] text-black' : 'text-white/45 hover:text-white'
            }`}
          >
            🧠 Sequential Thinking
          </button>
        </div>
      </div>

      {activeTab === 'diagram' ? (
        <div className="p-4 flex-1 flex flex-col gap-4 min-h-[500px]">
          
          {/* Diagrams Preset Templates Row */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0d0d0d] p-3 rounded-sm border border-white/5">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono text-white/40 uppercase">Load Blueprint Preset:</span>
              <button
                onClick={() => loadPreset('fullstack')}
                className="px-2.5 py-1 bg-black hover:bg-white/5 border border-white/10 hover:border-blue-500/30 text-blue-400 text-[10px] font-mono rounded cursor-pointer transition-colors"
              >
                🖥️ Full-Stack Web Flow
              </button>
              <button
                onClick={() => loadPreset('agent')}
                className="px-2.5 py-1 bg-black hover:bg-white/5 border border-white/10 hover:border-amber-500/30 text-amber-400 text-[10px] font-mono rounded cursor-pointer transition-colors"
              >
                🤖 Multi-Agent Chain
              </button>
              <button
                onClick={() => loadPreset('db')}
                className="px-2.5 py-1 bg-black hover:bg-white/5 border border-white/10 hover:border-purple-500/30 text-purple-400 text-[10px] font-mono rounded cursor-pointer transition-colors"
              >
                🗄️ Relational database Schema
              </button>
            </div>

            <button
              onClick={handleExportSVG}
              className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500 hover:bg-emerald-600 font-sans font-bold text-black text-[10px] uppercase rounded-sm cursor-pointer select-none"
            >
              <Download className="w-3.5 h-3.5" /> Export Vector (.svg)
            </button>
          </div>

          {/* Core Interactive Editor Panels (Toolbar + Live SVG workspace) */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 flex-1">
            
            {/* Toolbar column */}
            <div className="md:col-span-3 bg-black/60 rounded-sm border border-white/5 p-3 flex flex-row md:flex-col gap-3 flex-wrap md:flex-nowrap">
              
              {/* Tool selector */}
              <div className="space-y-1.5 w-full">
                <div className="text-[10px] font-mono uppercase text-white/30 tracking-wider">Draw Controls</div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => setTool('select')}
                    className={`flex items-center gap-1 justify-center p-2 rounded text-[10px] font-mono uppercase font-bold border transition-colors cursor-pointer select-none ${
                      tool === 'select' ? 'bg-[#b89b72]/25 border-[#b89b72] text-[#b89b72]' : 'bg-transparent border-white/5 text-white/45 hover:text-white'
                    }`}
                  >
                    <MousePointer className="w-3.5 h-3.5" /> Pointer
                  </button>
                  <button
                    onClick={() => setTool('rectangle')}
                    className={`flex items-center gap-1 justify-center p-2 rounded text-[10px] font-mono uppercase font-bold border transition-colors cursor-pointer select-none ${
                      tool === 'rectangle' ? 'bg-[#b89b72]/25 border-[#b89b72] text-[#b89b72]' : 'bg-transparent border-white/5 text-white/45 hover:text-white'
                    }`}
                  >
                    <Square className="w-3.5 h-3.5" /> Rect
                  </button>
                  <button
                    onClick={() => setTool('circle')}
                    className={`flex items-center gap-1 justify-center p-2 rounded text-[10px] font-mono uppercase font-bold border transition-colors cursor-pointer select-none ${
                      tool === 'circle' ? 'bg-[#b89b72]/25 border-[#b89b72] text-[#b89b72]' : 'bg-transparent border-white/5 text-white/45 hover:text-white'
                    }`}
                  >
                    <CircleIcon className="w-3.5 h-3.5" /> Circle
                  </button>
                  <button
                    onClick={() => setTool('text')}
                    className={`flex items-center gap-1 justify-center p-2 rounded text-[10px] font-mono uppercase font-bold border transition-colors cursor-pointer select-none ${
                      tool === 'text' ? 'bg-[#b89b72]/25 border-[#b89b72] text-[#b89b72]' : 'bg-transparent border-white/5 text-white/45 hover:text-white'
                    }`}
                  >
                    <TypeIcon className="w-3.5 h-3.5" /> Text
                  </button>
                </div>
              </div>

              {/* Color swatches selector */}
              <div className="space-y-1.5 w-full">
                <div className="text-[10px] font-mono uppercase text-white/30 tracking-wider">Paint Swatch</div>
                <div className="flex flex-wrap gap-1.5">
                  {['#b89b72', '#3b82f6', '#10b981', '#f43f5e', '#a855f7', '#f59e0b', '#e2e8f0'].map(c => (
                    <button
                      key={c}
                      onClick={() => handleChangeColor(c)}
                      style={{ backgroundColor: c }}
                      className={`w-6 h-6 rounded-full border cursor-pointer transition-all hover:scale-110 active:scale-95 ${
                        brushColor === c ? 'border-white ring-2 ring-[#b89b72]/40' : 'border-transparent'
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* Node Inspector Label Modifier element if selected */}
              {selectedId && (
                <div className="space-y-2 w-full pt-2 border-t border-white/5">
                  <div className="text-[10px] font-mono uppercase text-amber-400 font-bold">Element Attributes</div>
                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => handleUpdateText(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-black border border-white/10 rounded text-[11px] text-white focus:outline-none focus:border-[#b89b72] font-sans"
                    placeholder="Modify text label..."
                  />

                  <button
                    onClick={handleDeleteElement}
                    className="w-full flex items-center justify-center gap-1.5 p-1.5 bg-red-950/20 border border-red-900/30 hover:border-red-900 text-red-400 rounded text-[9px] font-mono uppercase font-bold cursor-pointer transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Remove Node
                  </button>
                </div>
              )}

              {/* Clear canvas buttons */}
              <div className="w-full mt-auto pt-2 border-t border-white/5 flex flex-col gap-1.5">
                <button
                  onClick={handleClearCanvas}
                  className="w-full flex items-center justify-center gap-1.5 p-1.5 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/20 text-white/60 hover:text-white rounded text-[9px] font-mono uppercase font-bold cursor-pointer transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Clear Canvas
                </button>
              </div>

            </div>

            {/* Vector Canvas layout SVG frame */}
            <div className="md:col-span-9 bg-[#050505] rounded-sm border border-white/10 relative overflow-hidden min-h-[350px]">
              
              {/* Slate graph grid lines layer background */}
              <div className="absolute inset-0 select-none pointer-events-none opacity-[0.03]" style={{
                backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)',
                backgroundSize: '20px 20px'
              }} />

              {elements.length === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 select-none pointer-events-none">
                  <Paintbrush className="w-10 h-10 text-white/15 animate-pulse mb-2" />
                  <p className="text-[11px] font-serif italic text-white/35">قماش الرسم الاحترافي الخالي من العقد</p>
                  <p className="text-[10px] font-mono text-white/20 mt-1 uppercase">Select tools on the left to start drawing vectors</p>
                </div>
              )}

              <svg
                ref={svgRef}
                className="w-full h-full min-h-[400px] cursor-crosshair"
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
              >
                {/* Visual connectors / lines connecting nodes automatically in order */}
                {elements.map((el, index) => {
                  if (index === elements.length - 1) return null;
                  const nextNode = elements[index + 1];
                  const x1 = el.x + el.w / 2;
                  const y1 = el.y + el.h / 2;
                  const x2 = nextNode.x + nextNode.w / 2;
                  const y2 = nextNode.y + nextNode.h / 2;

                  return (
                    <g key={`arrow-${index}`} className="opacity-45">
                      <line
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke={el.color}
                        strokeWidth="1.5"
                        strokeDasharray="4 4"
                      />
                      <polygon
                        points={`${x2},${y2} ${x2 - 8},${y2 - 3} ${x2 - 8},${y2 + 3}`}
                        fill={nextNode.color}
                        transform={`rotate(${Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI}, ${x2}, ${y2})`}
                      />
                    </g>
                  );
                })}

                {/* Render graphic vector elements */}
                {elements.map((el) => {
                  const isSelected = selectedId === el.id;
                  
                  return (
                    <g key={el.id} className="cursor-move">
                      {el.type === 'rectangle' ? (
                        <rect
                          x={el.x}
                          y={el.y}
                          width={el.w}
                          height={el.h}
                          rx="4"
                          fill={el.color}
                          fillOpacity={isSelected ? 0.35 : 0.1}
                          stroke={el.color}
                          strokeWidth={isSelected ? 2.5 : 1.5}
                          className="transition-colors"
                        />
                      ) : el.type === 'circle' ? (
                        <circle
                          cx={el.x + el.w / 2}
                          cy={el.y + el.h / 2}
                          r={el.w / 2}
                          fill={el.color}
                          fillOpacity={isSelected ? 0.35 : 0.1}
                          stroke={el.color}
                          strokeWidth={isSelected ? 2.5 : 1.5}
                          className="transition-colors"
                        />
                      ) : null}

                      {/* Display Text centered inside shapes */}
                      <text
                        x={el.x + el.w / 2}
                        y={el.y + el.h / 2 + 4}
                        fill="#ffffff"
                        fontSize="10"
                        fontFamily="monospace"
                        fontWeight="bold"
                        textAnchor="middle"
                        pointerEvents="none"
                        className="select-none text-shadow-sm uppercase tracking-wider"
                      >
                        {el.text}
                      </text>
                    </g>
                  );
                })}
              </svg>

              <div className="absolute bottom-3 right-3 bg-black/80 px-2 py-1 border border-white/5 rounded text-[8px] font-mono text-white/30 lowercase select-none pointer-events-none">
                Interactive SVG Workbench Vector Map
              </div>
            </div>

          </div>

        </div>
      ) : (
        /* Sequential agent thinking panel trace view */
        <div className="p-4 flex-1 overflow-y-auto space-y-4 max-h-[660px]">
          
          <div className="p-3 bg-[#0d0d0d] rounded-sm border border-white/5 flex items-center justify-between">
            <div className="space-y-0.5">
              <h3 className="text-xs font-serif italic text-white">Sequential Thinking Process Timeline (التفكير المتسلسل)</h3>
              <p className="text-[10px] font-sans text-white/45">Visualizes the internal systematically organized logical breakdown used by complex agents</p>
            </div>

            <button
              onClick={triggerThinkingSequence}
              disabled={thinkingActive}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-black text-[10px] font-mono font-bold uppercase rounded flex items-center gap-1 cursor-pointer transition-all active:scale-95"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${thinkingActive ? 'animate-spin' : ''}`} /> Run Live Simulation
            </button>
          </div>

          <div className="space-y-3.5 pt-2">
            {thinkingSteps.map((s, index) => (
              <div
                key={s.id}
                className={`p-3.5 rounded-sm border transition-all ${
                  s.status === 'thinking'
                    ? 'bg-amber-500/5 border-amber-500/40 animate-pulse ring-1 ring-amber-500/20'
                    : s.status === 'done'
                    ? 'bg-black/60 border-white/5 hover:border-[#b89b72]/20'
                    : 'bg-black/10 border-white/5 opacity-40'
                }`}
              >
                <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-sm bg-white/5 text-[#b89b72] border border-white/10 uppercase">
                      Node 0{index + 1}
                    </span>
                    <h4 className="text-xs font-mono font-bold text-white">{s.title}</h4>
                  </div>

                  <div className="flex items-center gap-2 text-[10px] font-mono text-white/40">
                    <span>Duration: <span className="text-white/70">{s.durationMs}ms</span></span>
                    <span>|</span>
                    <span>Confidence: <span className="text-emerald-400 font-bold">{s.confidence}%</span></span>
                  </div>
                </div>

                <p className="text-[10.5px] font-sans text-white/60 mb-2.5 leading-relaxed">{s.subtitle}</p>

                {/* Tag blocks */}
                <div className="flex flex-wrap gap-1 mb-3">
                  {s.tags.map(t => (
                    <span key={t} className="px-1.5 py-0.5 bg-black rounded-sm border border-white/5 text-[8.5px] font-mono text-white/45">
                      #{t}
                    </span>
                  ))}
                </div>

                {/* Chain outputs list */}
                {s.findings.length > 0 && (s.status === 'done' || s.status === 'thinking') && (
                  <div className="space-y-1 bg-black p-2.5 rounded-sm border border-white/5 text-[10px] font-mono text-white/50 leading-relaxed font-mono">
                    <div className="text-[9px] text-[#b89b72] font-semibold uppercase tracking-wider mb-1">Synthesized Findings:</div>
                    {s.findings.map((f, fIdx) => (
                      <p key={fIdx} className="flex items-start gap-1">
                        <span className="text-amber-500 font-bold shrink-0">▸</span>
                        <span className="select-text text-white/65">{f}</span>
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

        </div>
      )}

    </div>
  );
}
