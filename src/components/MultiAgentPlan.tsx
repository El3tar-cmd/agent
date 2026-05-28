import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  GitFork,
  ArrowRight,
  Database,
  Cpu,
  Layers,
  CheckCircle2,
  Play,
  ArrowLeftRight,
  Loader2,
  ChevronRight,
  Copy,
  BookOpen,
  FolderTree,
  ShieldCheck,
  Check
} from 'lucide-react';

interface HandoverPacket {
  deliverables: string;
  payloadCode: string;
  notesForNextAgent: string;
}

interface AgentInfo {
  agentName: string;
  roleDescription: string;
  planDetails: string[];
  handoverPacket: HandoverPacket;
}

type AgentKey = 'structure' | 'database' | 'backend' | 'frontend' | 'qa' | 'documentation';

interface PlanStructure {
  projectId: string;
  projectName: string;
  summary: string;
  agents: {
    structure: AgentInfo;
    database: AgentInfo;
    backend: AgentInfo;
    frontend: AgentInfo;
    qa: AgentInfo;
    documentation: AgentInfo;
  };
}

interface MultiAgentPlanProps {
  autoTriggerQuery?: string;
  focusAgents?: AgentKey[];
  focusSummary?: string;
}

export default function MultiAgentPlan({ autoTriggerQuery, focusAgents = [], focusSummary = '' }: MultiAgentPlanProps = {}) {
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanStructure | null>(null);

  // Simulation state
  const [activeStep, setActiveStep] = useState<string | null>(null);
  const [simulationRunning, setSimulationRunning] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<Record<string, boolean>>({});
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  
  // Tab within details view
  const [selectedAgentKey, setSelectedAgentKey] = useState<AgentKey>('structure');

  const agentOrder: Array<{
    key: AgentKey;
    icon: any;
    color: string;
    pulseColor: string;
  }> = [
    { key: 'structure', icon: FolderTree, color: 'text-amber-400 border-amber-500/30', pulseColor: 'bg-amber-400' },
    { key: 'database', icon: Database, color: 'text-blue-400 border-blue-500/30', pulseColor: 'bg-blue-400' },
    { key: 'backend', icon: Cpu, color: 'text-emerald-400 border-emerald-500/30', pulseColor: 'bg-emerald-400' },
    { key: 'frontend', icon: Layers, color: 'text-pink-400 border-pink-500/30', pulseColor: 'bg-pink-400' },
    { key: 'qa', icon: ShieldCheck, color: 'text-purple-400 border-purple-500/30', pulseColor: 'bg-purple-400' },
    { key: 'documentation', icon: BookOpen, color: 'text-neutral-300 border-neutral-500/30', pulseColor: 'bg-white' },
  ];

  const visibleAgentKeys = focusAgents.length > 0 ? focusAgents : agentOrder.map((agent) => agent.key);

  useEffect(() => {
    if (visibleAgentKeys.length > 0 && !visibleAgentKeys.includes(selectedAgentKey)) {
      setSelectedAgentKey(visibleAgentKeys[0]);
    }
  }, [selectedAgentKey, visibleAgentKeys.join('|')]);

  // Trigger from App.tsx via chat command
  useEffect(() => {
    if (autoTriggerQuery) {
      const cleanText = autoTriggerQuery.split('|||')[0];
      setPrompt(cleanText);
      handleGeneratePlan(cleanText);
    }
  }, [autoTriggerQuery]);

  const PRESETS = [
    { title: '🏦 Fintech Payment Pipeline', query: 'نظام دفع مالي متطور مع قاعدة بيانات متكاملة وتأكيد العمليات' },
    { title: '🛒 Modern E-commerce Platform', query: 'متجر تسوق إلكتروني متقدم مع نظام طلبات وسلة مشتريات ودفع الكتروني' },
    { title: '🗺️ School SaaS Tracker', query: 'منصة إدارة مدارس مع جداول حصص وحسابات للطلاب والمعلمين وقاعدة بيانات' },
    { title: '💬 Real-time Team Collaboration', query: 'تطبيق محادثة فورية وتنسيق مهام بين فرق العمل مع تسليم ملفات' }
  ];

  const handleGeneratePlan = async (queryText: string) => {
    if (!queryText.trim()) return;
    setIsLoading(true);
    setError(null);
    setPlan(null);
    setSimulationRunning(false);
    setCompletedSteps({});
    setActiveStep(null);

    try {
      const res = await fetch('/api/agent/multi-agent-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectDescription: queryText, focusAgents }),
      });
      const data = await res.json();
      if (data.success) {
        setPlan(data.plan);
        setSelectedAgentKey(visibleAgentKeys[0] ?? 'structure');
        // Automatically start handover simulation!
        setTimeout(() => {
          setSimulationRunning(true);
          setCompletedSteps({});
          
          const steps = visibleAgentKeys.length > 0 ? visibleAgentKeys : (['structure', 'backend', 'frontend'] as AgentKey[]);
          
          let stepIndex = 0;
          const runHandoverSequence = () => {
            if (stepIndex < steps.length) {
              const currentStepName = steps[stepIndex];
              setActiveStep(currentStepName);
              setSelectedAgentKey(currentStepName);
              
              setTimeout(() => {
                setCompletedSteps(prev => ({ ...prev, [currentStepName]: true }));
                stepIndex++;
                runHandoverSequence();
              }, 1800);
            } else {
              setActiveStep(null);
              setSimulationRunning(false);
            }
          };
          runHandoverSequence();
        }, 700);
      } else {
        setError(data.error || 'Failed to decompose project across agents.');
      }
    } catch (err: any) {
      setError(err.message || 'Server connection error.');
    } finally {
      setIsLoading(false);
    }
  };

  const runSimulation = async () => {
    if (!plan || simulationRunning) return;
    setSimulationRunning(true);
    setCompletedSteps({});
    
    const steps = visibleAgentKeys.length > 0 ? visibleAgentKeys : (['structure', 'backend', 'frontend'] as AgentKey[]);

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      setActiveStep(step);
      setSelectedAgentKey(step);
      // Wait for 1.8 seconds to visually indicate work and handover
      await new Promise((resolve) => setTimeout(resolve, 1800));
      setCompletedSteps(prev => ({ ...prev, [step]: true }));
    }

    setActiveStep(null);
    setSimulationRunning(false);
  };

  const handleCopyCode = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(id);
    setTimeout(() => setCopiedSection(null), 1500);
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] border border-white/5 rounded-sm overflow-hidden shadow-2xl">
      
      {/* Dynamic Tab Header */}
      <div className="px-4 py-3 border-b border-white/10 bg-black/40 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#b89b72]" />
          <span className="text-xs font-serif italic text-white tracking-widest">
            Specialised Multi-agent Orchestration Canvas
          </span>
        </div>
        <div className="text-[9px] font-sans font-bold uppercase tracking-wider bg-[#b89b72]/15 text-[#b89b72] px-2 py-0.5 rounded-sm border border-[#b89b72]/20">
          PLANNING & HANDOVER MODE
        </div>
      </div>

      {/* Main Mode View */}
      <div className="p-4 flex-1 overflow-y-auto space-y-4 max-h-[660px]">
        {!plan ? (
          <div className="space-y-4 py-4">
            
            <div className="p-4 bg-black/40 rounded-sm border border-white/5 space-y-2.5">
              <h3 className="text-xs font-serif italic text-white tracking-wide">
                كيف يعمل نظام الـ Multi-Agent الذكي؟
              </h3>
              <p className="text-[11px] text-white/55 leading-relaxed font-sans">
                عند تحديد مواصفات مشروع برمجى، سنقسم العمل فقط على الوكلاء المناسبين بدل تشغيل الجميع. كل وكيل يمرر مخرجاته كـ <strong className="text-amber-400">"Handover Packet" (حزمة تسليم مع كود مخصص)</strong> للوكيل التالي في خط الإنتاج بشكل متسلسل ومرئي.
              </p>
            </div>

            {focusAgents.length > 0 && (
              <div className="p-3 bg-[#111111] rounded-sm border border-[#b89b72]/20 text-[11px] text-white/70 font-sans">
                <span className="text-[#b89b72] font-mono uppercase tracking-wider">Focused agents:</span>{' '}
                {focusAgents.join(' → ')}
                {focusSummary ? (
                  <>
                    <span className="text-white/30"> · </span>
                    <span>{focusSummary}</span>
                  </>
                ) : null}
              </div>
            )}

            {/* Prompt Generator Input */}
            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase text-white/40 tracking-wider">
                صف مشروعك البرمجي بالتفصيل (أو اختر من النماذج):
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="مثال: إنشاء منصة إيصال طلبات مطاعم مع خرائط..."
                  className="flex-1 px-3 py-2 bg-[#111111] border border-white/10 rounded-sm text-xs text-white placeholder-white/20 focus:outline-none focus:border-[#b89b72] focus:ring-1 focus:ring-[#b89b72] font-sans"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleGeneratePlan(prompt);
                  }}
                />
                <button
                  onClick={() => handleGeneratePlan(prompt)}
                  disabled={isLoading || !prompt.trim()}
                  className="px-4 py-1 bg-[#b89b72] hover:bg-[#a68a62] disabled:opacity-40 text-black text-xs font-bold rounded-sm uppercase tracking-wider flex items-center gap-1.5 transition-all select-none cursor-pointer"
                >
                  {isLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <GitFork className="w-3.5 h-3.5" />
                  )}
                  {isLoading ? 'ANALYSING...' : 'DECOMPOSE'}
                </button>
              </div>
            </div>

            {/* Presets Grid */}
            <div className="space-y-1.5 pt-2">
              <div className="text-[10px] font-mono text-white/30 uppercase">نماذج مشاريع سريعة:</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {PRESETS.map((p, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setPrompt(p.query);
                      handleGeneratePlan(p.query);
                    }}
                    className="p-3 text-right rounded-sm bg-[#111111] hover:bg-white/5 border border-white/5 hover:border-[#b89b72]/40 transition-all cursor-pointer group flex flex-col items-start gap-1"
                  >
                    <span className="text-xs text-[#b89b72] font-serif italic text-left">{p.title}</span>
                    <span className="text-[10px] text-white/40 truncate w-full text-left font-sans">{p.query}</span>
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-sm bg-red-950/20 border border-red-900/40 text-red-400 text-xs font-mono">
                🛑 Error: {error}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            {/* Global Plan Header Summary */}
            <div className="p-4 bg-black rounded-sm border border-white/5 space-y-2 relative overflow-hidden">
              <div className="absolute right-0 top-0 w-24 h-24 bg-[#b89b72]/5 blur-3xl pointer-events-none" />
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-serif italic text-[#b89b72]">{plan.projectName}</h2>
                  <p className="text-[10px] text-white/30 font-mono uppercase tracking-wider mt-0.5">
                    Orchestrated Blueprint ID: {plan.projectId}
                  </p>
                </div>
                <button
                  onClick={() => setPlan(null)}
                  className="text-[9px] font-mono border border-white/10 hover:border-white/30 text-white/50 hover:text-white px-2 py-1 rounded-sm cursor-pointer"
                >
                  ← New Architecture
                </button>
              </div>
              <p className="text-xs text-white/70 leading-relaxed font-sans mt-2 italic">
                "{plan.summary}"
              </p>

              <div className="pt-3 border-t border-white/5 flex flex-wrap items-center justify-between gap-3">
                <span className="text-[10px] font-mono text-white/40">
                  Status: {simulationRunning ? '🔴 Live Collaboration Simulation' : '🟢 Ready for Deployment Action'}
                </span>
                
                <button
                  onClick={runSimulation}
                  disabled={simulationRunning}
                  className="px-3 py-1 bg-white hover:bg-neutral-200 disabled:opacity-40 text-black text-[10px] font-sans font-bold rounded-sm uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Play className="w-3 h-3 fill-black text-black" />
                  {simulationRunning ? 'Simulating Handover Pipeline...' : 'Run Simulation Tour'}
                </button>
              </div>
            </div>

            {/* Interactive Visual Agents Row Flow */}
            <div className="space-y-2">
              <div className="text-[10px] font-mono text-white/40 uppercase tracking-widest text-center">
                Multi-Agent Pipeline & Handovers
              </div>
              <div className="flex flex-col md:flex-row items-stretch justify-between gap-1.5 bg-black/60 p-2.5 rounded-sm border border-white/5 overflow-x-auto">
                {agentOrder.filter((ao) => visibleAgentKeys.includes(ao.key)).map((ao, idx, filteredAgents) => {
                  const info = plan.agents[ao.key];
                  const IconComp = ao.icon;
                  const isCurrent = activeStep === ao.key;
                  const isCompleted = completedSteps[ao.key];
                  const isSelected = selectedAgentKey === ao.key;

                  return (
                    <React.Fragment key={ao.key}>
                      <button
                        onClick={() => setSelectedAgentKey(ao.key)}
                        className={`flex-1 min-w-[130px] p-3 rounded-sm border text-left flex flex-col justify-between transition-all relative cursor-pointer select-none ${
                          isSelected
                            ? 'bg-[#111111] border-[#b89b72]'
                            : isCurrent
                            ? 'bg-black border-yellow-500/40'
                            : 'bg-black/20 hover:bg-[#111111]/30 border-white/5'
                        }`}
                      >
                        {/* Status bar */}
                        {isCompleted && (
                          <div className="absolute top-1.5 right-1.5 text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </div>
                        )}
                        {isCurrent && (
                          <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span>
                          </span>
                        )}

                        <div className="space-y-1.5">
                          <div className="flex items-center gap-1.5">
                            <IconComp className={`w-4 h-4 ${ao.color}`} />
                            <span className="text-[9px] font-mono text-white/40">AGENT 0{idx + 1}</span>
                          </div>
                          <div className="text-[10.5px] font-serif italic text-white leading-tight truncate">
                            {info ? info.agentName.split('(')[0] : ao.key}
                          </div>
                        </div>

                        <div className="mt-3 flex items-center justify-between">
                          <span className={`text-[8.5px] font-mono uppercase ${
                            isCompleted ? 'text-emerald-400' : isCurrent ? 'text-yellow-400 font-bold' : 'text-white/20'
                          }`}>
                            {isCompleted ? 'HANDED OVER' : isCurrent ? 'WORKING...' : 'PENDING'}
                          </span>
                        </div>
                      </button>

                      {idx < filteredAgents.length - 1 && (
                        <div className="hidden md:flex items-center justify-center shrink-0 text-white/20 px-0.5">
                          <ArrowRight className={`w-4 h-4 ${
                            completedSteps[ao.key] ? 'text-[#b89b72] animate-pulse' : ''
                          }`} />
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            {/* Selected Agent Handover Dossier Display */}
            {selectedAgentKey && plan.agents[selectedAgentKey] && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 bg-[#0c0c0c] border border-white/15 p-4 rounded-sm">
                
                {/* Dossier Left: Info, Role, Steps */}
                <div className="lg:col-span-4 space-y-4 border-b lg:border-b-0 lg:border-r border-white/5 pb-4 lg:pb-0 lg:pr-4">
                  <div>
                    <div className="text-[9px] font-mono text-[#b89b72] uppercase tracking-widest mb-1">
                      AGENT PROFILE
                    </div>
                    <h3 className="text-xs font-serif italic text-white flex items-center gap-1.5">
                      {plan.agents[selectedAgentKey].agentName}
                    </h3>
                    <p className="text-[10px] text-white/55 font-sans mt-1 leading-relaxed">
                      {plan.agents[selectedAgentKey].roleDescription}
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-[9px] font-mono text-white/40 uppercase tracking-widest">
                      CORE PIPELINE ACTIONS
                    </div>
                    <ul className="space-y-1 font-mono text-[10px] text-white/60">
                      {plan.agents[selectedAgentKey].planDetails.map((detail, dIdx) => (
                        <li key={dIdx} className="flex items-start gap-1.5">
                          <span className="text-[#b89b72] font-serif italic">✓</span>
                          <span>{detail}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Transfer Note Widget */}
                  <div className="bg-black/50 p-3 rounded-sm border border-dashed border-white/10 space-y-1">
                    <div className="flex items-center gap-1.5 text-amber-400">
                      <ArrowLeftRight className="w-3.5 h-3.5" />
                      <span className="text-[9px] font-mono uppercase tracking-wider">Handover Protocol Note</span>
                    </div>
                    <p className="text-[10.5px] text-white/60 italic font-sans leading-relaxed">
                      "{plan.agents[selectedAgentKey].handoverPacket.notesForNextAgent}"
                    </p>
                  </div>
                </div>

                {/* Dossier Right: Handover Deliverable Payload Codes */}
                <div className="lg:col-span-8 flex flex-col h-full space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[9px] font-mono text-white/30 uppercase tracking-widest">
                        DELIVERED PACKET METRICS
                      </span>
                      <h4 className="text-[11px] font-serif italic text-white mt-0.5">
                        {plan.agents[selectedAgentKey].handoverPacket.deliverables}
                      </h4>
                    </div>
                    
                    <button
                      onClick={() => handleCopyCode(plan.agents[selectedAgentKey].handoverPacket.payloadCode, selectedAgentKey)}
                      className="text-[9px] font-mono bg-black hover:bg-white/5 border border-white/10 hover:border-[#b89b72] text-[#b89b72] hover:text-white px-2.5 py-1 rounded-sm flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      {copiedSection === selectedAgentKey ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          Copied Section!
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          Copy Payload
                        </>
                      )}
                    </button>
                  </div>

                  {/* Code frame */}
                  <div className="flex-1 bg-black rounded-sm border border-white/5 overflow-hidden text-[10.5px] font-mono relative">
                    <div className="absolute right-3.5 top-3.5 text-[8.5px] font-mono text-white/25 uppercase select-none">
                      payload.json / code
                    </div>
                    <pre className="p-3.5 overflow-x-auto text-white/80 select-text leading-relaxed font-mono max-h-[220px]">
                      {plan.agents[selectedAgentKey].handoverPacket.payloadCode}
                    </pre>
                  </div>
                </div>

              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
