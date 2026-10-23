'use strict';

const LIMIT = 2;
const MARKER = '<!-- edofa-feedback-limit-v1 -->';

function monthInRome(timestamp) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit',
  }).formatToParts(new Date(timestamp));
  return `${parts.find(p => p.type === 'year').value}-${parts.find(p => p.type === 'month').value}`;
}

function decideFeedback(current, issues) {
  const month = monthInRome(current.created_at);
  const unique = new Map(issues.map(issue => [issue.number, issue]));
  // Include the event itself even if listIssues has not caught up yet.
  unique.set(current.number, current);
  const candidates = [...unique.values()].filter(issue =>
    !issue.pull_request && issue.user.id === current.user.id &&
    monthInRome(issue.created_at) === month,
  ).sort((a, b) => new Date(a.created_at) - new Date(b.created_at) || a.number - b.number);
  const rank = candidates.findIndex(issue => issue.number === current.number) + 1;
  return {allowed: rank <= LIMIT, rank, limit: LIMIT, month};
}

async function moderate({github, context, core}) {
  const issue = context.payload.issue;
  if (!issue || issue.pull_request) return;
  const repo = context.repo;
  const month = monthInRome(issue.created_at);
  // Two days of overlap include the Italian month boundary and DST changes.
  const since = new Date(Date.parse(`${month}-01T00:00:00Z`) - 2 * 86400000).toISOString();
  const issues = await github.paginate(github.rest.issues.listForRepo, {
    ...repo, creator: issue.user.login, state: 'all', since,
    sort: 'created', direction: 'asc', per_page: 100,
  });
  const decision = decideFeedback(issue, issues);
  const labels = [
    {name: 'feedback', color: '16785f', description: 'Feedback e suggerimenti per E.Do.-Fa'},
    {name: 'limite-feedback', color: 'e3b65b', description: 'Oltre due feedback nello stesso mese per account'},
  ];
  for (const label of labels) {
    try { await github.rest.issues.createLabel({...repo, ...label}); }
    catch (error) { if (error.status !== 422) throw error; }
  }
  await github.rest.issues.addLabels({...repo, issue_number: issue.number,
    labels: decision.allowed ? ['feedback'] : ['feedback', 'limite-feedback']});
  if (decision.allowed) {
    core.info(`Feedback #${issue.number}: accepted (${decision.rank}/${LIMIT}, ${month}).`);
    return;
  }
  await github.rest.issues.update({...repo, issue_number: issue.number,
    state: 'closed', state_reason: 'not_planned'});
  const comments = await github.paginate(github.rest.issues.listComments, {
    ...repo, issue_number: issue.number, per_page: 100,
  });
  if (!comments.some(comment => comment.user?.type === 'Bot' && comment.body?.includes(MARKER))) {
    await github.rest.issues.createComment({...repo, issue_number: issue.number,
      body: `${MARKER}\nGrazie per il contributo. E.Do.-Fa accetta al massimo **due nuovi feedback al mese per account GitHub**.\n\nPer questo mese (${month}, fuso Europe/Rome) il limite è già stato raggiunto: questa segnalazione è stata chiusa automaticamente. Puoi aggiungere dettagli alle segnalazioni già accettate oppure inviare un nuovo feedback dal prossimo mese.\n\nIl controllo considera la data di creazione delle segnalazioni, anche se sono state chiuse. Non raccogliamo IP o indirizzi MAC con questo filtro.`});
  }
  core.info(`Feedback #${issue.number}: over limit (${decision.rank}/${LIMIT}, ${month}).`);
}

module.exports = moderate;
module.exports.decideFeedback = decideFeedback;
module.exports.monthInRome = monthInRome;
