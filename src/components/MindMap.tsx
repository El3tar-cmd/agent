import React, { useRef, useEffect, useState } from 'react';
import { WorkspaceNode, WorkspaceFile, WorkspaceIndex } from '../types';

interface MindMapProps {
  tree: WorkspaceNode | null;
  onSelectNode: (file: WorkspaceFile) => void;
  onInjectNode: (filePath: string) => void;
  activeFilter: string;
  workspaceIndex?: WorkspaceIndex | null;
}

interface CanvasNode {
  id: string;
  name: string;
  type: 'dir' | 'file';
  role?: string;
  path: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  size: number;
  color: string;
  parent?: CanvasNode;
}

const ROLE_COLORS: Record<string, string> = {
  pkg: '#b89b72', // Gold
  tsconfig: '#b89b72', // Gold
  readme: '#ffffff', // Elegant pure white
  env: '#d97706', // Soft secure gold-amber
  entry: '#ffffff', // Highlighted white entry
  code: '#9a815c', // Bronze-tinged golden code
  config: '#887d6e', // Slate-gold config
  doc: '#746e63', // Dimmer gold docs
  style: '#c27e61', // Soft clay rouge
  test: '#9a815c', // Bronze test files
  file: '#444444', // Dark grey generic files
  dir: '#b89b72', // Beautiful gold main directories
};

export default function MindMap({ tree, onSelectNode, onInjectNode, activeFilter, workspaceIndex }: MindMapProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [zoom, setZoom] = useState<number>(0.95);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hoveredNode, setHoveredNode] = useState<CanvasNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<CanvasNode | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({ width: 400, height: 350 });

  // Handle ResizeObserver to avoid hardcoding sizes
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDimensions({ width: width || 400, height: height || 350 });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Compute Layout Positions Dynamically
  useEffect(() => {
    if (!tree) return;

    const list: CanvasNode[] = [];
    let idCounter = 0;

    const process = (
      node: WorkspaceNode,
      parent: CanvasNode | null,
      angleStart: number,
      angleRange: number,
      depth: number
    ) => {
      // Direct properties for current directory
      const currentId = `dir-${++idCounter}`;
      const r = depth * 110;
      const angle = angleStart + angleRange / 2;

      // Centered or radial layout target coordinates
      const targetX = parent ? parent.targetX + Math.cos(angle) * 110 : 0;
      const targetY = parent ? parent.targetY + Math.sin(angle) * 110 : 0;

      const dirNode: CanvasNode = {
        id: currentId,
        name: node.name,
        type: 'dir',
        path: node.name,
        x: parent ? parent.x : 0,
        y: parent ? parent.y : 0,
        targetX,
        targetY,
        size: 14 - depth * 1.5,
        color: '#b89b72',
        parent: parent || undefined,
      };

      list.push(dirNode);

      // Distribute children directories
      const subDirs = node.children || [];
      const numDirs = subDirs.length;
      if (numDirs > 0) {
        const step = angleRange / numDirs;
        subDirs.forEach((sub, idx) => {
          process(sub, dirNode, angleStart + idx * step, step, depth + 1);
        });
      }

      // Distribute files around directory
      const files = node.files || [];
      const numFiles = files.length;
      if (numFiles > 0) {
        const fileAngleStep = (Math.PI * 1.8) / numFiles;
        files.forEach((file, idx) => {
          const fileAngle = angle + idx * fileAngleStep;
          const fileRadius = 45 + Math.min(files.length * 2, 25);
          const fTargetX = targetX + Math.cos(fileAngle) * fileRadius;
          const fTargetY = targetY + Math.sin(fileAngle) * fileRadius;

          const fileColor = ROLE_COLORS[file.role] || '#9ca3af';

          list.push({
            id: `file-${++idCounter}-${file.path}`,
            name: file.name,
            type: 'file',
            role: file.role,
            path: file.path,
            x: targetX,
            y: targetY,
            targetX: fTargetX,
            targetY: fTargetY,
            size: 6,
            color: fileColor,
            parent: dirNode,
          });
        });
      }
    };

    // Begin mapping from absolute root
    process(tree, null, 0, Math.PI * 2, 1);
    setNodes(list);
  }, [tree]);

  // Spring/Animation loop to slide nodes into actual target coordinates
  useEffect(() => {
    let animId: number;
    const step = () => {
      setNodes((prevNodes) =>
        prevNodes.map((n) => {
          const dx = n.targetX - n.x;
          const dy = n.targetY - n.y;
          if (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1) {
            return { ...n, x: n.targetX, y: n.targetY };
          }
          return {
            ...n,
            x: n.x + dx * 0.15,
            y: n.y + dy * 0.15,
          };
        })
      );
      animId = requestAnimationFrame(step);
    };
    animId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animId);
  }, [nodes.length]);

  // Canvas Drawing Logic
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, dimensions.width, dimensions.height);

    ctx.save();
    // Translate coordinate plane by panning values and scale factor
    ctx.translate(dimensions.width / 2 + pan.x, dimensions.height / 2 + pan.y);
    ctx.scale(zoom, zoom);

    // 1. Draw connecting relationships / spider limbs
    nodes.forEach((node) => {
      if (node.parent) {
        ctx.beginPath();
        ctx.moveTo(node.parent.x, node.parent.y);
        ctx.lineTo(node.x, node.y);

        // Styling based on file nodes
        if (node.type === 'file') {
          // Subtle glow matching active filter
          const isHighlighted = activeFilter === 'all' || activeFilter === node.role;
          ctx.strokeStyle = isHighlighted ? 'rgba(184, 155, 114, 0.35)' : 'rgba(255, 255, 255, 0.04)';
          ctx.lineWidth = isHighlighted ? 1.2 : 0.6;
        } else {
          ctx.strokeStyle = 'rgba(184, 155, 114, 0.25)';
          ctx.lineWidth = 1.2;
        }
        ctx.stroke();
      }
    });

    // 2. Draw nodes and text details
    nodes.forEach((node) => {
      const isFile = node.type === 'file';
      const isFiltered = activeFilter !== 'all' && isFile && activeFilter !== node.role;

      ctx.beginPath();
      const dotRadius = isFile ? node.size : node.size + 1.5;
      ctx.arc(node.x, node.y, dotRadius, 0, Math.PI * 2);

      // Highlights / active node glowing mechanics
      const isHovered = hoveredNode?.id === node.id;
      const isSelected = selectedNode?.id === node.id;

      if (isFiltered) {
        ctx.fillStyle = '#0f0f0f';
        ctx.strokeStyle = '#1a1a1a';
      } else {
        ctx.fillStyle = node.color;
        ctx.strokeStyle = isSelected || isHovered ? '#ffffff' : 'rgba(0,0,0,0.6)';
      }

      ctx.lineWidth = isSelected ? 2.5 : isHovered ? 1.8 : 1;
      ctx.fill();
      ctx.stroke();

      // Drop slight shadow/glow if hovered
      if (isHovered && !isFiltered) {
        ctx.shadowColor = node.color;
        ctx.shadowBlur = 16;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
        ctx.shadowBlur = 0; // reset
      }

      // Draw node text under clean typography guides
      const displayLabel = node.name;
      ctx.font = node.type === 'dir' ? 'bold 10.5px "Space Grotesk", sans-serif' : '9px "JetBrains Mono", sans-serif';
      ctx.fillStyle = isFiltered ? '#333333' : isSelected ? '#b89b72' : isHovered ? '#ffffff' : '#a0a0a0';
      ctx.textAlign = 'center';
      ctx.fillText(displayLabel, node.x, node.y + dotRadius + 12);
    });

    ctx.restore();
  }, [nodes, zoom, pan, hoveredNode, selectedNode, dimensions, activeFilter]);

  // Pan / Click Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    } else {
      // Logic to detect hover states
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left - dimensions.width / 2 - pan.x;
      const mouseY = e.clientY - rect.top - dimensions.height / 2 - pan.y;

      let matched: CanvasNode | null = null;
      for (const node of nodes) {
        const nx = node.x * zoom;
        const ny = node.y * zoom;
        const dx = mouseX - nx;
        const dy = mouseY - ny;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // check if distance is inside click diameter
        if (dist < (node.size + 10) * zoom) {
          matched = node;
          break;
        }
      }
      setHoveredNode(matched);
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    setIsDragging(false);

    if (hoveredNode) {
      setSelectedNode(hoveredNode);
      if (hoveredNode.type === 'file') {
        const fileObj: WorkspaceFile = {
          name: hoveredNode.name,
          ext: '.' + hoveredNode.name.split('.').pop(),
          role: (hoveredNode.role as any) || 'file',
          size: 0,
          path: hoveredNode.path,
        };
        onSelectNode(fileObj);
      }
    }
  };

  const zm = (factor: number) => {
    setZoom((z) => Math.max(0.2, Math.min(2.5, z * factor)));
  };

  const resetV = () => {
    setZoom(0.95);
    setPan({ x: 0, y: 0 });
    setSelectedNode(null);
  };

  return (
    <div ref={containerRef} className="relative w-full h-full min-h-[300px] border border-white/5 rounded-sm bg-[#050505] overflow-hidden group">
      {/* HUD Controller */}
      <div className="absolute top-3 left-3 flex gap-1.5 z-10 bg-[#0a0a0a] border border-white/10 p-1.5 rounded-sm backdrop-blur-md opacity-75 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => zm(1.15)}
          className="w-7 h-7 flex items-center justify-center text-xs font-mono font-bold bg-[#111111] hover:bg-black border border-white/5 rounded-sm text-white/55 hover:text-[#b89b72] transition-all active:scale-95 cursor-pointer"
          title="Zoom In"
        >
          ＋
        </button>
        <button
          onClick={() => zm(0.85)}
          className="w-7 h-7 flex items-center justify-center text-xs font-mono font-bold bg-[#111111] hover:bg-black border border-white/5 rounded-sm text-white/55 hover:text-[#b89b72] transition-all active:scale-95 cursor-pointer"
          title="Zoom Out"
        >
          －
        </button>
        <button
          onClick={resetV}
          className="w-7 h-7 flex items-center justify-center text-xs font-mono bg-[#111111] hover:bg-black border border-white/5 rounded-sm text-white/55 hover:text-[#b89b72] transition-all active:scale-95 cursor-pointer"
          title="Reset View"
        >
          ⊡
        </button>
      </div>

      {workspaceIndex && (
        <div className="absolute top-3 right-3 z-10 max-w-[360px] bg-[#0a0a0a] border border-white/10 p-3 rounded-sm backdrop-blur-md opacity-80 group-hover:opacity-100 transition-opacity">
          <div className="text-[9px] font-mono uppercase tracking-wider text-[#b89b72] mb-1">Workspace Brief</div>
          <div className="text-[10px] font-mono text-white/65 leading-relaxed">{workspaceIndex.summary}</div>
          <div className="mt-2 text-[9px] font-mono text-white/40">
            Imports: {workspaceIndex.importGraph.length} | Entry points: {workspaceIndex.entryPoints.length}
          </div>
        </div>
      )}

      {canvasRef && (
        <canvas
          ref={canvasRef}
          width={dimensions.width}
          height={dimensions.height}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          className="w-full h-full block cursor-grab active:cursor-grabbing"
        />
      )}

      {/* Floating details badge */}
      {hoveredNode && (
        <div className="absolute bottom-3 left-3 bg-[#0a0a0a] border border-white/10 rounded-sm p-3 max-w-[240px] shadow-2xl backdrop-blur-md pointer-events-none z-10 animate-fade-in">
          <div className="flex items-center gap-1.5 mb-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
              style={{ backgroundColor: hoveredNode.color }}
            />
            <span className="text-[10px] font-mono uppercase tracking-wider text-white/40">
              {hoveredNode.type === 'dir' ? 'Directory' : hoveredNode.role || 'File'}
            </span>
          </div>
          <div className="text-xs font-medium font-mono text-white truncate">{hoveredNode.name}</div>
          <div className="text-[9px] font-mono text-white/30 truncate mt-0.5">{hoveredNode.path}</div>
          {hoveredNode.type === 'file' && (
            <div className="text-[9px] text-[#b89b72] mt-1.5 font-mono italic">Click to inspect file</div>
          )}
        </div>
      )}

      {!tree && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white/40 font-mono text-xs">
          <span className="animate-spin text-[#b89b72] text-lg mb-2">↻</span>
          Loading cached workspace index...
        </div>
      )}
    </div>
  );
}
