import React from 'react';

type Block =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'blockquote'; text: string }
  | { type: 'code'; lang: string; code: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'hr' };

function renderInline(text: string): React.ReactNode[] {
  const tokenRegex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  const parts = text.split(tokenRegex).filter(Boolean);

  return parts.map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={index} className="px-1 py-0.5 rounded bg-white/10 text-[#b89b72] font-mono text-[0.95em]">
          {part.slice(1, -1)}
        </code>
      );
    }

    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index} className="font-semibold text-white">{part.slice(2, -2)}</strong>;
    }

    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={index} className="italic text-white/90">{part.slice(1, -1)}</em>;
    }

    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      const [, label, href] = linkMatch;
      return (
        <a key={index} href={href} target="_blank" rel="noreferrer" className="text-[#b89b72] underline underline-offset-2">
          {label}
        </a>
      );
    }

    return <span key={index}>{part}</span>;
  });
}

function parseMarkdown(text: string): Block[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let paragraphBuffer: string[] = [];
  let listBuffer: string[] = [];
  let listOrdered = false;
  let inCode = false;
  let codeLang = '';
  let codeBuffer: string[] = [];
  let quoteBuffer: string[] = [];

  const flushParagraph = () => {
    if (paragraphBuffer.length > 0) {
      blocks.push({ type: 'paragraph', text: paragraphBuffer.join(' ').trim() });
      paragraphBuffer = [];
    }
  };

  const flushList = () => {
    if (listBuffer.length > 0) {
      blocks.push({ type: 'list', ordered: listOrdered, items: [...listBuffer] });
      listBuffer = [];
    }
  };

  const flushQuote = () => {
    if (quoteBuffer.length > 0) {
      blocks.push({ type: 'blockquote', text: quoteBuffer.join(' ').trim() });
      quoteBuffer = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trimEnd();
    const codeFence = trimmed.match(/^```(\w+)?\s*$/);

    if (codeFence) {
      if (!inCode) {
        flushParagraph();
        flushList();
        flushQuote();
        inCode = true;
        codeLang = codeFence[1] || '';
        codeBuffer = [];
      } else {
        blocks.push({ type: 'code', lang: codeLang, code: codeBuffer.join('\n') });
        inCode = false;
        codeLang = '';
        codeBuffer = [];
      }
      continue;
    }

    if (inCode) {
      codeBuffer.push(line);
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      flushList();
      flushQuote();
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      flushQuote();
      blocks.push({ type: 'heading', level: headingMatch[1].length, text: headingMatch[2] });
      continue;
    }

    if (/^(\*\*\*|---|___)$/.test(trimmed)) {
      flushParagraph();
      flushList();
      flushQuote();
      blocks.push({ type: 'hr' });
      continue;
    }

    const quoteMatch = trimmed.match(/^>\s?(.*)$/);
    if (quoteMatch) {
      flushParagraph();
      flushList();
      quoteBuffer.push(quoteMatch[1]);
      continue;
    }

    const unorderedMatch = trimmed.match(/^[-*+]\s+(.*)$/);
    const orderedMatch = trimmed.match(/^\d+\.\s+(.*)$/);
    if (unorderedMatch || orderedMatch) {
      flushParagraph();
      flushQuote();
      const ordered = Boolean(orderedMatch);
      const itemText = (unorderedMatch || orderedMatch)?.[1] || '';
      if (listBuffer.length > 0 && listOrdered !== ordered) {
        flushList();
      }
      listOrdered = ordered;
      listBuffer.push(itemText);
      continue;
    }

    flushList();
    flushQuote();
    paragraphBuffer.push(trimmed);
  }

  flushParagraph();
  flushList();
  flushQuote();

  if (inCode) {
    blocks.push({ type: 'code', lang: codeLang, code: codeBuffer.join('\n') });
  }

  return blocks;
}

export default function MarkdownRenderer({ text }: { text: string }) {
  const blocks = parseMarkdown(text || '');

  return (
    <div className="space-y-3 text-right md:text-left rtl:text-right">
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          const Tag = (`h${Math.min(block.level, 6)}` as keyof JSX.IntrinsicElements);
          const sizeClass =
            block.level === 1 ? 'text-lg' :
            block.level === 2 ? 'text-base' :
            block.level === 3 ? 'text-sm' :
            'text-xs';
          return (
            <Tag key={index} className={`font-bold text-white ${sizeClass} tracking-wide`}>
              {renderInline(block.text)}
            </Tag>
          );
        }

        if (block.type === 'paragraph') {
          return (
            <p key={index} className="text-white/85 leading-relaxed whitespace-pre-wrap break-words">
              {renderInline(block.text)}
            </p>
          );
        }

        if (block.type === 'blockquote') {
          return (
            <blockquote key={index} className="border-l-2 border-[#b89b72]/50 pl-3 text-white/75 italic bg-white/5 py-2 rounded-r-sm">
              {renderInline(block.text)}
            </blockquote>
          );
        }

        if (block.type === 'code') {
          return (
            <pre key={index} className="overflow-x-auto rounded-sm bg-black border border-white/10 p-3 text-[12px] leading-relaxed text-white/90">
              <code className="font-mono whitespace-pre">
                {block.code}
              </code>
            </pre>
          );
        }

        if (block.type === 'list') {
          const ListTag = block.ordered ? 'ol' : 'ul';
          return (
            <ListTag
              key={index}
              className={`space-y-1 ${block.ordered ? 'list-decimal pl-5' : 'list-disc pl-5'} text-white/85`}
            >
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex} className="leading-relaxed break-words">
                  {renderInline(item)}
                </li>
              ))}
            </ListTag>
          );
        }

        return <hr key={index} className="border-white/10" />;
      })}
    </div>
  );
}
