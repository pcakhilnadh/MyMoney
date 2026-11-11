import errno
import json
import os
import socket
import ssl
import traceback
from urllib.parse import urlsplit

from pydantic import ValidationError

from app.ai.provider import CONNECT_TIMEOUT_SECONDS, READ_TIMEOUT_SECONDS

TRACEBACK_MAX_CHARS = 2048
TRACEBACK_MAX_FRAMES = 20


class FoodFormatError(ValueError):
    MESSAGES = {
        "empty_food_analysis": "Empty food analysis",
        "invalid_food_header": "Invalid food analysis header",
        "invalid_food_row_count": "Invalid food analysis row count",
        "invalid_food_row": "Invalid food analysis row indentation",
        "invalid_food_columns": "Invalid food analysis columns",
    }

    def __init__(self, reason: str, row: int | None = None):
        self.reason = reason
        self.row = row
        super().__init__(self.MESSAGES[reason])


def traceback_text(exc: Exception) -> str:
    frames = traceback.extract_tb(exc.__traceback__, limit=-TRACEBACK_MAX_FRAMES)
    lines = [
        f'  File "{os.path.basename(frame.filename)}", line {frame.lineno}, in {frame.name}'
        for frame in frames
    ]
    message = FoodFormatError.MESSAGES[exc.reason] if isinstance(exc, FoodFormatError) else None
    suffix = type(exc).__name__ + (f": {message}" if message else "")
    header = "Traceback (most recent call last):\n"
    text = header + "\n".join([*lines, suffix])
    if len(text) > TRACEBACK_MAX_CHARS:
        marker = "[earlier traceback text truncated]\n"
        text = header + marker + text[-(TRACEBACK_MAX_CHARS - len(header) - len(marker)):]
    return text


def request_error_details(exc: Exception, endpoint: str) -> str:
    """Keep useful transport diagnostics without storing arbitrary exception messages."""
    try:
        host = urlsplit(endpoint).hostname
    except ValueError:
        host = None
    details: dict = {
        "kind": "provider_request_failure",
        "exception": type(exc).__name__,
        "endpoint_host": host,
        "connect_timeout_seconds": CONNECT_TIMEOUT_SECONDS,
        "read_timeout_seconds": READ_TIMEOUT_SECONDS,
        "traceback_text": traceback_text(exc),
    }
    chain = []
    seen: set[int] = set()
    pending = [exc]
    while pending and len(seen) < 20:
        current = pending.pop(0)
        if id(current) in seen:
            continue
        seen.add(id(current))
        entry: dict = {"type": type(current).__name__}
        if isinstance(current, OSError):
            if current.errno is not None:
                entry["errno"] = current.errno
                entry["errno_name"] = errno.errorcode.get(current.errno)
            winerror = getattr(current, "winerror", None)
            if isinstance(winerror, int):
                entry["winerror"] = winerror
        if isinstance(current, socket.gaierror):
            entry["kind"] = "dns_resolution"
        if isinstance(current, ssl.SSLCertVerificationError):
            entry["kind"] = "tls_certificate_verification"
            entry["verify_code"] = current.verify_code
        chain.append(entry)
        candidates = [current.__cause__, current.__context__, getattr(current, "reason", None), *current.args]
        pending.extend(candidate for candidate in candidates if isinstance(candidate, BaseException))
    details["exception_chain"] = chain
    return json.dumps(details)


def response_error_details(exc: Exception) -> str:
    details: dict = {"kind": "invalid_provider_response", "exception": type(exc).__name__}
    details["traceback_text"] = traceback_text(exc)
    details["traceback"] = [
        {"file": os.path.basename(frame.filename), "line": frame.lineno, "function": frame.name}
        for frame in traceback.extract_tb(exc.__traceback__, limit=-TRACEBACK_MAX_FRAMES)
    ]
    if isinstance(exc, FoodFormatError):
        details.update(reason=exc.reason, message=FoodFormatError.MESSAGES[exc.reason])
        if exc.row is not None:
            details["row"] = exc.row
    elif isinstance(exc, json.JSONDecodeError):
        details.update(reason="invalid_json", line=exc.lineno, column=exc.colno)
    elif isinstance(exc, ValidationError):
        details["reason"] = "schema_validation"
        details["validation_errors"] = [
            {"field": ".".join(str(part) for part in error["loc"]), "type": error["type"]}
            for error in exc.errors(include_url=False, include_context=False, include_input=False)
        ]
    elif isinstance(exc, (KeyError, IndexError)):
        details["reason"] = "missing_response_field"
    else:
        details["reason"] = "unexpected_response_structure"
    return json.dumps(details)
