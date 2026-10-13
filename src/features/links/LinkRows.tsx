import { ArrowUpRight, Box, Code2, Github, Globe } from 'lucide-react';
import { Button } from '../../shared/ui/controls';
import type { QuickLink } from './model';
const linkIcons = { github: Github, unity: Box, spring: Code2, react: Globe };
function LinkIcon({ id }: { id: string }) {
  const Icon = linkIcons[id as keyof typeof linkIcons] ?? Globe;
  return <Icon size={18} />;
}
type LinkRow = Omit<QuickLink, 'scope'> & { scope?: QuickLink['scope']; classification?: string };
export type LinkRowsProps<T extends LinkRow> = {
  links: T[];
  filtered: boolean;
  onEdit?: (link: T) => void;
  onMove?: (id: string, direction: -1 | 1) => void;
  onRemove?: (link: T) => void;
  disabled?: boolean;
  iconKey?: (link: T) => string;
};
export function LinkRows<T extends LinkRow>({
  links,
  filtered,
  onEdit,
  onMove,
  onRemove,
  disabled,
  iconKey,
}: LinkRowsProps<T>) {
  return (
    <div className="quick-links">
      {links.map((l, index) => (
        <div className="quick-link-row" key={l.id}>
          <a href={l.url} target="_blank" rel="noopener noreferrer">
            <span className="link-icon">
              <LinkIcon id={iconKey ? iconKey(l) : l.id} />
            </span>
            <span className="link-copy">
              <strong>{l.label}</strong>
              <small>{l.desc}</small>
              {onEdit && (
                <span className="muted">
                  {l.classification ??
                    (l.scope === 'all'
                      ? '공통'
                      : l.scope === 'unity'
                        ? 'Unity 개발'
                        : l.scope === 'server'
                          ? '서버 · 웹 개발'
                          : '')}
                </span>
              )}
            </span>
            <ArrowUpRight size={15} />
          </a>
          {onEdit && (
            <div className="link-actions">
              <Button disabled={disabled} onClick={() => onEdit(l)} aria-label={`${l.label} 편집`}>
                편집
              </Button>
              <Button
                disabled={disabled || filtered || index === 0}
                onClick={() => onMove?.(l.id, -1)}
                aria-label={`${l.label} 위로`}
              >
                위로
              </Button>
              <Button
                disabled={disabled || filtered || index === links.length - 1}
                onClick={() => onMove?.(l.id, 1)}
                aria-label={`${l.label} 아래로`}
              >
                아래로
              </Button>
              <Button
                disabled={disabled}
                variant="danger"
                onClick={() => onRemove?.(l)}
                aria-label={`${l.label} 삭제`}
              >
                삭제
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
