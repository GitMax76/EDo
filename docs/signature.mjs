// Local illumination estimate: a bright percentile per tile avoids treating
// uneven paper lighting as ink. This deliberately does not identify objects:
// the user must crop out the table, page edges and other dark marks.
export function cleanSignature(data, width, height, {threshold = 22, strength = 1.8} = {}) {
  const size = 32, cols = Math.ceil(width / size), rows = Math.ceil(height / size);
  const gray = new Float32Array(width * height), backgrounds = new Float32Array(cols * rows);
  for (let i = 0; i < gray.length; i++) {
    const a = data[i * 4 + 3] / 255;
    gray[i] = (data[i * 4] * .299 + data[i * 4 + 1] * .587 + data[i * 4 + 2] * .114) * a + 255 * (1 - a);
  }
  for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < cols; tx++) {
    const hist = new Uint32Array(256); let count = 0;
    for (let y = ty * size; y < Math.min(height, (ty + 1) * size); y++)
      for (let x = tx * size; x < Math.min(width, (tx + 1) * size); x++) { hist[Math.round(gray[y * width + x])]++; count++; }
    let sum = 0, value = 0;
    for (; value < 255; value++) { sum += hist[value]; if (sum >= count * .9) break; }
    backgrounds[ty * cols + tx] = value;
  }
  const at = (x, y) => backgrounds[Math.max(0, Math.min(rows - 1, y)) * cols + Math.max(0, Math.min(cols - 1, x))];
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const gx = (x + .5) / size - .5, gy = (y + .5) / size - .5;
    const ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy;
    const bg = (at(ix, iy) * (1 - fx) + at(ix + 1, iy) * fx) * (1 - fy) + (at(ix, iy + 1) * (1 - fx) + at(ix + 1, iy + 1) * fx) * fy;
    const ink = Math.max(0, (bg - gray[y * width + x]) * 255 / Math.max(bg, 40));
    out[(y * width + x) * 4 + 3] = Math.min(data[(y * width + x) * 4 + 3], Math.max(0, (ink - threshold) / 90 * strength * 255));
  }
  return out;
}

export function inkBounds(data, width, height) {
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (data[(y * width + x) * 4 + 3] > 12) {
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  if (right < 0) return null;
  const pad = 6;
  left = Math.max(0, left - pad); top = Math.max(0, top - pad);
  return {x: left, y: top, width: Math.min(width, right + pad + 1) - left, height: Math.min(height, bottom + pad + 1) - top};
}

// Coordinates are image pixels; clamp each edge independently so a moved or
// resized selection always stays inside the photo and never flips over.
export function adjustCrop(rect, mode, handle, start, end, width, height) {
  const limit = (n, min, max) => Math.round(Math.max(min, Math.min(max, n)));
  const minW = Math.min(4, width), minH = Math.min(4, height);
  const dx = end.x - start.x, dy = end.y - start.y;
  if (mode === 'move') return {...rect, x: limit(rect.x + dx, 0, width - rect.w), y: limit(rect.y + dy, 0, height - rect.h)};
  let left = rect.x, top = rect.y, right = left + rect.w, bottom = top + rect.h;
  if (mode === 'new') {
    left = limit(Math.min(start.x, end.x), 0, width - minW);
    top = limit(Math.min(start.y, end.y), 0, height - minH);
    right = limit(Math.max(start.x, end.x), left + minW, width);
    bottom = limit(Math.max(start.y, end.y), top + minH, height);
  } else {
    if (handle.includes('w')) left = limit(left + dx, 0, right - minW);
    if (handle.includes('e')) right = limit(right + dx, left + minW, width);
    if (handle.includes('n')) top = limit(top + dy, 0, bottom - minH);
    if (handle.includes('s')) bottom = limit(bottom + dy, top + minH, height);
  }
  return {x: left, y: top, w: right - left, h: bottom - top};
}
