"""Local-only preview server. Python standard library; no packages required."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import argparse
import functools
import socket
import webbrowser

class LocalHTTPServer(ThreadingHTTPServer):
    # Windows 的 SO_REUSEADDR 允许不同版本同时监听一个端口，可能返回旧页面。
    allow_reuse_address = False
    def server_bind(self):
        if hasattr(socket, 'SO_EXCLUSIVEADDRUSE'):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8766)
    parser.add_argument(
        '--host',
        default='127.0.0.1',
        help='Listen address. Use 0.0.0.0 so phone H5 on LAN can open the room.',
    )
    parser.add_argument('--no-browser', action='store_true')
    parser.add_argument('--preview', choices=['qa', 'estate'], default=None)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    class Handler(SimpleHTTPRequestHandler):
        extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.mjs': 'text/javascript', '.js': 'text/javascript', '.glb': 'model/gltf-binary'}
        def end_headers(self):
            self.send_header('Cache-Control', 'no-cache')
            super().end_headers()
    handler = functools.partial(Handler, directory=str(root))
    host = args.host
    server = None
    for port in range(args.port, args.port + 10):
        try:
            server = LocalHTTPServer((host, port), handler)
            break
        except OSError:
            continue
    if server is None:
        raise SystemExit('No available local port. Try: python serve.py --port 8865')
    display_host = '127.0.0.1' if host in ('0.0.0.0', '::') else host
    url = f'http://{display_host}:{server.server_port}/'
    if args.preview:
        url += f'?preview={args.preview}'
    print(f'ORIGINAL PET ROOM: {url}', flush=True)
    if host in ('0.0.0.0', '::'):
        print('Listening on all interfaces (phone LAN OK). Press Ctrl+C to stop.', flush=True)
    else:
        print('Local only. Use --host 0.0.0.0 for phone H5. Press Ctrl+C to stop.', flush=True)
    if not args.no_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()

if __name__ == '__main__':
    main()
