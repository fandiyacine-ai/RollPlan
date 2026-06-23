"""
Extract frames from a video and upload them to Roboflow as a classification dataset.

Usage:
    # Single video:
    python3 extract_and_upload.py \
        --video path/to/video.mp4 \
        --class jlock \
        --api-key YOUR_KEY

    # Batch from a text file (one "class video_path" per line):
    python3 extract_and_upload.py \
        --batch sources.txt \
        --api-key YOUR_KEY

sources.txt format:
    jlock           /path/to/jlock_highlights.mp4
    kesa_gatame     /path/to/kesa_gatame.mp4
    heel_hook       /path/to/heelhook_reel.mp4
    # lines starting with # are ignored
"""

import argparse
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import cv2
from roboflow import Roboflow

API_KEY   = "9qRhtkZOTlh4C38sjI2W"
WORKSPACE = "hello-rollplan-ai"
PROJECT   = "bjj-submissions"
# Current trained version — update after each retrain
CURRENT_VERSION = 6

# Extract one frame every N seconds of video
FRAME_INTERVAL_S = 0.5

# Skip first and last N seconds (often just intro/outro)
SKIP_START_S = 3
SKIP_END_S   = 3

# Minimum image dimension to bother uploading
MIN_DIM = 100


def extract_frames(video_path: str, class_name: str, out_dir: Path) -> list[Path]:
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total / fps

    step = max(1, int(fps * FRAME_INTERVAL_S))
    start_f = int(SKIP_START_S * fps)
    end_f   = max(start_f + 1, total - int(SKIP_END_S * fps))

    class_dir = out_dir / class_name
    class_dir.mkdir(parents=True, exist_ok=True)

    stem = Path(video_path).stem
    saved = []
    frame_idx = 0

    print(f"  Extracting from {Path(video_path).name}  ({duration:.0f}s, {fps:.0f}fps)")

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        if frame_idx >= start_f and frame_idx <= end_f and frame_idx % step == 0:
            h, w = frame.shape[:2]
            if min(h, w) >= MIN_DIM:
                out_path = class_dir / f"{stem}_f{frame_idx:06d}.jpg"
                cv2.imwrite(str(out_path), frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
                saved.append(out_path)
        frame_idx += 1

    cap.release()
    print(f"  Extracted {len(saved)} frames → {class_dir}")
    return saved


def upload_frames(frames: list[Path], class_name: str, split: str = "train") -> tuple[int, int]:
    rf = Roboflow(api_key=API_KEY)
    proj = rf.workspace(WORKSPACE).project(PROJECT)

    ok = fail = 0

    def _up(img_path):
        try:
            proj.single_upload(
                image_path=str(img_path),
                annotation_path=class_name,
                split=split,
                num_retry_uploads=2,
            )
            return True
        except Exception:
            return False

    with ThreadPoolExecutor(max_workers=12) as pool:
        futures = {pool.submit(_up, f): f for f in frames}
        for i, fut in enumerate(as_completed(futures), 1):
            if fut.result():
                ok += 1
            else:
                fail += 1
            if i % 100 == 0:
                print(f"    uploaded {i}/{len(frames)}  ok={ok}  fail={fail}", flush=True)

    return ok, fail


def process_one(video_path: str, class_name: str, frames_dir: Path):
    if not os.path.exists(video_path):
        print(f"  SKIP — file not found: {video_path}")
        return

    print(f"\n[{class_name}] {video_path}")
    frames = extract_frames(video_path, class_name, frames_dir)
    if not frames:
        print("  No frames extracted.")
        return

    print(f"  Uploading {len(frames)} frames as class '{class_name}' ...")
    ok, fail = upload_frames(frames, class_name)
    print(f"  Done: {ok} uploaded, {fail} failed")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-key", default=API_KEY)
    parser.add_argument("--video", help="Single video path")
    parser.add_argument("--class", dest="class_name", help="Class label for --video")
    parser.add_argument("--batch", help="Text file with 'class  video_path' lines")
    parser.add_argument("--frames-dir", default="extra_data/video_frames",
                        help="Where to save extracted frames")
    args = parser.parse_args()

    frames_dir = Path(args.frames_dir)
    frames_dir.mkdir(parents=True, exist_ok=True)

    if args.batch:
        jobs = []
        with open(args.batch) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                parts = line.split(None, 1)
                if len(parts) == 2:
                    jobs.append((parts[1].strip(), parts[0].strip()))
        print(f"Batch: {len(jobs)} videos")
        for video_path, class_name in jobs:
            process_one(video_path, class_name, frames_dir)

    elif args.video and args.class_name:
        process_one(args.video, args.class_name, frames_dir)

    else:
        parser.print_help()
        sys.exit(1)

    print("\nAll done. Go to Roboflow → bjj-submissions → Generate new version → Train.")


if __name__ == "__main__":
    main()
