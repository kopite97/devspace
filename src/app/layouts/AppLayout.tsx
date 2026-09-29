import { Code2 } from 'lucide-react';
import { type ReactNode } from 'react';
import { Button, Modal } from '../../shared/ui/controls';
import { useMobileNavigation } from './useMobileNavigation';
type MobileNavigation = ReturnType<typeof useMobileNavigation>;

export function AppLayout({
  children,
  entryKey,
  renderSidebar,
  renderTopbar,
  detail,
  closeDetail = () => {},
  hasFooter = true,
  sessionNotice,
}: {
  children: ReactNode;
  entryKey: string;
  renderSidebar: (menu: MobileNavigation) => ReactNode;
  renderTopbar: (menu: MobileNavigation) => ReactNode;
  detail?: { title: string; body: string } | null;
  closeDetail?: () => void;
  hasFooter?: boolean;
  sessionNotice?: ReactNode;
}) {
  const menu = useMobileNavigation(entryKey);
  return (
    <div className="app-shell">
      {renderSidebar(menu)}
      {menu.isOpen && (
        <button
          aria-label="메뉴 닫기"
          tabIndex={-1}
          aria-hidden="true"
          className="nav-overlay"
          onClick={menu.close}
        />
      )}
      <div className="main-shell" inert={menu.isOpen}>
        {renderTopbar(menu)}
        <main>
          {sessionNotice}
          {children}
          {hasFooter && (
            <footer className="page-footer">
              <span>
                <Code2 size={14} />
                Built for your next idea.
              </span>
              <span>devspace. · 나만의 개발 작업실</span>
            </footer>
          )}
        </main>
      </div>
      {detail && (
        <Modal title={detail.title} onClose={closeDetail} returnFocusRef={menu.triggerRef}>
          <p className="detail-body">{detail.body}</p>
          <div className="modal-actions">
            <Button onClick={closeDetail}>닫기</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
