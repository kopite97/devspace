import { useEffect, useRef, type ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '../../shared/ui/controls';
import { PageScaffold, type PageScaffoldProps } from '../../shared/ui/PageScaffold';

export function ProjectDetailLayout({
  title,
  onBack,
  actions,
  children,
  feedback,
  compact = false,
}: {
  compact?: boolean;
  title: string;
  onBack: () => void;
  actions?: ReactNode;
  children: ReactNode;
  feedback?: PageScaffoldProps['feedback'];
}) {
  const region = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    titleRef.current?.focus();
    window.scrollTo(0, 0);
    let focused: Element | null = null;
    const remember = () => {
      focused = region.current?.contains(document.activeElement) ? document.activeElement : null;
    };
    document.addEventListener('focusin', remember);
    const observer = new MutationObserver(() => {
      if (focused && !focused.isConnected && document.activeElement === document.body) {
        titleRef.current?.focus();
        focused = null;
      }
    });
    if (region.current) observer.observe(region.current, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      document.removeEventListener('focusin', remember);
    };
  }, []);
  return (
    <div
      ref={region}
      className={`project-detail ${compact ? 'project-detail-compact' : ''}`}
      aria-label="프로젝트 상세 페이지"
    >
      <PageScaffold
        compact={compact}
        titleRef={titleRef}
        title={title}
        description="프로젝트 정보와 연결된 작업·개발 일지를 확인하세요."
        feedback={feedback}
        actions={
          <div className="heading-actions">
            <Button onClick={onBack}>
              <ArrowLeft size={16} />
              프로젝트 목록
            </Button>
            {actions}
          </div>
        }
      >
        {children}
      </PageScaffold>
    </div>
  );
}
