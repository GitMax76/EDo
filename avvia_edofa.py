"""Open E.Do.-Fa locally using only Python's standard library."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading
import webbrowser


def main():
    parser = argparse.ArgumentParser(description='Avvia E.Do.-Fa nel browser')
    parser.add_argument('--no-browser', action='store_true')
    parser.add_argument('--port', type=int, default=0)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent / 'docs'
    if not (root / 'index.html').is_file():
        raise SystemExit('Estrai tutto lo ZIP prima di avviare E.Do.-Fa: manca la cartella docs.')
    handler = partial(SimpleHTTPRequestHandler, directory=str(root))
    with ThreadingHTTPServer(('127.0.0.1', args.port), handler) as server:
        url = f'http://127.0.0.1:{server.server_port}/'
        print('\nE.Do.-Fa - Editor Documenti Facile\n', flush=True)
        print(f'App pronta: {url}', flush=True)
        print('Il browser si apre automaticamente.', flush=True)
        print('Lascia aperta questa finestra mentre usi l\'app. Puoi ridurla a icona.', flush=True)
        print('Per terminare, chiudi questa finestra oppure premi Ctrl+C.\n', flush=True)
        if not args.no_browser:
            threading.Timer(.3, lambda: webbrowser.open(url, new=2)).start()
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == '__main__':
    main()
