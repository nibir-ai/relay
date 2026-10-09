import hashlib
import json

from .security import METHODS, validate_path


class SpecError(ValueError):
    pass


def normalize(spec: dict) -> dict:
    if not isinstance(spec, dict) or not str(spec.get("openapi", "")).startswith(("3.0.", "3.1.")):
        raise SpecError("Relay supports OpenAPI 3.0 and 3.1 JSON documents.")
    if not isinstance(spec.get("paths"), dict) or not isinstance(spec.get("info"), dict):
        raise SpecError("OpenAPI needs an info object and a paths object.")
    if not isinstance(spec["info"].get("title", "API"), str) or not isinstance(spec["info"].get("version", ""), str):
        raise SpecError("OpenAPI info title and version must be strings.")

    def validate_schema(schema):
        if isinstance(schema, bool):
            return  # OpenAPI 3.1 permits boolean schemas; JSON editing remains available.
        if not isinstance(schema, dict):
            raise SpecError("Schema must be an object or a boolean.")
        if "properties" in schema:
            if not isinstance(schema["properties"], dict):
                raise SpecError("Schema properties must be an object.")
            for child in schema["properties"].values():
                validate_schema(child)
        for key in ("required", "enum", "anyOf", "allOf", "oneOf"):
            if key in schema and not isinstance(schema[key], list):
                raise SpecError(f"Invalid schema {key} definition.")
        for key in ("anyOf", "allOf", "oneOf"):
            for child in schema.get(key, []):
                validate_schema(child)
        if "items" in schema:
            validate_schema(schema["items"])

    def validate_content(owner):
        if "content" not in owner:
            return
        if not isinstance(owner["content"], dict):
            raise SpecError("OpenAPI content must be an object.")
        for media in owner["content"].values():
            if not isinstance(media, dict):
                raise SpecError("Invalid media type definition.")
            if "schema" in media:
                validate_schema(media["schema"])

    def resolve(value, stack=(), depth=0):
        if depth > 40:
            return {"x-relay-warning": "Schema is too deeply nested; inspect the raw spec."}
        if isinstance(value, list):
            return [resolve(v, stack, depth + 1) for v in value]
        if not isinstance(value, dict):
            return value
        if "$ref" in value:
            ref = value["$ref"]
            if not isinstance(ref, str) or not ref.startswith("#/"):
                return {"$ref": ref, "x-relay-warning": "External references are not fetched."}
            if ref in stack:
                return {"$ref": ref, "x-relay-warning": "Recursive schema; edit JSON directly."}
            target = spec
            try:
                for key in ref[2:].split("/"):
                    target = target[key.replace("~1", "/").replace("~0", "~")]
            except (KeyError, TypeError):
                raise SpecError(f"Unresolved internal reference: {ref}")
            merged = resolve(target, (*stack, ref), depth + 1)
            return {**merged, **{k: resolve(v, stack, depth + 1) for k, v in value.items() if k != "$ref"}}
        return {k: resolve(v, stack, depth + 1) for k, v in value.items()}

    endpoints = []
    for path, raw_item in spec["paths"].items():
        validate_path(path)
        item = resolve(raw_item)
        if not isinstance(item, dict):
            raise SpecError(f"Invalid path definition: {path}")
        for method, operation in item.items():
            if method.upper() not in METHODS:
                continue
            if not isinstance(operation, dict) or not isinstance(operation.get("responses"), dict):
                raise SpecError(f"Missing responses for {method.upper()} {path}")
            if any(not isinstance(operation.get(key, ""), str) for key in ("summary", "description")):
                raise SpecError(f"Summary and description must be text for {method.upper()} {path}")
            if not isinstance(operation.get("tags", []), list) or any(not isinstance(tag, str) for tag in operation.get("tags", [])):
                raise SpecError(f"Tags must be a list of strings for {method.upper()} {path}")
            for response in operation["responses"].values():
                if not isinstance(response, dict) or not isinstance(response.get("description", ""), str):
                    raise SpecError(f"Invalid response definition for {method.upper()} {path}")
                validate_content(response)
            request_body = operation.get("requestBody")
            if request_body is not None and (not isinstance(request_body, dict) or not isinstance(request_body.get("content"), dict)):
                raise SpecError(f"Request body needs a content object for {method.upper()} {path}")
            if request_body:
                validate_content(request_body)
            security = operation.get("security", spec.get("security", []))
            if not isinstance(security, list) or any(not isinstance(group, dict) for group in security):
                raise SpecError(f"Invalid security requirements for {method.upper()} {path}")
            params = {}
            for param in [*item.get("parameters", []), *operation.get("parameters", [])]:
                if not isinstance(param, dict) or "name" not in param or "in" not in param:
                    raise SpecError(f"Invalid parameter for {method} {path}")
                if not isinstance(param["name"], str) or param["in"] not in {"path", "query", "header", "cookie"}:
                    raise SpecError(f"Invalid parameter name or location for {method} {path}")
                if "schema" in param:
                    validate_schema(param["schema"])
                params[(param["name"], param["in"])] = param
            contract = {"method": method.upper(), "path": path, "parameters": [params[key] for key in sorted(params)],
                        "requestBody": operation.get("requestBody"), "responses": operation["responses"],
                        "security": operation.get("security", spec.get("security", []))}
            digest = hashlib.sha256(json.dumps(contract, sort_keys=True).encode()).hexdigest()
            endpoints.append({**contract, "id": f"{method.upper()} {path}", "fingerprint": digest,
                              "summary": operation.get("summary", path), "description": operation.get("description", ""),
                              "tags": operation.get("tags") or ["General"], "deprecated": operation.get("deprecated", False)})
    return {"title": spec["info"].get("title", "API"), "version": spec["info"].get("version", ""),
            "endpoints": endpoints, "securitySchemes": resolve(spec.get("components", {}).get("securitySchemes", {})),
            "hash": hashlib.sha256(json.dumps(spec, sort_keys=True).encode()).hexdigest()}
