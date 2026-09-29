import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import './account-menu.css';

export function AccountMenu({
  avatar,
  displayName,
  children,
  error,
}: {
  avatar: string;
  displayName: string;
  children: ReactNode;
  error?: string;
}) {
  const [isOpen, setIsOpen] = useState(Boolean(error));
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (error) setIsOpen(true);
  }, [error]);
  useEffect(() => {
    if (!isOpen) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setIsOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [isOpen]);
  return (
    <div
      className="account-menu"
      ref={root}
      onBlur={(event) => {
        if (
          event.relatedTarget instanceof Node &&
          !event.currentTarget.contains(event.relatedTarget)
        )
          setIsOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="avatar avatar-small account-trigger"
        aria-label="프로필 메뉴"
        aria-expanded={isOpen}
        aria-controls={id}
        onClick={() => setIsOpen((open) => !open)}
      >
        {avatar}
      </button>
      {isOpen && (
        <div id={id} className="account-popover" role="region" aria-label="계정 메뉴">
          <strong>{displayName}</strong>
          {children}
        </div>
      )}
    </div>
  );
}
