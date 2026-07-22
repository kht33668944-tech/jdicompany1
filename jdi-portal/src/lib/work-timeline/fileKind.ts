export interface AttachmentKindInfo {
  label: string;
  colorClass: string; // Tailwind text color for the badge
  ext: string;
}

const KIND_BY_EXT: Record<string, { label: string; colorClass: string }> = {
  xls: { label: "Excel", colorClass: "text-emerald-600" },
  xlsx: { label: "Excel", colorClass: "text-emerald-600" },
  csv: { label: "CSV", colorClass: "text-emerald-600" },
  doc: { label: "Word", colorClass: "text-blue-600" },
  docx: { label: "Word", colorClass: "text-blue-600" },
  ppt: { label: "PPT", colorClass: "text-orange-600" },
  pptx: { label: "PPT", colorClass: "text-orange-600" },
  pdf: { label: "PDF", colorClass: "text-red-600" },
  hwp: { label: "한글", colorClass: "text-sky-600" },
  hwpx: { label: "한글", colorClass: "text-sky-600" },
  zip: { label: "압축", colorClass: "text-amber-600" },
  "7z": { label: "압축", colorClass: "text-amber-600" },
  rar: { label: "압축", colorClass: "text-amber-600" },
  txt: { label: "텍스트", colorClass: "text-slate-500" },
};

export function getAttachmentKind(fileName: string): AttachmentKindInfo {
  const ext = fileName.includes(".") ? fileName.split(".").pop()!.toLowerCase() : "";
  const known = KIND_BY_EXT[ext];
  return {
    label: known?.label ?? (ext ? ext.toUpperCase() : "파일"),
    colorClass: known?.colorClass ?? "text-slate-500",
    ext,
  };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
