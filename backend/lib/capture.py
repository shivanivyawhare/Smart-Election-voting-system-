"""Capture payload helpers — parse, bound and discard biometric captures.

Raw face/liveness images are used for a single verification call and then dropped:
nothing here is ever written to the database or disk (spec §33).
"""

import base64
import binascii

MAX_CAPTURE_BYTES = 3_000_000


def data_url_to_bytes(data_url: str) -> bytes | None:
    """Parse a data:image/* URL to raw bytes. Returns None on any malformed input."""
    if not isinstance(data_url, str) or not data_url.startswith("data:image/"):
        return None
    try:
        _, b64 = data_url.split(",", 1)
        raw = base64.b64decode(b64, validate=False)
    except (ValueError, binascii.Error):
        return None
    if not raw:
        return None
    return raw[: MAX_CAPTURE_BYTES + 1]
