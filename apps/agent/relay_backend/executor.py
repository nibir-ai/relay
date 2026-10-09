import asyncio
import time

import httpx
from fastapi import HTTPException

from .security import MAX_RESPONSE


async def send(client: httpx.AsyncClient, method: str, url: str, *, headers=None, query=None,
               content=None, limit=MAX_RESPONSE):
    started = time.perf_counter()
    try:
        async with asyncio.timeout(20):
            async with client.stream(method, url, headers=headers, params=query, content=content) as response:
                data = bytearray()
                truncated = False
                async for chunk in response.aiter_bytes(chunk_size=65536):
                    remaining = limit - len(data)
                    data.extend(chunk[:remaining])
                    if len(chunk) > remaining:
                        truncated = True
                        break
                return {"status": response.status_code, "reason": response.reason_phrase,
                        "headers": dict(response.headers), "body": data.decode(response.encoding or "utf-8", errors="replace"),
                        "content_type": response.headers.get("content-type", ""), "bytes": len(data),
                        "truncated": truncated, "duration_ms": round((time.perf_counter() - started) * 1000, 1),
                        "url": str(response.url), "method": method}
    except (httpx.TimeoutException, TimeoutError):
        raise HTTPException(504, "Request timed out after 20 seconds. Check the backend and try again.")
    except httpx.RequestError:
        raise HTTPException(502, "Could not connect to the configured API. Start your backend and check its address and port.")
