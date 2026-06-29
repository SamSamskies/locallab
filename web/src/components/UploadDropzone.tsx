import { useCallback, useRef, useState } from "react";

interface UploadDropzoneProps {
  onUpload: (file: File) => void;
  disabled?: boolean;
}

export function UploadDropzone({ onUpload, disabled }: UploadDropzoneProps) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File | undefined) => {
      if (!file || disabled) return;
      if (!file.name.toLowerCase().endsWith(".pdf")) return;
      onUpload(file);
    },
    [onUpload, disabled],
  );

  const openFilePicker = () => {
    if (!disabled) inputRef.current?.click();
  };

  return (
    <div
      className={`dropzone ${dragging ? "dragging" : ""}`}
      onClick={openFilePicker}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openFilePicker();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFile(e.dataTransfer.files[0]);
      }}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
    >
      <input
        ref={inputRef}
        type="file"
        className="dropzone-input"
        accept="application/pdf,.pdf"
        disabled={disabled}
        tabIndex={-1}
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <div className="dropzone-icon">◈</div>
      <h3>Drop your lab PDF here</h3>
      <p>or click to browse</p>
      <p className="hint">Text-based PDFs only · Max 15 MB</p>
    </div>
  );
}
