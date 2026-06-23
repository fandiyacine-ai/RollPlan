"""
RollPlan Gym PoC — BJJ position detection on gym camera footage.

Usage:
    pip install inference opencv-python torch torchvision
    python analyse.py --api-key YOUR_ROBOFLOW_KEY --video ../Test\ Video/IMG_0715_3.mov

Two-layer detection:
  Layer 1 — bjj3/1 (Roboflow): 18 BJJ positions (standing, guard, mount, etc.)
  Layer 2 — EfficientNet-B0 (local): submission classifier triggered only on ground positions
"""

import argparse
import json
import os
import sys
import time
from collections import deque
from pathlib import Path

# ── Config ───────────────────────────────────────────────────────────────────

MODEL_ID = "bjj3/1"

# Sample rate: analyse one frame every SAMPLE_EVERY_N frames.
SAMPLE_EVERY_N = 6

# Minimum confidence to record a detection (0–1).
MIN_CONFIDENCE = 0.30

# Temporal smoothing: majority-vote over last N inference results.
# At 5fps analysis rate, N=5 → 1 second of smoothing.
SMOOTHING_WINDOW = 5

# Ground positions that warrant a submission check.
GROUND_POSITIONS = {
    "back1", "back2", "mount1", "mount2",
    "closed_guard1", "closed_guard2", "open_guard1", "open_guard2",
    "half_guard1", "half_guard2", "side_control1", "side_control2",
    "turtle1", "turtle2", "5050_guard",
}

# Roboflow hosted submission classifier (trained on bjj-submissions v5).
SUBMISSION_MODEL_ID = "bjj-submissions/6"

# Merge gi/nogi variants into canonical class names for cleaner output.
_CLASS_MERGE = {
    "americana_gi": "americana", "americana_nogi": "americana",
    "darce_gi": "darce_choke", "darce_nogi": "darce_choke",
    "gi_guillotine": "guillotine", "guillotine_nogi": "guillotine",
    "gi_heelhook": "heel_hook", "heelhook_nogi": "heel_hook",
    "gi_kimura": "kimura", "kimura_nogi_triangle": "kimura",
    "gi_toehold": "toehold", "nogi_toehold": "toehold",
    "gi_triangle": "triangle", "nogi_triangle": "triangle",
}

# Minimum confidence to show a submission label (higher threshold than position).
SUBMISSION_MIN_CONF = 0.35

# ── Submission classifier ─────────────────────────────────────────────────────

_submission_model = None

def _load_submission_model(api_key: str):
    global _submission_model
    if _submission_model is not None:
        return
    try:
        from inference import get_model
        _submission_model = get_model(model_id=SUBMISSION_MODEL_ID, api_key=api_key)
        print(f"  [submission] Loaded Roboflow model {SUBMISSION_MODEL_ID}")
    except Exception as e:
        print(f"  [submission] Could not load submission model: {e}")


def classify_submission(frame, bbox):
    """Crop to bbox, run Roboflow submission classifier. Returns (class, conf) or None."""
    if _submission_model is None:
        return None

    bx, by, bw, bh = bbox["x"], bbox["y"], bbox["w"], bbox["h"]
    x1, y1 = max(0, int(bx - bw / 2)), max(0, int(by - bh / 2))
    x2, y2 = min(frame.shape[1], int(bx + bw / 2)), min(frame.shape[0], int(by + bh / 2))
    if x2 <= x1 or y2 <= y1:
        return None

    crop = frame[y1:y2, x1:x2]
    try:
        results = _submission_model.infer(crop)[0]
        if not results.predictions:
            return None
        top = max(results.predictions, key=lambda p: p.confidence)
        if top.confidence < SUBMISSION_MIN_CONF:
            return None
        label = _CLASS_MERGE.get(top.class_name, top.class_name)
        return (label, round(top.confidence, 3))
    except Exception:
        return None


# ── Helpers ──────────────────────────────────────────────────────────────────

def load_model(api_key: str, model_id: str = MODEL_ID):
    try:
        from inference import get_model
    except ImportError:
        sys.exit("Missing dependency. Run: pip install inference")
    print(f"Loading position model {model_id} …")
    _load_submission_model(api_key)
    return get_model(model_id=model_id, api_key=api_key)


def analyse_video(model, video_path: str, roi: tuple = None) -> list[dict]:
    """
    roi: optional (x1, y1, x2, y2) in pixels to restrict analysis to one mat.
         Bounding boxes in output are translated back to full-frame coordinates.
    """
    try:
        import cv2
    except ImportError:
        sys.exit("Missing dependency. Run: pip install opencv-python")

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        sys.exit(f"Cannot open video: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width  = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    duration_s = total_frames / fps

    print(f"Video: {width}×{height}  {fps:.1f}fps  {duration_s:.0f}s ({duration_s/60:.1f} min)")
    print(f"Sampling every {SAMPLE_EVERY_N} frames (~{fps/SAMPLE_EVERY_N:.1f} analyses/sec of footage)")
    print()

    # ── Output video writer (annotated) ─────────────────────────────────────
    out_path = str(Path(video_path).with_suffix("")) + "_annotated.mp4"
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(out_path, fourcc, fps, (width, height))

    timeline = []
    frame_idx = 0
    analysed = 0
    t0 = time.time()
    last_detections = []
    position_history = deque(maxlen=SMOOTHING_WINDOW)  # rolling majority vote
    bbox_history = deque(maxlen=SMOOTHING_WINDOW)       # smoothed bounding boxes

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        timestamp_s = frame_idx / fps

        if frame_idx % SAMPLE_EVERY_N == 0:
            # Crop to ROI before inference so nearby mats are excluded
            if roi:
                rx1, ry1, rx2, ry2 = roi
                infer_frame = frame[ry1:ry2, rx1:rx2]
            else:
                infer_frame = frame
                rx1, ry1 = 0, 0

            results = model.infer(infer_frame)[0]

            raw_detections = []
            for pred in results.predictions:
                if pred.confidence >= MIN_CONFIDENCE:
                    raw_detections.append({
                        "class": pred.class_name,
                        "confidence": round(pred.confidence, 3),
                        "bbox": {
                            # Translate bbox back to full-frame coordinates
                            "x": round(pred.x) + rx1, "y": round(pred.y) + ry1,
                            "w": round(pred.width), "h": round(pred.height),
                        },
                    })

            # ── Temporal smoothing ───────────────────────────────────────────
            if raw_detections:
                top_raw = max(raw_detections, key=lambda d: d["confidence"])
                position_history.append(top_raw["class"])
                bbox_history.append(top_raw["bbox"])
            else:
                # No detection this frame — don't push to history, let window hold
                pass

            # Majority vote across smoothing window
            if position_history:
                from collections import Counter
                smoothed_pos = Counter(position_history).most_common(1)[0][0]
                # Averaged bounding box across window
                smoothed_bbox = {
                    k: int(sum(b[k] for b in bbox_history) / len(bbox_history))
                    for k in ("x", "y", "w", "h")
                }
                smoothed_conf = max(
                    (d["confidence"] for d in raw_detections if d["class"] == smoothed_pos),
                    default=round(sum(
                        d["confidence"] for d in raw_detections) / len(raw_detections), 3
                    ) if raw_detections else 0.0,
                )

                # Layer 2: submission check only when in a ground position
                submission_result = None
                if smoothed_pos in GROUND_POSITIONS and _submission_model is not None:
                    submission_result = classify_submission(frame, smoothed_bbox)

                last_detections = [{
                    "class": smoothed_pos,
                    "confidence": smoothed_conf,
                    "bbox": smoothed_bbox,
                    "submission": submission_result,
                }]
                entry = {
                    "timestamp_s": round(timestamp_s, 2),
                    "timestamp": _fmt_time(timestamp_s),
                    "top_position": smoothed_pos,
                    "confidence": smoothed_conf,
                    "submission": submission_result[0] if submission_result else None,
                    "submission_conf": submission_result[1] if submission_result else None,
                    "all_detections": raw_detections,
                }
                timeline.append(entry)
                sub_str = f"  → {submission_result[0]} {submission_result[1]:.0%}" if submission_result else ""
                print(f"  {entry['timestamp']}  {smoothed_pos:<25} {smoothed_conf:.0%}{sub_str}")

            analysed += 1
            if analysed % 50 == 0:
                elapsed = time.time() - t0
                pct = frame_idx / total_frames * 100
                print(f"  … {pct:.0f}% done ({elapsed:.0f}s elapsed)")

        # Write every frame at original FPS — carry last detections forward
        writer.write(_draw(frame, last_detections, timestamp_s, roi=roi))

        frame_idx += 1

    cap.release()
    writer.release()
    return timeline, out_path


def _fmt_time(s: float) -> str:
    m, sec = divmod(int(s), 60)
    return f"{m:02d}:{sec:02d}"


def _draw(frame, detections: list[dict], timestamp_s: float, roi: tuple = None):
    import cv2
    import numpy as np

    out = frame.copy()
    h, w = out.shape[:2]

    # Timestamp overlay
    cv2.putText(out, _fmt_time(timestamp_s), (12, 36),
                cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 255), 2, cv2.LINE_AA)

    # Draw ROI boundary so user can verify crop is correct
    if roi:
        cv2.rectangle(out, (roi[0], roi[1]), (roi[2], roi[3]), (255, 200, 0), 2)

    for d in detections:
        bx, by, bw, bh = d["bbox"]["x"], d["bbox"]["y"], d["bbox"]["w"], d["bbox"]["h"]
        x1, y1 = int(bx - bw / 2), int(by - bh / 2)
        x2, y2 = int(bx + bw / 2), int(by + bh / 2)

        sub = d.get("submission")
        color = (0, 80, 255) if sub else (0, 200, 100)  # red tint for submission, green otherwise
        cv2.rectangle(out, (x1, y1), (x2, y2), color, 2)

        label = f"{d['class']} {d['confidence']:.0%}"
        cv2.putText(out, label, (x1, max(y1 - 8, 16)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 220, 120), 2, cv2.LINE_AA)

        if sub:
            sub_label = f">> {sub[0]}  {sub[1]:.0%}"
            cv2.putText(out, sub_label, (x1, max(y1 - 28, 36)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 80, 255), 2, cv2.LINE_AA)

    return out


def print_summary(timeline: list[dict]):
    if not timeline:
        print("\nNo detections above confidence threshold.")
        return

    from collections import Counter
    counts = Counter(e["top_position"] for e in timeline)
    total = sum(counts.values())

    print("\n── Position breakdown ──────────────────────────")
    for pos, count in counts.most_common():
        pct = count / total * 100
        bar = "█" * int(pct / 2)
        print(f"  {pos:<25} {pct:5.1f}%  {bar}")

    print(f"\nTotal analysed frames with detections: {len(timeline)}")
    print(f"Duration covered: {timeline[0]['timestamp']} → {timeline[-1]['timestamp']}")


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="BJJ gym camera analysis PoC")
    parser.add_argument("--api-key", required=True, help="Roboflow API key")
    parser.add_argument(
        "--video",
        default="../Test Video/IMG_0715_3.mov",
        help="Path to video file (default: trimmed sample)",
    )
    parser.add_argument("--model", default=MODEL_ID, help="Roboflow model ID")
    parser.add_argument(
        "--roi",
        default=None,
        help="Region of interest: x1,y1,x2,y2 in pixels (e.g. 100,50,800,600). "
             "Restricts analysis to one mat, ignoring athletes on adjacent mats.",
    )
    args = parser.parse_args()

    roi = None
    if args.roi:
        try:
            roi = tuple(int(v) for v in args.roi.split(","))
            assert len(roi) == 4
            print(f"ROI: {roi[0]},{roi[1]} → {roi[2]},{roi[3]}")
        except Exception:
            sys.exit("--roi must be x1,y1,x2,y2  e.g.  --roi 100,50,800,600")

    video_path = str(Path(__file__).parent / args.video)
    if not os.path.exists(video_path):
        sys.exit(f"Video not found: {video_path}")

    model = load_model(args.api_key, args.model)
    print(f"\nAnalysing: {video_path}\n")

    timeline, out_path = analyse_video(model, video_path, roi=roi)
    print_summary(timeline)

    # Save JSON timeline
    json_out = str(Path(video_path).with_suffix("")) + "_timeline.json"
    with open(json_out, "w") as f:
        json.dump(timeline, f, indent=2)

    print(f"\nTimeline JSON → {json_out}")
    print(f"Annotated video → {out_path}")


if __name__ == "__main__":
    main()
