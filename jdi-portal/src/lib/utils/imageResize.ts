interface ResizeOptions {
  maxDim?: number;
  quality?: number;
}

// 업로드 전에 이미지 리사이즈 (Supabase Free는 서버 Transform 미지원이라 클라이언트에서 처리).
// 이미지가 아니거나 이미 충분히 작으면 원본 그대로 반환.
// GIF/SVG는 애니메이션·벡터 손실을 막기 위해 건드리지 않음.
export async function resizeImageIfNeeded(
  file: File,
  options: ResizeOptions = {},
): Promise<File> {
  const { maxDim = 1600, quality = 0.85 } = options;

  if (!file.type.startsWith("image/")) return file;
  if (file.type === "image/gif" || file.type === "image/svg+xml") return file;

  let img: HTMLImageElement;
  try {
    img = await loadImage(file);
  } catch {
    return file;
  }

  const { naturalWidth: w0, naturalHeight: h0 } = img;
  if (w0 <= maxDim && h0 <= maxDim) return file;

  const scale = Math.min(maxDim / w0, maxDim / h0);
  const w = Math.round(w0 * scale);
  const h = Math.round(h0 * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, w, h);

  // PNG는 투명도 유지 위해 그대로, 나머지(JPEG/WEBP 등)는 JPEG로 압축
  const outputType = file.type === "image/png" ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, outputType, quality),
  );
  if (!blob || blob.size >= file.size) return file;

  return new File([blob], file.name, {
    type: outputType,
    lastModified: file.lastModified,
  });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image load failed"));
    };
    img.src = url;
  });
}
