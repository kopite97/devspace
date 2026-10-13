export function JournalDescription({ description }: { description: string }) {
  const isLong = description.length > 180 || description.split('\n').length > 3;
  return (
    <section className="journal-viewer" aria-label="일지 설명">
      <h2 className="journal-description-label">일지 설명</h2>
      {isLong ? (
        <details className="journal-description-disclosure">
          <summary>
            <span className="journal-description-preview">
              {description.slice(0, 180).trimEnd()}…
            </span>
            <span className="journal-description-more">설명 전체 보기</span>
            <span className="journal-description-less">설명 접기</span>
          </summary>
          <p className="detail-body">{description}</p>
        </details>
      ) : (
        <p className="detail-body">{description}</p>
      )}
    </section>
  );
}
