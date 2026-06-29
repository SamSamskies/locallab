import { useCallback, useState } from "react";

interface UploadDropzoneProps {
  onUpload: (file: File) => void;
  disabled?: boolean;
}

export function UploadDropzone({ onUpload, disabled }: UploadDropzoneProps) {
  const [dragging, setDragging] = useState(false);

  const handleFile = useCallback(
    (file: File | undefined) => {
      if (!file || disabled) return;
      if (!file.name.toLowerCase().endsWith(".pdf")) return;
      onUpload(file);
    },
    [onUpload, disabled],
  );

  return (
    <div
      className={`dropzone ${dragging ? "dragging" : ""}`}
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
    >
      <input
        type="file"
        accept="application/pdf,.pdf"
        disabled={disabled}
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <div className="dropzone-icon">◈</div>
      <h3>Drop your lab PDF here</h3>
      <p>or click to browse</p>
      <p className="hint">Text-based PDFs only · Max 15 MB</p>
    </div>
  );
}
