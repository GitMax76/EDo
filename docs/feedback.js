const form = document.getElementById('feedback-form');
const dialog = document.getElementById('feedback-dialog');
const feedbackStatus = document.getElementById('feedback-status');
const submitFeedback = document.getElementById('feedback-submit');
const cancelFeedback = document.getElementById('feedback-cancel');
const feedbackEndpoint = 'https://edofa-feedback.massi-sabato.workers.dev/feedback';
let sendingFeedback = false, feedbackAttempt = null;
document.getElementById('feedback-open').addEventListener('click', () => {
  feedbackStatus.textContent = ''; dialog.showModal();
});
cancelFeedback.addEventListener('click', () => {if (!sendingFeedback) dialog.close();});
dialog.addEventListener('cancel', event => {if (sendingFeedback) event.preventDefault();});
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (sendingFeedback || !form.reportValidity()) return;
  const title = document.getElementById('feedback-title').value.trim();
  const message = document.getElementById('feedback-message').value.trim();
  const kind = document.getElementById('feedback-kind').value;
  if (title.length < 5 || message.length < 15) {
    feedbackStatus.textContent = 'Scrivi almeno 5 caratteri nel titolo e 15 nella descrizione.'; return;
  }
  // Identical retries keep their ID. No PDF state or document names are read.
  const signature = JSON.stringify({title, message, kind});
  if (!feedbackAttempt || feedbackAttempt.signature !== signature)
    feedbackAttempt = {signature, id: crypto.randomUUID()};
  const body = {id: feedbackAttempt.id, title, message, kind,
    website: document.getElementById('feedback-website').value};
  sendingFeedback = true; submitFeedback.disabled = true; cancelFeedback.disabled = true;
  form.setAttribute('aria-busy', 'true'); feedbackStatus.textContent = 'Invio in corso...';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(feedbackEndpoint, {
      method: 'POST', mode: 'cors', credentials: 'omit', cache: 'no-store',
      redirect: 'error', referrerPolicy: 'no-referrer',
      headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body), signal: controller.signal
    });
    let result;
    try {result = await response.json();} catch {
      throw new Error('Il servizio non risponde correttamente. Il testo resta qui: riprova tra poco.');
    }
    if (!response.ok || result.ok !== true)
      throw new Error(result.error || 'Invio non riuscito. Il testo resta qui: puoi riprovare.');
    form.reset(); feedbackAttempt = null;
    feedbackStatus.textContent = 'Grazie! Il tuo feedback e stato ricevuto. Puoi tornare al documento.';
  } catch (error) {
    feedbackStatus.textContent = error.name === 'AbortError'
      ? 'La risposta tarda ad arrivare. Il testo resta qui: puoi riprovare senza duplicare il messaggio.'
      : error instanceof TypeError
        ? 'Connessione al servizio non riuscita. Il testo resta qui: controlla Internet e riprova.'
        : error.message;
  } finally {
    clearTimeout(timer); sendingFeedback = false;
    submitFeedback.disabled = false; cancelFeedback.disabled = false; form.setAttribute('aria-busy', 'false');
  }
});
