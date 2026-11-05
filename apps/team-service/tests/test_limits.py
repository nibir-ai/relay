import asyncio

import pytest

from relay_team.limits import HTTP_BODY_LIMIT, HTTPBodyLimit
import relay_team.limits as limits


def exercise(chunks, headers=()):
    sent, delivered, reads = [], [], []
    messages = iter(chunks)

    async def receive():
        reads.append(True)
        return next(messages)

    async def send(message):
        sent.append(message)

    async def app(scope, receive, send):
        delivered.append(await receive())

    asyncio.run(HTTPBodyLimit(app)({"type": "http", "headers": headers}, receive, send))
    return sent, delivered, len(reads)


@pytest.mark.parametrize("headers", [(), ((b"content-length", b"1"),)])
def test_chunked_body_cannot_bypass_limit_or_reach_parser(headers):
    sent, delivered, reads = exercise([
        {"type": "http.request", "body": b"x" * HTTP_BODY_LIMIT, "more_body": True},
        {"type": "http.request", "body": b"x", "more_body": True},
        {"type": "http.request", "body": b"never read", "more_body": False},
    ], headers)
    assert sent[0]["status"] == 413
    assert delivered == []
    assert reads == 2


@pytest.mark.parametrize("value", [b"65537", b"9" * 5000, b"00065537"])
def test_oversized_content_length_is_rejected_without_reading(value):
    sent, delivered, reads = exercise([], ((b"content-length", value),))
    assert sent[0]["status"] == 413
    assert delivered == [] and reads == 0


def test_exact_limit_and_empty_body_are_delivered_intact():
    for body in (b"", b"x" * HTTP_BODY_LIMIT):
        sent, delivered, reads = exercise([
            {"type": "http.request", "body": body[:10], "more_body": True},
            {"type": "http.request", "body": body[10:], "more_body": False},
        ])
        assert not sent and reads == 2
        assert delivered == [{"type": "http.request", "body": body, "more_body": False}]


def test_disconnect_does_not_invoke_parser():
    sent, delivered, _ = exercise([{"type": "http.disconnect"}])
    assert sent == [] and delivered == []


@pytest.mark.parametrize("drip", [False, True])
def test_incomplete_body_has_one_deadline_and_never_reaches_parser(monkeypatch, drip):
    monkeypatch.setattr(limits, "HTTP_BODY_TIMEOUT", .03)

    async def check():
        sent, delivered, cancelled = [], [], []
        reads = 0

        async def receive():
            nonlocal reads
            reads += 1
            try:
                if drip:
                    await asyncio.sleep(.005)
                    return {"type": "http.request", "body": b"x", "more_body": True}
                await asyncio.Event().wait()
            except asyncio.CancelledError:
                cancelled.append(True)
                raise

        async def send(message):
            sent.append(message)

        async def app(*_):
            delivered.append(True)

        await asyncio.wait_for(HTTPBodyLimit(app)({"type": "http", "headers": []}, receive, send), 1)
        assert sent[0]["status"] == 408
        assert (b"cache-control", b"no-store") in sent[0]["headers"]
        assert not delivered and cancelled
        assert reads >= 1
        assert b"timed out" in sent[-1]["body"]

    asyncio.run(check())


def test_body_deadline_does_not_limit_application_execution(monkeypatch):
    monkeypatch.setattr(limits, "HTTP_BODY_TIMEOUT", .01)

    async def check():
        sent = []

        async def receive():
            return {"type": "http.request", "body": b"{}", "more_body": False}

        async def send(message):
            sent.append(message)

        async def app(scope, receive, send):
            await asyncio.sleep(.03)
            assert (await receive())["body"] == b"{}"
            await send({"type": "http.response.start", "status": 200, "headers": []})

        await HTTPBodyLimit(app)({"type": "http", "headers": []}, receive, send)
        assert sent[0]["status"] == 200

    asyncio.run(check())


def test_server_cancellation_is_not_converted_to_timeout():
    async def check():
        reading = asyncio.Event()
        sent = []

        async def receive():
            reading.set()
            await asyncio.Event().wait()

        async def send(message):
            sent.append(message)

        async def app(*_):
            pytest.fail("Incomplete request reached application")

        task = asyncio.create_task(HTTPBodyLimit(app)({"type": "http", "headers": []}, receive, send))
        await reading.wait()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert not sent

    asyncio.run(check())


def test_oversized_response_send_is_outside_body_deadline(monkeypatch):
    monkeypatch.setattr(limits, "HTTP_BODY_TIMEOUT", .005)

    async def check():
        statuses = []

        async def receive():
            return {"type": "http.request", "body": b"x" * (HTTP_BODY_LIMIT + 1)}

        async def send(message):
            if message["type"] == "http.response.start":
                statuses.append(message["status"])
            await asyncio.sleep(.01)

        async def app(*_):
            pytest.fail("Oversized request reached application")

        await HTTPBodyLimit(app)({"type": "http", "headers": []}, receive, send)
        assert statuses == [413]

    asyncio.run(check())
