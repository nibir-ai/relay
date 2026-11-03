"""Bound HTTP input before the application buffers or parses JSON."""
from starlette.responses import JSONResponse


HTTP_BODY_LIMIT = 64 * 1024


class HTTPBodyLimit:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        async def reject():
            await JSONResponse(
                {"detail": "HTTP request body exceeds 64 KiB."}, status_code=413,
                headers={"Cache-Control": "no-store"},
            )(scope, receive, send)

        for name, value in scope.get("headers", []):
            if name.lower() == b"content-length" and value.isdigit():
                # Compare bounded strings instead of parsing arbitrarily large integers.
                length = value.lstrip(b"0") or b"0"
                if len(length) > 5 or (len(length) == 5 and length > b"65536"):
                    return await reject()

        body = bytearray()
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            chunk = message.get("body", b"")
            if len(body) + len(chunk) > HTTP_BODY_LIMIT:
                return await reject()
            body.extend(chunk)
            if not message.get("more_body", False):
                break

        pending = bytes(body)

        async def replay():
            nonlocal pending
            if pending is not None:
                payload, pending = pending, None
                return {"type": "http.request", "body": payload, "more_body": False}
            return await receive()

        await self.app(scope, replay, send)
