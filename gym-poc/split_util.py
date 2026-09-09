"""
Deterministic train/valid/test assignment, grouped by source video.

Frames are sampled at ~1fps from a single video, so consecutive frames are
near-duplicates. Splitting them randomly puts visually identical frames in both
train and validation, which inflates accuracy and makes the number meaningless.
Grouping by source video guarantees every frame of a video lands in one bucket.

This md5 bucketing is mirrored exactly in jobs/harvest-roboflow-frames.ts
(videoGroupKey / splitForVideo) so the TypeScript and Python harvesters agree on
where any given video belongs. Change one, change the other.
"""

import hashlib
import re

SPLIT_TRAIN_PCT = 70
SPLIT_VALID_PCT = 20   # remainder (10%) goes to test


def video_group_key(source: str) -> str:
    """Stable identity for a source video — the YouTube id when one is present."""
    src = (source or "").strip()
    long_form = re.search(r"[?&]v=([\w-]+)", src)
    if long_form:
        return long_form.group(1)
    short_form = re.search(r"youtu\.be/([\w-]+)", src)
    if short_form:
        return short_form.group(1)
    return src


def split_for_video(source: str) -> str:
    """Deterministic per-video split assignment. Same source -> same split, always."""
    digest = hashlib.md5(video_group_key(source).encode("utf-8")).hexdigest()[:8]
    bucket = int(digest, 16) % 100
    if bucket < SPLIT_TRAIN_PCT:
        return "train"
    if bucket < SPLIT_TRAIN_PCT + SPLIT_VALID_PCT:
        return "valid"
    return "test"
