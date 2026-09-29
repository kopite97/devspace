import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import { ko } from '@blocknote/core/locales';
import { defaultBlockSpecs, type PartialBlock } from '@blocknote/core';
import '@blocknote/mantine/style.css';
import './styles.css';

function initialBlocks(content: unknown[]): PartialBlock[] | undefined {
  const visit = (blocks: unknown[]) => {
    for (const value of blocks) {
      if (!value || typeof value !== 'object') throw new Error('지원하지 않는 문서 구조입니다.');
      const block = value as Record<string, unknown>;
      if (typeof block.type !== 'string' || !Object.hasOwn(defaultBlockSpecs, block.type))
        throw new Error('지원하지 않는 문서 블록입니다.');
      if (block.children !== undefined) {
        if (!Array.isArray(block.children)) throw new Error('지원하지 않는 하위 블록입니다.');
        visit(block.children);
      }
    }
  };
  visit(content);
  return content.length ? (content as PartialBlock[]) : undefined;
}
export function BlockDocument({
  content,
  editable,
  uploadFile,
  onChange,
  onError,
}: {
  content: unknown[];
  editable: boolean;
  uploadFile?: (file: File) => Promise<string>;
  onChange?: (content: unknown[]) => void;
  onError: (message: string) => void;
}) {
  const editor = useCreateBlockNote({
    initialContent: initialBlocks(content),
    dictionary: ko,
    uploadFile: uploadFile
      ? async (file) => {
          try {
            return await uploadFile(file);
          } catch (error) {
            onError(error instanceof Error ? error.message : '파일을 업로드하지 못했습니다.');
            throw error;
          }
        }
      : undefined,
  });
  return (
    <div
      className={`document-blocks ${editable ? '' : 'document-readonly'}`}
      onErrorCapture={(event) => {
        if (event.target instanceof HTMLImageElement)
          onError('첨부 이미지를 불러오지 못했습니다. 권한과 연결을 확인한 후 다시 불러와 주세요.');
      }}
      onClickCapture={(event) => {
        if (
          !editable &&
          event.target instanceof HTMLElement &&
          event.target.closest('input[type="checkbox"]')
        ) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      <BlockNoteView
        editor={editor}
        editable={editable}
        theme="light"
        formattingToolbar={editable}
        linkToolbar={editable}
        slashMenu={editable}
        sideMenu={editable}
        filePanel={editable}
        tableHandles={editable}
        emojiPicker={editable}
        comments={false}
        onChange={() => {
          if (editable) onChange?.(structuredClone(editor.document));
        }}
      />
    </div>
  );
}
