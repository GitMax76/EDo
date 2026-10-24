import {cleanSignature, inkBounds} from './signature.mjs';

export async function prepareSignature(data) {
  const image = new Image(); image.src = data; await image.decode();
  return new Promise((resolve, reject) => {
    const dialog = document.createElement('dialog'); dialog.className = 'signature-dialog';
    dialog.setAttribute('aria-labelledby', 'signature-heading');
    dialog.innerHTML = `<h2 id="signature-heading">Immagine o firma</h2>
      <p>Per una foto normale scegli <b>Usa immagine originale</b>. Per una firma, ritaglia l’area sul foglio ed elimina lo sfondo.</p>
      <div class="signature-grid"><section><h3>1. Ritaglia intorno alla firma</h3>
      <p>Trascina sulla foto, anche con il dito. Escludi tavolo, bordi del foglio e scritte estranee.</p>
      <canvas class="signature-source" aria-label="Foto originale: trascina per scegliere il ritaglio"></canvas>
      <details><summary>Regola il ritaglio con i numeri</summary><div class="signature-margins">
      ${['Sinistra', 'Alto', 'Destra', 'Basso'].map((label, i) => `<label>${label} %<input data-margin="${i}" type="number" min="0" max="99" value="0"></label>`).join('')}</div></details>
      <button type="button" data-action="reset">Ripristina ritaglio</button></section>
      <section><h3>2. Controlla la firma pulita</h3><p>La scacchiera indica lo sfondo trasparente. Il tratto viene reso nero.</p>
      <div class="signature-checker"><canvas class="signature-preview" aria-label="Anteprima della firma su sfondo trasparente"></canvas></div>
      <button type="button" data-action="eraser" aria-pressed="false">Gomma: cancella i residui</button>
      <button type="button" data-action="restore">Ripristina cancellazioni</button>
      <label class="signature-slider">Dimensione gomma <input data-brush type="range" min="5" max="80" value="24"></label>
      <p>Attiva la gomma e passa sui segni estranei nell’anteprima. Deve rimanere soltanto la firma.</p>
      <label class="signature-slider">Rimuovi sfondo <input data-setting="threshold" type="range" min="4" max="100" value="22"><small>Verso destra elimina più ombre; verso sinistra recupera i tratti leggeri.</small></label>
      <label class="signature-slider">Intensità del nero <input data-setting="strength" type="range" min="0.6" max="3" step="0.1" value="1.8"></label>
      <p class="signature-message" role="status" aria-live="polite"></p></section></div>
      <div class="dialog-actions"><button type="button" data-action="cancel">Annulla</button><button type="button" data-action="original">Usa immagine originale</button><button type="button" data-action="download">Scarica PNG</button><button type="button" class="primary" data-action="insert">Inserisci firma pulita</button></div>`;
    document.body.append(dialog);
    const find = s => dialog.querySelector(s), source = find('.signature-source'), preview = find('.signature-preview');
    let crop, drag, frame, bounds, erasing = false, stroke;
    const mask = document.createElement('canvas'), maskContext = mask.getContext('2d');
    const margins = [...dialog.querySelectorAll('[data-margin]')];
    const context = source.getContext('2d'), result = preview.getContext('2d');
    const paint = () => {
      context.clearRect(0, 0, source.width, source.height); context.drawImage(image, 0, 0, source.width, source.height);
      context.fillStyle = '#10203088';
      context.fillRect(0, 0, source.width, crop.y); context.fillRect(0, crop.y + crop.h, source.width, source.height - crop.y - crop.h);
      context.fillRect(0, crop.y, crop.x, crop.h); context.fillRect(crop.x + crop.w, crop.y, source.width - crop.x - crop.w, crop.h);
      context.strokeStyle = '#16a878'; context.lineWidth = 3; context.strokeRect(crop.x, crop.y, crop.w, crop.h);
    };
    const update = () => {
      frame = null;
      preview.width = crop.w; preview.height = crop.h;
      result.drawImage(image, crop.x * image.width / source.width, crop.y * image.height / source.height,
        crop.w * image.width / source.width, crop.h * image.height / source.height, 0, 0, crop.w, crop.h);
      const pixels = result.getImageData(0, 0, crop.w, crop.h);
      pixels.data.set(cleanSignature(pixels.data, crop.w, crop.h, {
        threshold: Number(find('[data-setting="threshold"]').value), strength: Number(find('[data-setting="strength"]').value)
      }));
      result.putImageData(pixels, 0, 0);
      result.globalCompositeOperation = 'destination-out';
      result.drawImage(mask, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
      result.globalCompositeOperation = 'source-over';
      bounds = inkBounds(result.getImageData(0, 0, crop.w, crop.h).data, crop.w, crop.h);
      find('[data-action="insert"]').disabled = find('[data-action="download"]').disabled = !bounds;
      find('.signature-message').textContent = bounds ? 'Controlla che tutti i tratti siano presenti e che non restino segni estranei.' : 'Nessun tratto visibile: allarga il ritaglio o riduci la rimozione dello sfondo.';
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const setCrop = value => {
      crop = value; paint();
      [crop.x / source.width, crop.y / source.height, 1 - (crop.x + crop.w) / source.width, 1 - (crop.y + crop.h) / source.height].forEach((v, i) => margins[i].value = Math.max(0, v * 100).toFixed(1));
      schedule();
    };
    const point = event => { const r = source.getBoundingClientRect(); return {x: Math.max(0, Math.min(source.width - 1, (event.clientX - r.left) / r.width * source.width)), y: Math.max(0, Math.min(source.height - 1, (event.clientY - r.top) / r.height * source.height))}; };
    source.onpointerdown = event => { if(event.button !== 0 || drag) return; event.preventDefault(); drag = {...point(event), id: event.pointerId, old: {...crop}}; source.setPointerCapture(event.pointerId); };
    source.onpointermove = event => {
      if (!drag || drag.id !== event.pointerId) return;
      const p = point(event), x = Math.floor(Math.min(p.x, drag.x)), y = Math.floor(Math.min(p.y, drag.y));
      setCrop({x, y, w: Math.max(1, Math.ceil(Math.abs(p.x - drag.x))), h: Math.max(1, Math.ceil(Math.abs(p.y - drag.y)))});
    };
    source.onpointerup = event => { if (!drag || drag.id !== event.pointerId) return; if (crop.w < 4 || crop.h < 4) setCrop(drag.old); drag = null; source.releasePointerCapture(event.pointerId); };
    source.onpointercancel = () => { if (drag) setCrop(drag.old); drag = null; };
    source.onlostpointercapture = source.onpointercancel;
    margins.forEach(input => input.onchange = () => {
      const [left, top, right, bottom] = margins.map(m => Math.max(0, Math.min(99, Number(m.value) || 0)) / 100);
      if (left + right >= .99 || top + bottom >= .99) { setCrop(crop); return; }
      setCrop({x: Math.floor(left * source.width), y: Math.floor(top * source.height), w: Math.max(1, Math.floor((1 - left - right) * source.width)), h: Math.max(1, Math.floor((1 - top - bottom) * source.height))});
    });
    dialog.querySelectorAll('[data-setting]').forEach(input => input.oninput = schedule);
    find('[data-action="eraser"]').onclick = event => {
      erasing = !erasing; event.currentTarget.setAttribute('aria-pressed', String(erasing));
      event.currentTarget.textContent = erasing ? 'Gomma attiva: passa sui residui' : 'Gomma: cancella i residui';
      preview.style.cursor = erasing ? 'crosshair' : 'default';
    };
    find('[data-action="restore"]').onclick = () => { maskContext.clearRect(0, 0, mask.width, mask.height); schedule(); };
    const erase = event => {
      const r = preview.getBoundingClientRect();
      const p = {x: crop.x + (event.clientX - r.left) / r.width * crop.w, y: crop.y + (event.clientY - r.top) / r.height * crop.h};
      const radius = Number(find('[data-brush]').value) * crop.w / r.width / 2;
      maskContext.fillStyle = '#000'; maskContext.strokeStyle = '#000'; maskContext.lineWidth = radius * 2; maskContext.lineCap = 'round';
      maskContext.beginPath(); maskContext.arc(p.x, p.y, radius, 0, Math.PI * 2); maskContext.fill();
      if (stroke?.point) { maskContext.beginPath(); maskContext.moveTo(stroke.point.x, stroke.point.y); maskContext.lineTo(p.x, p.y); maskContext.stroke(); }
      stroke.point = p; schedule();
    };
    preview.onpointerdown = event => { if (!erasing || event.button !== 0 || stroke) return; event.preventDefault(); stroke = {id: event.pointerId}; preview.setPointerCapture(event.pointerId); erase(event); };
    preview.onpointermove = event => { if (stroke?.id === event.pointerId) erase(event); };
    preview.onpointerup = preview.onpointercancel = event => { if (stroke?.id !== event.pointerId) return; stroke = null; if (preview.hasPointerCapture(event.pointerId)) preview.releasePointerCapture(event.pointerId); };
    preview.onlostpointercapture = () => { stroke = null; };
    const output = () => {
      if (frame) { cancelAnimationFrame(frame); update(); }
      if (!bounds) return null;
      const canvas = document.createElement('canvas'); canvas.width = bounds.width; canvas.height = bounds.height;
      canvas.getContext('2d').drawImage(preview, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height);
      return canvas.toDataURL('image/png');
    };
    let settled = false;
    const finish = value => { if (settled) return; settled = true; if (frame) cancelAnimationFrame(frame); dialog.close(); dialog.remove(); resolve(value); };
    dialog.oncancel = event => { event.preventDefault(); finish(null); };
    find('[data-action="cancel"]').onclick = () => finish(null);
    find('[data-action="original"]').onclick = () => finish(data);
    find('[data-action="insert"]').onclick = () => { const value = output(); if (value) finish(value); };
    find('[data-action="reset"]').onclick = () => setCrop({x: 0, y: 0, w: source.width, h: source.height});
    find('[data-action="download"]').onclick = () => {
      const value = output(); if (!value) return;
      const a = document.createElement('a'); a.href = value; a.download = 'firma.png'; document.body.append(a); a.click(); a.remove();
    };
    try {
      const scale = Math.min(1, 1800 / Math.max(image.width, image.height));
      source.width = Math.max(1, Math.round(image.width * scale)); source.height = Math.max(1, Math.round(image.height * scale));
      mask.width = source.width; mask.height = source.height;
      setCrop({x: 0, y: 0, w: source.width, h: source.height});
      if(frame) cancelAnimationFrame(frame); update();
      dialog.showModal();
    } catch (error) { if (frame) cancelAnimationFrame(frame); dialog.remove(); reject(error); }
  });
}
