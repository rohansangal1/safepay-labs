"""A plain TCP forwarder: listen on one port, relay every connection to host:port.

Used by lab/docker/compose.inspect.yml so a browser on this machine can reach the sandbox while the
sandbox itself stays on the internal (no-egress) network. Standard library only.

    python tools/forward.py 8000 sandbox:8000
"""

import asyncio
import sys


async def pipe(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    try:
        while data := await reader.read(65536):
            writer.write(data)
            await writer.drain()
    finally:
        writer.close()


async def main(listen_port: int, target: str) -> None:
    host, _, port = target.rpartition(":")

    async def handle(client_reader, client_writer):
        try:
            upstream_reader, upstream_writer = await asyncio.open_connection(host, int(port))
        except OSError:
            client_writer.close()
            return
        await asyncio.gather(
            pipe(client_reader, upstream_writer),
            pipe(upstream_reader, client_writer),
            return_exceptions=True,
        )

    server = await asyncio.start_server(handle, "0.0.0.0", listen_port)
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    asyncio.run(main(int(sys.argv[1]), sys.argv[2]))
