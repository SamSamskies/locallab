import { useEffect, useRef } from "react";

interface ExtractionProgressProps {
  status: string;
  thinkingText: string;
  contentText: string;
}

export function ExtractionProgress({
  status,
  thinkingText,
  contentText,
}: ExtractionProgressProps) {
  const outputRef = useRef<HTMLPreElement>(null);
  const hasOutput = thinkingText.length > 0 || contentText.length > 0;

  useEffect(() => {
    const el = outputRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [thinkingText, contentText]);

  return (
    <div className="card loading">
      <div className="spinner" />
      <p>{status}</p>
      <pre ref={outputRef} className="extraction-stream">
        {thinkingText ? (
          <span className="extraction-thinking">{thinkingText}</span>
        ) : null}
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
