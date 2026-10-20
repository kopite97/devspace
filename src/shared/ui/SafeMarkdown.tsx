import { Fragment, type ReactNode } from 'react';

export function safeMarkdownUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}
function inline(text: string): ReactNode[] {
  // React escapes all text. Remote images and raw HTML are deliberately never mounted.
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g).map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>;
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    const href = link && safeMarkdownUrl(link[2]);
    if (link && href)
      return (
        <a key={i} href={href} target="_blank" rel="noopener noreferrer">
          {link[1]}
        </a>
      );
    return <Fragment key={i}>{part}</Fragment>;
  });
}
export function SafeMarkdown({ text }: { text: string }) {
  const blocks = text.split(/```[^\n]*\n([\s\S]*?)```/g);
  return (
    <div className="safe-markdown">
      {blocks.map((block, index) =>
        index % 2 ? (
          <pre key={index}>
            <code>{block}</code>
          </pre>
        ) : (
          <Fragment key={index}>
            {block.split(/\n/).map((line, i) => {
              const heading = line.match(/^#{1,6}\s+(.+)$/);
              if (heading) return <h4 key={i}>{inline(heading[1])}</h4>;
              if (/^\s*[-*]\s+/.test(line))
                return <p key={i}>• {inline(line.replace(/^\s*[-*]\s+/, ''))}</p>;
              return line ? <p key={i}>{inline(line)}</p> : <br key={i} />;
            })}
          </Fragment>
        ),
      )}
    </div>
  );
}
