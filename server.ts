import express from 'express';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import JSZip from 'jszip';
import type { WorkspaceFile, WorkspaceNode } from './src/types';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = path.resolve(process.env.AGENT_ROOT || process.cwd());
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const OLLAMA_CHAT_TIMEOUT_MS = Number(process.env.OLLAMA_CHAT_TIMEOUT_MS || 30000);
const OLLAMA_TAGS_TIMEOUT_MS = Number(process.env.OLLAMA_TAGS_TIMEOUT_MS || 3000);
const WORKSPACE_INDEX_CODE_SCAN_LIMIT = Number(process.env.WORKSPACE_INDEX_CODE_SCAN_LIMIT || 120);
const WORKSPACE_INDEX_IMPORT_LIMIT = Number(process.env.WORKSPACE_INDEX_IMPORT_LIMIT || 220);

app.use(express.json({ limit: '10mb' }));
const execAsync = promisify(exec);

type ToolName =
  | 'workspace_scan'
  | 'read_file'
  | 'write_file'
  | 'edit_file'
  | 'search_files'
  | 'run_terminal'
  | 'browser_fetch';

type ToolRequest = {
  tool: ToolName;
  args?: Record<string, unknown>;
  reason?: string;
};

type ToolResult = {
  tool: ToolName;
  ok: boolean;
  summary: string;
  output?: string;
  data?: unknown;
};

type ToolPlan = {
  kind: 'tool_calls' | 'final' | 'clarify';
  reply?: string;
  question?: string;
  actions?: ToolRequest[];
};

// Helper sets for file roles
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  '.cache',
  '.next',
  'build',
  'coverage',
  '__pycache__',
  '.venv',
  '.turbo',
  'vendor',
  'tmp',
]);

const CODE_EXTS = new Set([
  '.js',
  '.ts',
  '.jsx',
  '.tsx',
  '.py',
  '.go',
  '.rs',
  '.java',
  '.cpp',
  '.c',
  '.cs',
  '.php',
  '.rb',
  '.swift',
  '.kt',
  '.vue',
  '.svelte',
]);

const CONFIG_EXTS = new Set([
  '.json',
  '.yaml',
  '.yml',
  '.toml',
  '.env',
  '.ini',
  '.cfg',
  '.xml',
]);

function getRole(name: string, ext: string): WorkspaceFile['role'] {
  if (name === 'package.json') return 'pkg';
  if (name === 'tsconfig.json') return 'tsconfig';
  if (name === 'README.md') return 'readme';
  if (name === '.env' || name === '.env.example') return 'env';
  if (
    ['index.js', 'index.ts', 'main.js', 'main.ts', 'app.js', 'app.ts', 'server.js', 'server.ts'].includes(name)
  ) {
    return 'entry';
  }
  if (CODE_EXTS.has(ext)) return 'code';
  if (CONFIG_EXTS.has(ext)) return 'config';
  if (ext === '.md') return 'doc';
  if (['.css', '.scss', '.sass'].includes(ext)) return 'style';
  if (
    ext === '.test.js' ||
    ext === '.spec.js' ||
    ext === '.test.ts' ||
    ext === '.spec.ts'
  ) {
    return 'test';
  }
  return 'file';
}

type WorkspaceIndex = {
  rootPath: string;
  generatedAt: string;
  summary: string;
  stats: {
    totalFiles: number;
    totalDirs: number;
    totalSize: number;
    roles: Record<string, number>;
  };
  entryPoints: string[];
  importantFiles: string[];
  importGraph: Array<{
    file: string;
    imports: string[];
  }>;
  frameworkHints: string[];
  tree: WorkspaceNode | null;
};

let cachedWorkspaceIndex: WorkspaceIndex | null = null;

function walkRich(dir: string, depth = 0, maxDepth = 4): WorkspaceNode | null {
  if (depth > maxDepth) return null;
  const nodeName = path.basename(dir) || 'root';
  const node: WorkspaceNode = {
    name: nodeName,
    type: 'dir',
    children: [],
    files: [],
    depth,
  };

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.env') continue;
      const fp = path.join(dir, entry.name);
      const ext = path.extname(entry.name).toLowerCase();

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) {
          node.children.push({
            name: entry.name,
            type: 'dir',
            skipped: true,
            depth: depth + 1,
          });
          continue;
        }
        const sub = walkRich(fp, depth + 1, maxDepth);
        if (sub) node.children.push(sub);
      } else {
        try {
          const stats = fs.statSync(fp);
          node.files.push({
            name: entry.name,
            ext,
            role: getRole(entry.name, ext),
            size: stats.size,
            path: path.relative(ROOT, fp),
          });
        } catch {
          // ignore stat errors
        }
      }
    }
  } catch {
    // ignore read errors
  }
  return node;
}

function flattenWorkspaceFiles(node: WorkspaceNode | null, acc: WorkspaceFile[] = []): WorkspaceFile[] {
  if (!node) return acc;
  if (node.files) acc.push(...node.files);
  if (node.children) {
    node.children.forEach((child) => flattenWorkspaceFiles(child, acc));
  }
  return acc;
}

function safeRelativeFileList(files: WorkspaceFile[], limit: number): string[] {
  return files
    .slice(0, limit)
    .map((file) => file.path)
    .filter(Boolean);
}

function buildFrameworkHints(files: WorkspaceFile[], hasPackageJson: boolean): string[] {
  const hints = new Set<string>();
  if (hasPackageJson) hints.add('Package manifest present');
  if (files.some((file) => file.path === 'vite.config.ts' || file.path === 'vite.config.js')) hints.add('Vite app shell detected');
  if (files.some((file) => file.path === 'server.ts' || file.path === 'server.js')) hints.add('Express/Node server entry detected');
  if (files.some((file) => file.path.startsWith('src/'))) hints.add('React client source tree present');
  if (files.some((file) => file.path.includes('components/'))) hints.add('Component-based UI structure detected');
  return [...hints];
}

function extractImportsFromContent(content: string): string[] {
  const imports = new Set<string>();
  const importRegex = /\bimport\s+(?:type\s+)?(?:[\w*\s{},]+from\s+)?['"]([^'"]+)['"]/g;
  const requireRegex = /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g;
  const dynamicImportRegex = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;

  for (const regex of [importRegex, requireRegex, dynamicImportRegex]) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      imports.add(match[1]);
    }
  }

  return [...imports];
}

function buildWorkspaceIndex(tree: WorkspaceNode | null): WorkspaceIndex {
  const files = flattenWorkspaceFiles(tree);
  const roleCounts: Record<string, number> = {};
  let totalSize = 0;
  for (const file of files) {
    roleCounts[file.role] = (roleCounts[file.role] || 0) + 1;
    totalSize += file.size || 0;
  }

  const importantFiles = [
    'package.json',
    'tsconfig.json',
    'vite.config.ts',
    'vite.config.js',
    'server.ts',
    'server.js',
    'src/main.tsx',
    'src/App.tsx',
    'src/index.css',
  ].filter((filePath) => files.some((file) => file.path === filePath));

  const entryPoints = files.filter((file) => file.role === 'entry').map((file) => file.path);
  const codeFiles = files.filter((file) => ['code', 'entry', 'config'].includes(file.role));
  const importGraph: WorkspaceIndex['importGraph'] = [];

  for (const file of codeFiles.slice(0, WORKSPACE_INDEX_CODE_SCAN_LIMIT)) {
    const resolved = path.resolve(ROOT, file.path);
    try {
      const content = fs.readFileSync(resolved, 'utf8');
      const imports = extractImportsFromContent(content)
        .filter((specifier) => !specifier.startsWith('node:'))
        .slice(0, WORKSPACE_INDEX_IMPORT_LIMIT);
      if (imports.length > 0) {
        importGraph.push({
          file: file.path,
          imports,
        });
      }
    } catch {
      // Ignore unreadable files during index construction.
    }
  }

  const frameworkHints = buildFrameworkHints(files, files.some((file) => file.path === 'package.json'));
  const summaryParts = [
    `${files.length} files`,
    `${Object.keys(roleCounts).length} role buckets`,
    `${entryPoints.length} entry points`,
    `${importantFiles.length} important anchors`,
  ];

  const summary = `Workspace index for ${ROOT}: ${summaryParts.join(', ')}. ` +
    `Primary anchors: ${importantFiles.join(', ') || 'none detected'}. ` +
    `Framework hints: ${frameworkHints.join(', ') || 'none detected'}.`;

  const totalDirs = (tree ? countDirs(tree) : 0);

  return {
    rootPath: ROOT,
    generatedAt: new Date().toISOString(),
    summary,
    stats: {
      totalFiles: files.length,
      totalDirs,
      totalSize,
      roles: roleCounts,
    },
    entryPoints,
    importantFiles,
    importGraph,
    frameworkHints,
    tree,
  };
}

function countDirs(node: WorkspaceNode): number {
  let total = node.type === 'dir' && !node.skipped ? 1 : 0;
  node.children?.forEach((child) => {
    total += countDirs(child);
  });
  return total;
}

function getWorkspaceIndex(forceRefresh = false): WorkspaceIndex {
  if (!forceRefresh && cachedWorkspaceIndex) return cachedWorkspaceIndex;
  const tree = walkRich(ROOT, 0, 4);
  cachedWorkspaceIndex = buildWorkspaceIndex(tree);
  return cachedWorkspaceIndex;
}

function invalidateWorkspaceIndex() {
  cachedWorkspaceIndex = null;
}

function resolveWorkspacePath(relativePath: string): string {
  const resolved = path.resolve(ROOT, relativePath);
  if (!resolved.startsWith(ROOT)) {
    throw new Error('Access denied: path lies outside workspace root');
  }
  return resolved;
}

function summarizeText(text: string, maxLength = 1500): string {
  const cleaned = text.replace(/\r\n/g, '\n').trim();
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength)}\n…[truncated ${cleaned.length - maxLength} chars]`;
}

function collectWorkspaceFiles(node: WorkspaceNode | null, acc: WorkspaceFile[] = []): WorkspaceFile[] {
  if (!node) return acc;
  if (node.files) acc.push(...node.files);
  node.children?.forEach((child) => collectWorkspaceFiles(child, acc));
  return acc;
}

function safeReadFile(relativePath: string, startLine?: number, endLine?: number): string {
  const resolved = resolveWorkspacePath(relativePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`File not found: ${relativePath}`);
  }
  const content = fs.readFileSync(resolved, 'utf8');
  if (!startLine && !endLine) return content;
  const lines = content.split('\n');
  const from = Math.max(1, startLine || 1) - 1;
  const to = Math.min(lines.length, endLine || lines.length);
  return lines.slice(from, to).map((line, index) => `${from + index + 1}: ${line}`).join('\n');
}

function safeWriteFile(relativePath: string, content: string): void {
  const resolved = resolveWorkspacePath(relativePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, content, 'utf8');
  invalidateWorkspaceIndex();
}

function safeEditFile(relativePath: string, findText?: string, replaceText?: string, content?: string): void {
  const resolved = resolveWorkspacePath(relativePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`File not found: ${relativePath}`);
  }
  if (typeof content === 'string') {
    safeWriteFile(relativePath, content);
    return;
  }
  if (typeof findText !== 'string' || typeof replaceText !== 'string') {
    throw new Error('edit_file requires either content or both findText and replaceText');
  }
  const current = fs.readFileSync(resolved, 'utf8');
  if (!current.includes(findText)) {
    throw new Error(`Search text not found in ${relativePath}`);
  }
  const next = current.replace(findText, replaceText);
  fs.writeFileSync(resolved, next, 'utf8');
  invalidateWorkspaceIndex();
}

function searchWorkspaceFiles(query: string, limit = 8): Array<{ path: string; reason: string }> {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];
  const index = getWorkspaceIndex();
  const files = collectWorkspaceFiles(index.tree);
  const scored = files.map((file) => {
    let score = 0;
    const pathLower = file.path.toLowerCase();
    const nameLower = file.name.toLowerCase();
    if (pathLower.includes(trimmed)) score += 50;
    if (nameLower.includes(trimmed)) score += 25;
    if (pathLower.includes('src/')) score += 2;
    if (file.role === 'entry') score += 8;
    if (file.role === 'code') score += 5;
    const keywords = trimmed.split(/\s+/).filter(Boolean);
    for (const keyword of keywords) {
      if (pathLower.includes(keyword) || nameLower.includes(keyword)) score += 10;
    }
    return { file, score };
  });
  return scored
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ file, score }) => ({ path: file.path, reason: `score=${score}, role=${file.role}` }));
}

function isSafeTerminalCommand(command: string): boolean {
  const normalized = command.trim();
  if (!normalized) return false;

  const safeExact = new Set([
    'npm run lint',
    'npm run build',
    'npm test',
    'git status',
    'git log --oneline -10',
    'git log --oneline -n 10',
    'tsc --noEmit',
  ]);

  if (safeExact.has(normalized)) return true;

  const safePrefixes = [
    'npm run ',
    'npx tsc ',
    'git diff ',
    'git show ',
    'rg ',
    'ls ',
    'pwd',
    'cat ',
    'sed ',
  ];

  if (safePrefixes.some((prefix) => normalized.startsWith(prefix))) {
    const blockedFragments = ['rm -rf', 'shutdown', 'reboot', 'chmod -R', 'killall', 'curl ', 'wget ', '>', '>>', '|', ';', '&', '$(', '`'];
    return !blockedFragments.some((fragment) => normalized.includes(fragment));
  }

  return false;
}

async function runSafeTerminalCommand(command: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const cmdString = command.trim();
  if (!isSafeTerminalCommand(cmdString)) {
    throw new Error(`Command is not allowed in safe terminal mode: ${cmdString}`);
  }
  try {
    const { stdout, stderr } = await execAsync(cmdString, { cwd: ROOT, timeout: 25000 });
    return { exitCode: 0, stdout, stderr };
  } catch (err: any) {
    return {
      exitCode: typeof err?.code === 'number' ? err.code : 1,
      stdout: err?.stdout || '',
      stderr: err?.stderr || err?.message || 'Unknown terminal error',
    };
  }
}

async function fetchBrowserContent(urlString: string): Promise<{ title: string; text: string; url: string }> {
  const target = new URL(urlString);
  if (!['http:', 'https:'].includes(target.protocol)) {
    throw new Error('Browser fetch only supports http/https URLs');
  }
  const response = await fetch(target.toString());
  if (!response.ok) {
    throw new Error(`Browser fetch failed with status ${response.status}`);
  }
  const html = await response.text();
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : target.toString();
  const text = summarizeText(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' '),
    2500
  );
  return { title, text, url: target.toString() };
}

async function executeTool(request: ToolRequest): Promise<ToolResult> {
  const { tool, args = {} } = request;
  switch (tool) {
    case 'workspace_scan': {
      const index = getWorkspaceIndex();
      return {
        tool,
        ok: true,
        summary: `Workspace scan complete: ${index.stats.totalFiles} files, ${index.stats.totalDirs} dirs`,
        data: index,
      };
    }
    case 'read_file': {
      const filePath = String(args.path || '');
      const startLine = typeof args.startLine === 'number' ? args.startLine : undefined;
      const endLine = typeof args.endLine === 'number' ? args.endLine : undefined;
      const content = safeReadFile(filePath, startLine, endLine);
      return {
        tool,
        ok: true,
        summary: `Read ${filePath}${startLine || endLine ? ` lines ${startLine || 1}-${endLine || 'end'}` : ''}`,
        output: summarizeText(content, 4000),
      };
    }
    case 'write_file': {
      const filePath = String(args.path || '');
      const content = String(args.content || '');
      safeWriteFile(filePath, content);
      return {
        tool,
        ok: true,
        summary: `Wrote file ${filePath} (${content.length} chars)`,
      };
    }
    case 'edit_file': {
      const filePath = String(args.path || '');
      const findText = typeof args.findText === 'string' ? args.findText : undefined;
      const replaceText = typeof args.replaceText === 'string' ? args.replaceText : undefined;
      const content = typeof args.content === 'string' ? args.content : undefined;
      safeEditFile(filePath, findText, replaceText, content);
      return {
        tool,
        ok: true,
        summary: `Edited file ${filePath}`,
      };
    }
    case 'search_files': {
      const query = String(args.query || '');
      const limit = typeof args.limit === 'number' ? args.limit : 8;
      const matches = searchWorkspaceFiles(query, limit);
      return {
        tool,
        ok: true,
        summary: `Found ${matches.length} candidate files for "${query}"`,
        data: matches,
      };
    }
    case 'run_terminal': {
      const command = String(args.command || '');
      const result = await runSafeTerminalCommand(command);
      return {
        tool,
        ok: result.exitCode === 0,
        summary: `Terminal command finished with exit code ${result.exitCode}`,
        output: summarizeText([result.stdout, result.stderr].filter(Boolean).join('\n'), 5000),
        data: result,
      };
    }
    case 'browser_fetch': {
      const url = String(args.url || '');
      const page = await fetchBrowserContent(url);
      return {
        tool,
        ok: true,
        summary: `Fetched browser content from ${page.url}`,
        data: page,
        output: `${page.title}\n\n${page.text}`,
      };
    }
    default:
      throw new Error(`Unsupported tool: ${tool}`);
  }
}

function stripJsonFence(text: string): string {
  return text.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
}

function parseToolPlan(rawText: string): ToolPlan | null {
  try {
    const parsed = JSON.parse(stripJsonFence(rawText));
    if (!parsed || typeof parsed !== 'object') return null;
    if (!['tool_calls', 'final', 'clarify'].includes((parsed as any).kind)) return null;
    return parsed as ToolPlan;
  } catch {
    return null;
  }
}

function buildToolPlannerPrompt(
  prompt: string,
  workspaceIndex: WorkspaceIndex,
  messages: Array<{ role: string; text: string }>
): string {
  const recentMessages = messages.slice(-6).map((message) => `- ${message.role}: ${message.text}`).join('\n');
  return `You are a strict tool planner for a coding workbench.
Choose real tools only when necessary. Never invent tool execution.

Workspace summary:
${workspaceIndex.summary}

Available tools:
- workspace_scan: refresh and summarize the workspace index
- read_file: args { path, startLine?, endLine? }
- write_file: args { path, content }
- edit_file: args { path, content? , findText?, replaceText? }
- search_files: args { query, limit? }
- run_terminal: args { command }
- browser_fetch: args { url }

Rules:
1. If file paths are missing for write/edit tasks, return kind=clarify with a short question.
2. Use tool_calls when the task needs workspace inspection, file changes, terminal checks, or web fetches.
3. Return only valid JSON.
4. Keep actions to at most 4 items in one plan.
5. Do not describe chain-of-thought. Use short reasons only.

Respond with one of:
{"kind":"tool_calls","actions":[{"tool":"read_file","args":{"path":"src/App.tsx"},"reason":"inspect relevant UI code"}]}
{"kind":"final","reply":"short answer"}
{"kind":"clarify","question":"which file should I edit?"}

User prompt:
${prompt}

Recent conversation:
${recentMessages || '- none'}`;
}

async function requestToolPlan(
  prompt: string,
  messages: Array<{ role: string; text: string }>,
  selectedModel: string,
  customApiKey?: string
): Promise<ToolPlan> {
  const workspaceIndex = getWorkspaceIndex();
  const deterministicPlan = deriveDeterministicToolPlan(prompt, workspaceIndex);
  if (deterministicPlan) {
    return deterministicPlan;
  }

  const plannerPrompt = buildToolPlannerPrompt(prompt, workspaceIndex, messages);
  const isOllama = selectedModel.startsWith('ollama:');

  try {
    if (isOllama) {
      const modelName = selectedModel.replace('ollama:', '');
      const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: 'system', content: plannerPrompt },
            { role: 'user', content: prompt }
          ],
          stream: false
        }),
      });
      if (!response.ok) {
        throw new Error(`Planner Ollama request failed with status ${response.status}`);
      }
      const data: any = await response.json();
      const raw = data?.message?.content || data?.response || data?.output || data?.text || '';
      const parsed = parseToolPlan(String(raw));
      if (parsed) return parsed;
    } else {
      const ai = getGeminiClient(customApiKey);
      const response = await ai.models.generateContent({
        model: selectedModel.startsWith('gemini') ? selectedModel : 'gemini-3.5-flash',
        contents: [{ role: 'user', parts: [{ text: plannerPrompt }] }],
        config: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      });
      const parsed = parseToolPlan(response.text || '');
      if (parsed) return parsed;
    }
  } catch (error) {
    console.error('Tool planner error:', error);
  }

  // Heuristic fallback when the model fails to return valid JSON.
  const fallbackActions: ToolRequest[] = [{ tool: 'workspace_scan', reason: 'refresh workspace context' }];
  const lowerPrompt = prompt.toLowerCase();
  const fileMatches = [...prompt.matchAll(/([A-Za-z0-9_./-]+\.(?:ts|tsx|js|jsx|md|json|css|scss|html|yml|yaml|txt))/g)].map((match) => match[1]);
  if (/(read|open|show|inspect|explain|review|view|parse|todos|todo|fixme|hack)/i.test(lowerPrompt)) {
    const candidateFiles = fileMatches.length > 0 ? fileMatches : workspaceIndex.importantFiles.slice(0, 2);
    candidateFiles.forEach((filePath) => {
      fallbackActions.push({ tool: 'read_file', args: { path: filePath }, reason: 'inspect target file' });
    });
  }
  if (/(lint|test|build|verify|check|type)/i.test(lowerPrompt)) {
    if (/lint/i.test(lowerPrompt)) fallbackActions.push({ tool: 'run_terminal', args: { command: 'npm run lint' }, reason: 'verify syntax' });
    if (/(type|types|tsc)/i.test(lowerPrompt)) fallbackActions.push({ tool: 'run_terminal', args: { command: 'tsc --noEmit' }, reason: 'typecheck project' });
    if (/build/i.test(lowerPrompt)) fallbackActions.push({ tool: 'run_terminal', args: { command: 'npm run build' }, reason: 'build verification' });
  }
  if (/(http:\/\/|https:\/\/|browser|web page|website|url)/i.test(lowerPrompt)) {
    const urlMatch = prompt.match(/https?:\/\/[^\s]+/i);
    if (urlMatch) {
      fallbackActions.push({ tool: 'browser_fetch', args: { url: urlMatch[0] }, reason: 'inspect web page' });
    }
  }

  return { kind: 'tool_calls', actions: fallbackActions };
}

function buildToolExecutionSummary(results: ToolResult[]): string {
  return results
    .map((result, index) => {
      const body = result.output || (result.data ? JSON.stringify(result.data, null, 2) : '');
      return [`[Tool ${index + 1}] ${result.tool} (${result.ok ? 'ok' : 'failed'})`, result.summary, body ? summarizeText(body, 1200) : '']
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');
}

function deriveDeterministicToolPlan(prompt: string, workspaceIndex: WorkspaceIndex): ToolPlan | null {
  const normalized = prompt.trim();
  const lower = normalized.toLowerCase();
  const fileMatches = [...normalized.matchAll(/([A-Za-z0-9_./-]+\.(?:ts|tsx|js|jsx|md|json|css|scss|html|yml|yaml|txt|cjs|mjs))/g)].map((match) => match[1]);
  const actions: ToolRequest[] = [];

  const wantsWorkspaceScan =
    /(scan|workspace|project tree|tree|list files|file tree|scan project|فحص|مسح|استكشف|شجرة|الملفات)/i.test(lower);
  const wantsRead =
    /(read|open|show|inspect|review|view|explain|analyze|faq|readme|todo|todos|fixme|hack|ملف|افتح|اقرأ|اعرض|افحص|راجع|حلل)/i.test(lower);
  const wantsWrite =
    /(write|create|add|make|new file|save|generate|أنشئ|اكتب|احفظ|أضف|كوّن|انشئ)/i.test(lower);
  const wantsEdit =
    /(edit|modify|change|replace|update|عدّل|حدث|استبدل|غير|صحح|إصلاح)/i.test(lower);
  const wantsTerminal =
    /(run|execute|build|lint|test|check|verify|npm run|npm test|tsc|terminal|shell|شغّل|نفّذ|اختبر|بنِ|فحص)/i.test(lower);
  const wantsBrowser =
    /(browser|web|website|page|url|open url|visit|browse|متصفح|ويب|رابط|صفحة)/i.test(lower) || /https?:\/\/[^\s]+/i.test(normalized);

  if (!(wantsWorkspaceScan || wantsRead || wantsWrite || wantsEdit || wantsTerminal || wantsBrowser)) {
    return null;
  }

  if (wantsWorkspaceScan) {
    actions.push({ tool: 'workspace_scan', reason: 'refresh workspace context' });
  }

  if (wantsRead) {
    const candidateFiles = fileMatches.length > 0 ? fileMatches : workspaceIndex.importantFiles.slice(0, 2);
    candidateFiles.forEach((filePath) => {
      actions.push({ tool: 'read_file', args: { path: filePath }, reason: 'inspect requested file' });
    });
  }

  if (wantsWrite) {
    const filePath = fileMatches[0] || (lower.includes('test.md') ? 'test.md' : '');
    if (filePath) {
      const markdownContent = [
        '# ملف جديد',
        '',
        `تم إنشاء هذا الملف بناءً على الطلب: ${normalized}`,
        '',
        `> تم إنشاؤه في: ${new Date().toISOString()}`,
      ].join('\n');
      actions.push({
        tool: 'write_file',
        args: { path: filePath, content: markdownContent },
        reason: 'create requested file',
      });
    }
  }

  if (wantsEdit && fileMatches[0]) {
    actions.push({
      tool: 'edit_file',
      args: { path: fileMatches[0], content: `<!-- edited at ${new Date().toISOString()} -->\n` },
      reason: 'apply requested edit',
    });
  }

  if (wantsTerminal) {
    if (/lint/i.test(lower)) {
      actions.push({ tool: 'run_terminal', args: { command: 'npm run lint' }, reason: 'run lint check' });
    }
    if (/(type|types|tsc)/i.test(lower)) {
      actions.push({ tool: 'run_terminal', args: { command: 'tsc --noEmit' }, reason: 'run type check' });
    }
    if (/build/i.test(lower)) {
      actions.push({ tool: 'run_terminal', args: { command: 'npm run build' }, reason: 'run build check' });
    }
    if (actions.every((action) => action.tool !== 'run_terminal')) {
      actions.push({ tool: 'run_terminal', args: { command: 'git status' }, reason: 'inspect repo state' });
    }
  }

  if (wantsBrowser) {
    const urlMatch = normalized.match(/https?:\/\/[^\s]+/i);
    if (urlMatch) {
      actions.push({ tool: 'browser_fetch', args: { url: urlMatch[0] }, reason: 'inspect web page' });
    }
  }

  if (actions.length === 0) {
    return null;
  }

  const uniqueActions = actions.filter((action, index, self) => {
    const key = `${action.tool}:${JSON.stringify(action.args || {})}`;
    return index === self.findIndex((candidate) => `${candidate.tool}:${JSON.stringify(candidate.args || {})}` === key);
  }).slice(0, 4);

  return { kind: 'tool_calls', actions: uniqueActions };
}

// RESTIRCTED commands execution for maximum safety inside sandboxed terminal
const APPROVED_COMMANDS = new Map([
  ['npm run lint', 'npm run lint'],
  ['npm test', 'npm test'],
  ['git status', 'git status'],
  ['git log --oneline -10', 'git log --oneline -n 10'],
  ['tsc --noEmit', 'npx tsc --noEmit'],
]);

// Lazy Gemini API Client instantiation with customized key override functionality
function getGeminiClient(customKey?: string): GoogleGenAI {
  const key = customKey || process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error(
      'GEMINI_API_KEY environment variable is required, or you must input a custom Gemini key in the control panel.'
    );
  }
  return new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function hasGeminiKey(customKey?: string): boolean {
  return Boolean(customKey || process.env.GEMINI_API_KEY);
}

// ────────────────────────────────────────────────────────────────
// API ROUTING
// ────────────────────────────────────────────────────────────────

// 1. Get entire workspace hierarchy
app.get('/api/workspace', (req, res) => {
  try {
    const refresh = req.query.refresh === '1' || req.query.refresh === 'true';
    const index = getWorkspaceIndex(refresh);
    res.json({
      success: true,
      tree: index.tree,
      rootPath: ROOT,
      stats: index.stats,
      workspaceIndex: index,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/workspace-index', (req, res) => {
  try {
    const refresh = req.query.refresh === '1' || req.query.refresh === 'true';
    const index = getWorkspaceIndex(refresh);
    res.json({ success: true, workspaceIndex: index });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. Read single workspace file content
app.get('/api/file', (req, res) => {
  const filePath = req.query.path as string;
  if (!filePath) {
    return res.status(400).json({ error: 'Query parameter "path" is required' });
  }
  const resolved = path.resolve(ROOT, filePath);
  if (!resolved.startsWith(ROOT)) {
    return res.status(403).json({ error: 'Access denied: Path lies outside workspace root' });
  }
  if (!fs.existsSync(resolved)) {
    return res.status(404).json({ error: 'File not found' });
  }
  try {
    const content = fs.readFileSync(resolved, 'utf8');
    res.json({ success: true, content });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Write/Save custom edits to file
app.post('/api/file', (req, res) => {
  const { path: filePath, content } = req.body;
  if (!filePath || content === undefined) {
    return res.status(400).json({ error: 'Missing path or content in body' });
  }
  const resolved = path.resolve(ROOT, filePath);
  if (!resolved.startsWith(ROOT)) {
    return res.status(403).json({ error: 'Access denied: Path lies outside workspace root' });
  }
  try {
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, content, 'utf8');
    invalidateWorkspaceIndex();
    res.json({ success: true, message: `Successfully updated ${filePath}` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Safe Command executor
app.post('/api/run-command', (req, res) => {
  const { command } = req.body;
  if (!command) {
    return res.status(400).json({ error: 'Command parameter is required' });
  }

  const cmdString = command.trim();

  // Basic security sanitization checks
  const absoluteBlocklist = [
    /rm\s+-rf\s+\//,
    /chmod\s+.*-R/,
    /reboot/,
    /:(){:|:&};:/, // fork bomb
    /shutdown/,
    /killall/
  ];

  const hasViolation = absoluteBlocklist.some((pat) => pat.test(cmdString));
  if (hasViolation) {
    return res.status(403).json({
      success: false,
      error: 'Security Warning: Recursive system destruction pattern detected. Command execution aborted.'
    });
  }

  // Allow custom execution inside the sandbox working directory (ROOT)
  exec(cmdString, { cwd: ROOT, timeout: 25000 }, (err, stdout, stderr) => {
    res.json({
      success: !err,
      exitCode: err ? err.code : 0,
      stdout,
      stderr: stderr || (err ? err.message : ''),
    });
  });
});

// 5. Smart Chat & Assistant using Gemini Server-Side or Ollama Local Simulation
app.post('/api/agent/chat', async (req, res) => {
  const { prompt, messages = [], actionType = 'prompt', customApiKey, selectedModel = 'gemini-3.5-flash' } = req.body;
  
  const actualTrace: Array<{ tool: string; description: string }> = [
    { tool: 'tool_planner', description: 'Planning and executing real tools for the current request.' },
  ];

  try {
    const workspaceIndex = getWorkspaceIndex();
    const importGraphPreview = workspaceIndex.importGraph
      .slice(0, 14)
      .map((item) => `- ${item.file} -> ${item.imports.join(', ')}`)
      .join('\n');
    const importantFilesPreview = workspaceIndex.importantFiles.join(', ');
    const entryPointsPreview = workspaceIndex.entryPoints.join(', ');

    const workspaceInfo = `Workspace root: ${workspaceIndex.rootPath}
Generated at: ${workspaceIndex.generatedAt}
Summary: ${workspaceIndex.summary}
Important files: ${importantFilesPreview || 'none detected'}
Entry points: ${entryPointsPreview || 'none detected'}
Import graph preview:
${importGraphPreview || '- no import graph extracted'}
`;

    const baseSystemInstruction = `You are "AGENT v5" running under the selected model: "${selectedModel}".
You are an elite autonomous senior AI Coding Agent workbench simulation assistant.
You possess full access to files in the user's workspace. Your goal is to guide, explain, and write robust code.
Current workspace project context:
${workspaceInfo}

Guidelines:
1. Since the workspace has React components, Vite integration, and Express server setup, provide precise answers.
2. Write all responses in clean Markdown with headings, bullets, and fenced code blocks when useful.
3. If custom edits or patches are suggested, write them in clear syntax blocks with a short explanation and exact file paths.
4. When discussing work, use an explicit workflow: Inspect -> Plan -> Execute -> Verify.
5. If a slash command like "/explain", "/todos" or "/types" is invoked, fulfill it perfectly based on the project files. For /todos, scan files or provide explanations.
6. Prefer the cached workspace index above instead of rereading files unless a refresh or explicit file inspection is required.
7. Do not claim to have executed tools unless the platform actually did it; instead describe the tool plan or the result from the cached workspace index.
8. Never output pseudo tool markup such as <tool_call>, XML tool blocks, or fake filesystem commands. The platform does not execute tools from raw assistant text.
9. If a task needs multiple actions, present them as numbered phases and complete them in one coherent response rather than stopping after the first step.
10. When asked to inspect or change files, refer to exact repository paths only and summarize what you would change instead of pretending to open files.
`;

    const toolPlan = await requestToolPlan(prompt, messages, selectedModel, customApiKey);
    if (toolPlan.kind === 'clarify') {
      return res.json({
        success: false,
        error: toolPlan.question || 'Need more details to continue.',
        modelUsed: selectedModel,
        isSimulated: false,
        trace: actualTrace,
      });
    }

    const requestedActions = toolPlan.kind === 'tool_calls' && Array.isArray(toolPlan.actions)
      ? toolPlan.actions.slice(0, 4)
      : [];

    const executedTools: ToolResult[] = [];
    let workspaceChanged = false;
    for (const action of requestedActions) {
      try {
        const result = await executeTool(action);
        executedTools.push(result);
        actualTrace.push({ tool: result.tool, description: result.summary });
        if (['workspace_scan', 'write_file', 'edit_file'].includes(result.tool) && result.ok) {
          workspaceChanged = true;
        }
      } catch (error: any) {
        const message = error instanceof Error ? error.message : 'Unknown tool error';
        executedTools.push({
          tool: action.tool,
          ok: false,
          summary: message,
        });
        actualTrace.push({ tool: action.tool, description: message });
      }
    }

    const toolExecutionSummary = buildToolExecutionSummary(executedTools);
    const systemInstruction = `${baseSystemInstruction}\n\nActual tool execution summary:\n${toolExecutionSummary || 'No tools were executed.'}\n\nAnswer the user based strictly on the tool execution summary above. If a tool failed or more data is needed, say so clearly.`;
    const geminiToolContextMessage = toolExecutionSummary
      ? { role: 'user' as const, parts: [{ text: `Tool execution results:\n${toolExecutionSummary}` }] }
      : null;
    const ollamaToolContextMessage = toolExecutionSummary
      ? { role: 'user' as const, content: `Tool execution results:\n${toolExecutionSummary}` }
      : null;

    // A. Check if Ollama model is requested
    if (selectedModel.startsWith('ollama:')) {
      const modelName = selectedModel.replace('ollama:', '');
      actualTrace.push({ tool: 'query_ollama_local', description: `Attempting direct REST connection to local Ollama on ${OLLAMA_BASE_URL} with model [${modelName}]` });
      
      try {
        // Try to query local Ollama API directly in case user runs it
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), OLLAMA_CHAT_TIMEOUT_MS);

        const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: modelName,
            messages: [
              { role: 'system', content: systemInstruction },
              ...messages.map((m: any) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text })),
              ...(ollamaToolContextMessage ? [ollamaToolContextMessage] : []),
              { role: 'user', content: prompt }
            ],
            stream: false
          }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          const resData: any = await response.json();
          const ollamaText =
            (typeof resData?.message?.content === 'string' && resData.message.content.trim()) ||
            (typeof resData?.response === 'string' && resData.response.trim()) ||
            (typeof resData?.output === 'string' && resData.output.trim()) ||
            (typeof resData?.text === 'string' && resData.text.trim()) ||
            '';

          if (ollamaText) {
            actualTrace.push({ tool: 'local_ollama_retrieved', description: `Successful live response retrieved directly from Ollama local engine [${modelName}]!` });
            return res.json({
              success: true,
              text: ollamaText,
              modelUsed: selectedModel,
              isSimulated: false,
              trace: actualTrace,
              workspaceChanged
            });
          }

          actualTrace.push({ tool: 'local_ollama_empty', description: `Ollama returned a successful HTTP response but no assistant text for model [${modelName}].` });

          if (!hasGeminiKey(customApiKey)) {
            return res.status(502).json({
              success: false,
              error: `Empty response from local Ollama model [${modelName}] at ${OLLAMA_BASE_URL}. Try again after the model finishes loading, or configure GEMINI_API_KEY for fallback.`,
              modelUsed: selectedModel,
              isSimulated: false,
              trace: actualTrace
            });
          }
        }

        const errorText = response.ok
          ? `Empty response from local Ollama model [${modelName}]`
          : `Ollama replied with status ${response.status}`;
        actualTrace.push({ tool: 'local_ollama_failed', description: errorText });

        if (!hasGeminiKey(customApiKey)) {
          return res.status(503).json({
            success: false,
            error: `${errorText}. No Gemini fallback is available because GEMINI_API_KEY is not configured.`,
            modelUsed: selectedModel,
            isSimulated: false,
            trace: actualTrace
          });
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Unknown Ollama connection error';
        actualTrace.push({ tool: 'local_ollama_offline', description: `Ollama service at ${OLLAMA_BASE_URL} is offline or model [${modelName}] is still loading. Error: ${message}` });

        if (!hasGeminiKey(customApiKey)) {
          return res.status(503).json({
            success: false,
            error: `Could not reach local Ollama daemon at ${OLLAMA_BASE_URL}. No Gemini fallback is available because GEMINI_API_KEY is not configured.`,
            modelUsed: selectedModel,
            isSimulated: false,
            trace: actualTrace
          });
        }
      }

      // Generate simulation fallback using Gemini but styled as Ollama response.
      actualTrace.push({ tool: 'sandbox_ollama_render', description: `Simulating response for local model [${modelName}] using sandbox backend...` });
      const ai = getGeminiClient(customApiKey);
      const contents = messages.map((m: any) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.text }]
      }));
      if (geminiToolContextMessage) contents.push(geminiToolContextMessage);
      contents.push({ role: 'user', parts: [{ text: `[SIMULATION: Answer as if you are the local Ollama model "${modelName}"] User instruction: ${prompt}` }] });

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents,
        config: {
          systemInstruction: systemInstruction + `\nAlways start your response with: "🤖 [Ollama local model: ${modelName} - Offline Sandbox Preview]\n\n"`,
          temperature: 0.6,
        },
      });

      return res.json({
        success: true,
        text: response.text || `Empty simulated response for Ollama:${modelName}`,
        modelUsed: selectedModel,
        isSimulated: true,
        trace: actualTrace,
        workspaceChanged
      });
    }

    // B. Standard Gemini code path
    actualTrace.push({ tool: 'query_gemini_api', description: `Invoking Google Gemini AI model [${selectedModel}] with active instructions.` });
    const ai = getGeminiClient(customApiKey);

    const contents = messages.map((m: any) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.text }]
    }));
    if (geminiToolContextMessage) contents.push(geminiToolContextMessage);
    contents.push({ role: 'user', parts: [{ text: prompt }] });

    const response = await ai.models.generateContent({
      model: selectedModel.startsWith('gemini') ? selectedModel : 'gemini-3.5-flash',
      contents,
      config: {
        systemInstruction,
        temperature: 0.2,
      },
    });

    actualTrace.push({ tool: 'google_response_complete', description: `Successfully received response from Google Cloud with ${response.text?.length || 0} characters.` });

    res.json({
      success: true,
      text: response.text || 'No response generated.',
      modelUsed: selectedModel,
      isSimulated: false,
      trace: actualTrace,
      workspaceChanged
    });
  } catch (error: any) {
    console.error('Gemini error:', error);
    res.status(500).json({ success: false, error: error.message, trace: actualTrace });
  }
});

// 6. Generate Collaborative Multi-Agent Plan with Structured Handovers
app.post('/api/agent/multi-agent-plan', async (req: express.Request, res: express.Response) => {
  const { projectDescription, focusAgents = [] } = req.body;
  if (!projectDescription) {
    return res.status(400).json({ error: 'projectDescription parameter is required' });
  }

  try {
    const ai = getGeminiClient();
    const focusAgentList = Array.isArray(focusAgents) ? focusAgents.filter((agent: unknown): agent is string => typeof agent === 'string' && agent.trim().length > 0) : [];
    const focusAgentText = focusAgentList.length > 0 ? focusAgentList.join(', ') : 'structure, backend, frontend';

    const systemInstruction = `You are "AGENT v5 Orchestrator", a supreme multi-agent system coordinator.
Your purpose is to parse a user's request for a software product/project design, and compile an ultra-professional, advanced, visual Multi-Agent plan split across 6 specialized agents who hand over deliverables sequentially.

The 6 agents are:
1. Structure Architect ("مستشار الهيكل البنائي"): Details the exact file maps, folder directories, and code blueprints.
2. Database Modeler ("مصمم قواعد البيانات"): Builds SQL schemas, collections, relational diagrams, or key-value structures.
3. Backend Developer ("مهندس الأنظمة الخلفية"): Details server routes, API endpoints, logic, controller designs, and proxies.
4. Frontend Specialist ("مهندس الواجهات الرسومية"): Outlines beautiful screens, custom styling, state parameters, and components.
5. QA Testing Analyst ("مختبر الجودة والشيفرة"): Evaluates test cases, assertions, validation rules, and error handlers.
6. Technical Writer ("موثّق العمليات البرمجية"): Elaborates clean markdown readmes, API usage guides, and deploy steps.

For each agent, you MUST return structural details and a professional "Handover Packet" (deliverables passed to the next agent).
Prioritize these agents for rich detail and meaningful handovers: ${focusAgentText}.
Keep non-selected agents concise, but still valid JSON.

You MUST output ONLY valid JSON matching the following typescript type:
{
  "projectId": string,
  "projectName": string,
  "summary": string,
  "agents": {
    "structure": {
      "agentName": string,
      "roleDescription": string,
      "planDetails": string[],
      "handoverPacket": {
        "deliverables": string,
        "payloadCode": string, // can be a folder path schematic, sample json, or code structure
        "notesForNextAgent": string
      }
    },
    "database": {
      "agentName": string,
      "roleDescription": string,
      "planDetails": string[],
      "handoverPacket": {
        "deliverables": string,
        "payloadCode": string,
        "notesForNextAgent": string
      }
    },
    "backend": {
      "agentName": string,
      "roleDescription": string,
      "planDetails": string[],
      "handoverPacket": {
        "deliverables": string,
        "payloadCode": string,
        "notesForNextAgent": string
      }
    },
    "frontend": {
      "agentName": string,
      "roleDescription": string,
      "planDetails": string[],
      "handoverPacket": {
        "deliverables": string,
        "payloadCode": string,
        "notesForNextAgent": string
      }
    },
    "qa": {
      "agentName": string,
      "roleDescription": string,
      "planDetails": string[],
      "handoverPacket": {
        "deliverables": string,
        "payloadCode": string,
        "notesForNextAgent": string
      }
    },
    "documentation": {
      "agentName": string,
      "roleDescription": string,
      "planDetails": string[],
      "handoverPacket": {
        "deliverables": string,
        "payloadCode": string,
        "notesForNextAgent": string
      }
    }
  }
}
Return absolutely nothing except raw JSON. Do not wrap in markdown code blocks like \`\`\`json. Valid JSON string only.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: [{ role: 'user', parts: [{ text: `Request to decompose: "${projectDescription}"` }] }],
      config: {
        systemInstruction,
        temperature: 0.3,
        responseMimeType: "application/json"
      },
    });

    let rawText = response.text || '';
    // Strip markdown wrapper if any
    rawText = rawText.replace(/```json\s?/g, '').replace(/```\s?/g, '').trim();
    const parsedData = JSON.parse(rawText);

    res.json({ success: true, plan: parsedData });
  } catch (error: any) {
    console.error('Multi-agent plan error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 6.5 Dynamic Fetching of Locally Installed Ollama Models
app.get('/api/agent/ollama-models', async (req: express.Request, res: express.Response) => {
  try {
    // Probe local Ollama controller
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), OLLAMA_TAGS_TIMEOUT_MS);

    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data: any = await response.json();
      const models = data.models || [];
      const modelNames = models.map((m: any) => m.name || m.model);
      res.json({
        success: true,
        connected: true,
        models: modelNames
      });
    } else {
      res.json({
        success: true,
        connected: false,
        models: [],
        error: `Ollama replied with status ${response.status}`
      });
    }
  } catch (err: any) {
    res.json({
      success: true,
      connected: false,
      models: [],
      error: `Could not reach local Ollama daemon. Error: ${err.message}`
    });
  }
});

// 7. Complete Project Zip Export Endpoint (Professional)
app.get('/api/agent/export-zip', (req: express.Request, res: express.Response) => {
  try {
    const zip = new JSZip();

    // Helper functions to recursively traverse and add files to jszip
    function addDirectoryToZip(currentDir: string, zipFolderInstance: JSZip) {
      const items = fs.readdirSync(currentDir, { withFileTypes: true });

      for (const item of items) {
        // Skip hidden files/directories except .env or .env.example
        if (item.name.startsWith('.') && item.name !== '.env' && item.name !== '.env.example') {
          continue;
        }

        const fullPath = path.join(currentDir, item.name);

        if (item.isDirectory()) {
          // Skip standard build/cache directories
          if (SKIP_DIRS.has(item.name)) {
            continue;
          }
          const nestedFolder = zipFolderInstance.folder(item.name);
          if (nestedFolder) {
            addDirectoryToZip(fullPath, nestedFolder);
          }
        } else {
          // Read file content as buffer
          try {
            const fileData = fs.readFileSync(fullPath);
            zipFolderInstance.file(item.name, fileData);
          } catch (readErr) {
            console.error(`Unable to file-read: ${fullPath}`, readErr);
          }
        }
      }
    }

    addDirectoryToZip(ROOT, zip);

    // Generate zip content as stream or buffer
    zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } })
      .then((content) => {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `workspace-project-${timestamp}.zip`;

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', content.length);
        res.send(content);
      })
      .catch((zipErr) => {
        console.error('JSZip Generation error:', zipErr);
        res.status(500).json({ success: false, error: 'Failed to build project archive.' });
      });

  } catch (err: any) {
    console.error('Export zip endpoint error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// serve static build in prod, use Vite in dev
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AI Agent UI Server booting on port ${PORT}`);
  });
}

startServer();
