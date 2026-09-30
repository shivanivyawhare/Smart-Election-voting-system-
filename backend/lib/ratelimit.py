"""In-memory sliding-window rate limiter.

Development substitute for a Redis-backed distributed limiter: same call surface,
single-process state. Documented in docs/security.md — swap the two functions for
Redis INCR/EXPIRE in production.
"""

import time
from collections import deque

_buckets: dict[str, deque] = {}


def check(key: str, limit: int, window_s: int) -> bool:
    """True if `key` is within `limit` hits per `window_s` seconds (does not consume a hit)."""
    now = time.monotonic()
    bucket = _buckets.setdefault(key, deque())
    while bucket and now - bucket[0] > window_s:
        bucket.popleft()
    return len(bucket) < limit


def hit(key: str, limit: int, window_s: int) -> bool:
    """Consume one hit for `key`; False when the limit is exhausted."""
    if not check(key, limit, window_s):
        return False
    _buckets[key].append(time.monotonic())
    return True
