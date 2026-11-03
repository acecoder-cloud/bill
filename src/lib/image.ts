"use client";

const MAX_WIDTH = 1600;
const MAX_HEIGHT = 2400;

/**
 * Shrink a camera photo in the browser before upload (max ~1600px wide, JPEG).
 * Honors EXIF rotation, so photos taken sideways come out the right way up.
 */
export async function compressImage(file: File, quality = 0.82): Promise<Blob> {
  let source: ImageBitmap | HTMLImageElement;
  try {
    source = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    source = await loadImageElement(file); // older Safari
  }
  const w0 = "naturalWidth" in source ? source.naturalWidth : source.width;
  const h0 = "naturalHeight" in source ? source.naturalHeight : source.height;
  const scale = Math.min(1, MAX_WIDTH / w0, MAX_HEIGHT / h0);
  const w = Math.max(1, Math.round(w0 * scale));
  const h = Math.max(1, Math.round(h0 * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser could not process the photo.");
  ctx.fillStyle = "#fff"; // PNGs with transparency become white, not black
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, w, h);
  if ("close" in source) source.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("Could not compress the photo.");
  return blob;
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file is not an image we can read. Try a JPG or PNG photo."));
    };
    img.src = url;
  });
}
