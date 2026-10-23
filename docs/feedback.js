const form = document.getElementById('feedback-form');
const dialog = document.getElementById('feedback-dialog');
document.getElementById('feedback-open').addEventListener('click', () => dialog.showModal());
document.getElementById('feedback-cancel').addEventListener('click', () => dialog.close());
form.addEventListener('submit', event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const title = document.getElementById('feedback-title').value.trim();
  const message = document.getElementById('feedback-message').value.trim();
  if (title.length < 5 || message.length < 15) return;
  const kind = document.getElementById('feedback-kind').value;
  const url = new URL('https://github.com/GitMax76/EDo/issues/new');
  url.searchParams.set('template', 'feedback.md');
  url.searchParams.set('title', `[Feedback] ${title}`);
  url.searchParams.set('body', `## Tipo\n${kind}\n\n## Descrizione\n${message}\n\n---\nInviato da E.Do.-Fa Web 0.7.0-beta.\nNessun PDF allegato automaticamente.\n`);
  // The visitor reviews and submits the public issue on GitHub themselves.
  const link = document.createElement('a');
  link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
  document.body.append(link); link.click(); link.remove();
  dialog.close();
});
