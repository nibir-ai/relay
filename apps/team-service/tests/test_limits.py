import asyncio

import pytest

from relay_team.limits import HTTP_BODY_LIMIT, HTTPBodyLimit


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
