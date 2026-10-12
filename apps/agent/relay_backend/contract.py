"""Small contract digests, never request traffic or retained schema bodies."""
import hashlib
import json

SECTIONS = {"parameters": "Parameters", "requestBody": "Request body", "responses": "Responses", "security": "Authentication"}


def sections(endpoint):
    return {key: hashlib.sha256(json.dumps(endpoint.get(key), sort_keys=True).encode()).hexdigest() for key in SECTIONS}


def changes(prior, current):
    if not prior:
        return ["Contract (previous details unavailable)"]
    return [label for key, label in SECTIONS.items() if prior.get(key) != current.get(key)] or ["Contract"]
