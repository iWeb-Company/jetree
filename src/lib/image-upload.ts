import { MAX_IMAGE_BYTES, MAX_IMAGE_UPLOAD_BYTES } from './chat-images';

export async function prepareImageUpload(file: File): Promise<Blob> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Usá JPG, PNG o WebP.');
  if (!file.size || file.size > MAX_IMAGE_BYTES) throw new Error('La imagen debe pesar hasta 5 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 16_000_000) throw new Error('La imagen supera 16 millones de píxeles.');
    const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d'); if (!context) throw new Error('No se pudo preparar la imagen.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const lossless = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    if (lossless && lossless.size < MAX_IMAGE_UPLOAD_BYTES - 1024) return lossless;
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.9, 0.75, 0.6, 0.4]) {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (blob && blob.size < MAX_IMAGE_UPLOAD_BYTES - 1024) return blob;
    }
    throw new Error('La imagen sigue siendo demasiado grande. Reducí su tamaño.');
  } finally { bitmap.close(); }
}
