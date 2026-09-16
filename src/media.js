/** 解码本地栅格图片并压缩为小尺寸 JPEG，控制本机存储占用。 */
export async function compressImage(source) {
  const bitmap = await createImageBitmap(source);
  try {
    const ratio = Math.min(1, 960 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#18181b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const result = canvas.toDataURL('image/jpeg', 0.76);
    if (result.length > 800000) throw new Error('图片压缩后仍过大，请选择较小的图片。');
    return result;
  } finally {
    bitmap.close();
  }
}
