"""Private weekly report: GitHub runner -> D1 Worker, then Telegram. No public artifacts."""
import datetime as dt
import json
import os
import re
import sys
import urllib.error
import urllib.request
import uuid
from zoneinfo import ZoneInfo

BASE = 'https://edofa-feedback.massi-sabato.workers.dev'
ROME = ZoneInfo('Europe/Rome')

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def token_from(value):
    clean = re.sub('[\u200b-\u200f\u2060\ufeff]', '', value).replace('\uff1a', ':')
    found = set(re.findall(r'(?<![A-Za-z0-9_-])(?:bot)?([0-9]+:[A-Za-z0-9_-]+)(?![A-Za-z0-9_-])', clean))
    if len(found) != 1:
        raise RuntimeError('Il segreto GitHub TELEGRAM_BOT_TOKEN non contiene una singola chiave riconoscibile.')
    return found.pop()

def week_window(now=None):
    now = (now or dt.datetime.now(dt.timezone.utc)).astimezone(ROME)
    end = dt.datetime.combine(now.date()-dt.timedelta(days=now.weekday()), dt.time(), ROME)
    start = end-dt.timedelta(days=7)
    iso = lambda value: value.astimezone(dt.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
    return start.date().isoformat(), iso(start), iso(end), start, end

def post(url, payload, headers=None, content_type='application/json'):
    body = json.dumps(payload).encode() if content_type == 'application/json' else payload
    request = urllib.request.Request(url, data=body, method='POST', headers={
        'Content-Type': content_type, 'User-Agent': 'EDo-Weekly-Report/1.0', **(headers or {})})
    try:
        with urllib.request.build_opener(NoRedirect).open(request, timeout=35) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        # Never emit exception URLs: Telegram URLs contain the bot token.
        raise RuntimeError('Il servizio ha rifiutato la richiesta HTTP '+str(error.code)+'.') from None
    except Exception:
        raise RuntimeError('Connessione al servizio non riuscita. Nessun dato riservato nei log.') from None

def telegram(token, method, payload, content_type='application/json'):
    result = post('https://api.telegram.org/bot'+token+'/'+method, payload, content_type=content_type)
    if result.get('ok') is not True:
        raise RuntimeError('Telegram non ha confermato la richiesta.')
    return result.get('result')

def worker(token, action, payload=None):
    return post(BASE+'/reports/'+action, payload or {}, {'Authorization': 'Bearer '+token})

def matching_chat(updates, code, now=None):
    if not re.fullmatch(r'[A-Za-z0-9_-]{16,100}', code):
        raise RuntimeError('Usa un codice di collegamento di almeno 16 caratteri, solo lettere, numeri, trattini.')
    now = now or dt.datetime.now(dt.timezone.utc).timestamp()
    chats = set()
    for update in updates:
        message = update.get('message', {})
        chat, sender = message.get('chat', {}), message.get('from', {})
        if (chat.get('type') == 'private' and sender.get('is_bot') is False
            and sender.get('id') == chat.get('id') and message.get('text') == '/edofa-report '+code
            and -30 <= now-message.get('date', 0) <= 1800):
            chats.add(str(chat['id']))
    if len(chats) != 1:
        raise RuntimeError('Non trovo una sola chat privata con il codice recente. Invia /edofa-report CODICE al tuo bot e riprova.')
    return chats.pop()

def report_text(rows, start, end):
    title = 'E.Do.-Fa | Feedback settimanali'
    period = start.strftime('%d/%m/%Y')+' - '+(end-dt.timedelta(days=1)).strftime('%d/%m/%Y')
    lines = [title, period, 'Messaggi ricevuti: '+str(len(rows)), '']
    for index, row in enumerate(rows, 1):
        date = dt.datetime.fromisoformat(row['created_at'].replace('Z', '+00:00')).astimezone(ROME)
        lines.extend([str(index)+'. '+row['title'], date.strftime('%d/%m/%Y %H:%M')+' | '+row['kind'],
                      row['message'], 'Riferimento: '+row['id'], '', '-'*40, ''])
    return '\n'.join(lines)

def send_document(token, chat, text, caption):
    boundary = 'edofa'+uuid.uuid4().hex
    chunks = []
    for name, value in {'chat_id': chat, 'caption': caption, 'protect_content': 'true'}.items():
        chunks.append(('--'+boundary+'\r\nContent-Disposition: form-data; name="'+name+'"\r\n\r\n'+value+'\r\n').encode())
    chunks.append(('--'+boundary+'\r\nContent-Disposition: form-data; name="document"; filename="EDo-feedback-settimanali.txt"\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n').encode())
    chunks.extend([text.encode('utf-8'), ('\r\n--'+boundary+'--\r\n').encode()])
    telegram(token, 'sendDocument', b''.join(chunks), 'multipart/form-data; boundary='+boundary)

def main():
    raw = os.environ.get('TELEGRAM_BOT_TOKEN', '')
    if not raw:
        print('Report non attivo: aggiungere il segreto GitHub TELEGRAM_BOT_TOKEN e completare il collegamento.')
        return
    token = token_from(raw)
    if os.environ.get('REPORT_MODE', 'report') == 'collega':
        telegram(token, 'getMe', {})  # Verify runner -> Telegram before changing configuration.
        updates = telegram(token, 'getUpdates', {'limit': 100, 'timeout': 0, 'allowed_updates': ['message']})
        chat = matching_chat(updates, os.environ.get('PAIRING_CODE', '').strip())
        state = worker(token, 'status')
        if state.get('enabled') and state.get('chat_id') != chat:
            raise RuntimeError('Esiste gia una chat diversa collegata al report. Nessuna modifica effettuata.')
        telegram(token, 'sendMessage', {'chat_id': chat, 'protect_content': True,
            'text': 'E.Do.-Fa: prova GitHub Actions riuscita. Report ogni lunedi alle 9:00, ora italiana, dopo il completamento del collegamento.'})
        result = worker(token, 'configure', {'chat_id': chat})
        if result.get('ok') is not True:
            raise RuntimeError('Prova Telegram riuscita, configurazione del report non completata.')
        print('Prova inviata e report settimanale collegato. Nessun dato personale pubblicato nei log.')
        return
    state = worker(token, 'status')
    if not state.get('enabled'):
        print('Report non attivo: completare il collegamento con esecuzione manuale collega.')
        return
    period, begin, finish, start, end = week_window()
    rows = []
    while True:
        page = worker(token, 'list', {'from': begin, 'to': finish, 'offset': len(rows)}).get('rows', [])
        rows.extend(page)
        if len(rows) > 50000:
            raise RuntimeError('Troppi feedback per un singolo report. Nessun invio parziale.')
        if len(page) < 200:
            break
    text = report_text(rows, start, end)
    if len(text.encode('utf-8')) > 10_000_000:
        raise RuntimeError('Report troppo grande. Nessun messaggio troncato o invio parziale.')
    claim = worker(token, 'claim', {'period': period})
    if not claim.get('claimed'):
        if claim.get('state') == 'inviato':
            print('Report di questa settimana gia inviato: nessun duplicato.')
            return
        raise RuntimeError('Esiste un tentativo precedente non completato. Controllare la chat prima di riprovare: nessun duplicato automatico.')
    caption = 'E.Do.-Fa | '+str(len(rows))+' feedback della settimana '+start.strftime('%d/%m')+' - '+(end-dt.timedelta(days=1)).strftime('%d/%m')+'\nPagina privata: '+BASE+'/admin'
    if rows:
        send_document(token, state['chat_id'], text, caption)
    else:
        telegram(token, 'sendMessage', {'chat_id': state['chat_id'], 'text': caption+'\nNessun nuovo feedback.', 'protect_content': True})
    if worker(token, 'complete', {'period': period}).get('ok') is not True:
        raise RuntimeError('Invio riuscito ma conferma nel database non completata. Controllare la chat prima di riprovare.')
    print('Report settimanale inviato e registrato. Contenuti privati assenti dai log.')

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('ERRORE: '+str(error) if isinstance(error, RuntimeError) else 'ERRORE: elaborazione non riuscita. Nessun dato riservato mostrato.')
        sys.exit(1)
