export const ALLOWED_FILE_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export function fileType(file: File): string | null {
  const match = (file.name || "").toLowerCase().match(/\.[^.]+$/);
  return match ? ALLOWED_FILE_TYPES[match[0]] || null : null;
}

export function validateFiles(files: File[]): boolean {
  return files.every((file) => fileType(file) !== null);
}
