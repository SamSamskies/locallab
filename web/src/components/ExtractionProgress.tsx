import { useEffect, useRef } from "react";

interface ExtractionProgressProps {
  status: string;
  contentText: string;
}

export function ExtractionProgress({
  status,
  contentText,
}: ExtractionProgressProps) {
  const outputRef = useRef<HTMLPreElement>(null);
  const hasOutput = contentText.length > 0;

  useEffect(() => {
    const el = outputRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [contentText]);

  return (
    <div className="card loading">
      <div className="spinner" />
      <p>{status}</p>
      <pre ref={outputRef} className="extraction-stream">
        {contentText ? (
          <span className="extraction-content">{contentText}</span>
        ) : null}
        {!hasOutput ? (
          <span className="extraction-waiting">Waiting for model output…</span>
        ) : null}
      </pre>
    </div>
  );
}
