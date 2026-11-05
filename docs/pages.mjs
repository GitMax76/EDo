// Page numbers always refer to the current visible order, including merged PDFs.
export function parsePageSelection(value, count) {
  if (!Number.isInteger(count) || count < 1) throw Error('Apri prima un PDF.');
  const text = String(value).trim();
  if (!text) throw Error('Indica almeno una pagina. Esempio: 1, 3-5.');
  const selected = new Set();
  for (const part of text.split(',')) {
    const match = /^\s*(\d+)\s*(?:[-–]\s*(\d+)\s*)?$/.exec(part);
    if (!match) throw Error('Usa numeri e intervalli separati da virgole. Esempio: 1, 3-5.');
    const first = Number(match[1]), last = Number(match[2] || match[1]);
    if (first < 1 || last > count || first > last) throw Error(`Scegli pagine da 1 a ${count}, con intervalli in ordine crescente.`);
    for (let number = first; number <= last; number++) selected.add(number - 1);
  }
  return [...selected].sort((a, b) => a - b);
}

export function duplicateForPage(element, width, height, {id, offset = 0} = {}) {
  const copy = JSON.parse(JSON.stringify(element));
  const factor = Math.min(1, width / copy.w, height / copy.h);
  copy.id = id;
  copy.w *= factor; copy.h *= factor;
  if (typeof copy.size === 'number') copy.size = Math.max(6, copy.size * factor);
  const shifted = (position, size, limit) => {
    const max = Math.max(0, limit - size);
    return Math.max(0, Math.min(max, position + (offset && position + offset > max ? -offset : offset)));
  };
  copy.x = shifted(copy.x, copy.w, width);
  copy.y = shifted(copy.y, copy.h, height);
  return copy;
}
