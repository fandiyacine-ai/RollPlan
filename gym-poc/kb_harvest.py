"""
Harvest clean training frames from RollPlan's technique KB.

Three-stage pipeline per frame:
  1. Extract at 1fps from instructional videos (sourced from DB source_url)
  2. bjj3/1 position gate — discard any frame where no ground position is detected
     (filters out instructor standing/talking, grip close-ups, chapter cards, etc.)
  3. Claude Haiku vision gate — confirm the specific submission is actively
     being applied, not just being set up or explained
     (uses the KB's own visual_cues as context so Claude knows what to look for)

Only frames that pass all three stages are uploaded to Roboflow.

Usage:
    python3 kb_harvest.py [--dry-run] [--class kimura] [--limit 5]

Options:
    --dry-run    Show what would be processed without downloading or uploading
    --class NAME Only process one class (e.g. kimura, heel_hook, armbar)
    --limit N    Max videos to attempt (useful for test runs)
"""

import argparse
import base64
import os
import sys
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import cv2
from roboflow import Roboflow

# ── Config ────────────────────────────────────────────────────────────────────

DATABASE_URL    = os.environ["DATABASE_URL"]
ROBOFLOW_KEY    = os.environ["ROBOFLOW_API_KEY"]
ANTHROPIC_KEY   = os.environ["ANTHROPIC_API_KEY"]
WORKSPACE       = "hello-rollplan-ai"
PROJECT         = "bjj-submissions"
POSITION_MODEL  = "bjj3/1"

# Extract one candidate frame per second (lower than before — quality over quantity)
FRAME_INTERVAL_S = 1.0
# Skip very start and end (title cards, outro)
SKIP_START_S     = 5
SKIP_END_S       = 5
MIN_DIM          = 160   # discard tiny frames (close-up of hands, etc.)
UPLOAD_WORKERS   = 10

POSITION_MIN_CONF = 0.30
GROUND_POSITIONS  = {
    "back1", "back2", "mount1", "mount2",
    "closed_guard1", "closed_guard2", "open_guard1", "open_guard2",
    "half_guard1", "half_guard2", "side_control1", "side_control2",
    "turtle1", "turtle2", "5050_guard",
}

# Claude Haiku — cheapest vision model, ~$0.001 per image screened
CLAUDE_MODEL = "claude-haiku-4-5-20251001"
# Resize frame to this before sending to Claude (saves tokens, ~$0.50 per 1000 frames)
CLAUDE_RESIZE = (640, 360)

# ── Submission class map ──────────────────────────────────────────────────────

CLASS_MAP = {
    # ── Submissions ──────────────────────────────────────────────────────────
    "armbar": "armbar", "straight_armbar": "armbar",
    "belly_down_armbar": "armbar", "shoulder_crunch_armbar": "armbar",
    "arm_isolation": "armbar", "choi_bar": "armbar",

    "heel_hook": "heel_hook", "inside_heel_hook": "heel_hook",
    "outside_heel_hook": "heel_hook", "heel_hook_setup": "heel_hook",
    "heel_hook_transition": "heel_hook",
    "spread_chicken": "heel_hook", "z_lock": "heel_hook",
    "inside_sankaku": "heel_hook", "banana_split": "heel_hook",

    "kimura": "kimura", "kimura_submission": "kimura",
    "rolling_kimura": "kimura", "kimura_trap": "kimura",
    "kimura_to_heel_hook": "kimura", "kimura_rolling_dlr": "kimura",

    "triangle_choke": "triangle", "rear_triangle": "triangle",
    "rear_triangle_choke": "triangle", "back_triangle": "triangle",
    "side_triangle_choke": "triangle", "reverse_triangle": "triangle",
    "reverse_triangle_choke": "triangle", "arm_triangle": "triangle",
    "arm_triangle_choke": "triangle", "mounted_triangle_setup": "triangle",

    "guillotine": "guillotine", "guillotine_choke": "guillotine",
    "arm_in_guillotine": "guillotine", "guillotine_choke_arm_in": "guillotine",

    "omoplata": "omoplata", "flying_omoplata": "omoplata",
    "reverse_omoplata": "omoplata", "omoplata_sweep": "omoplata",
    "baratoplata": "omoplata", "monoplata": "omoplata", "marceloplata": "omoplata",

    "darce_choke": "darce_choke",

    "americana": "americana", "mir_lock": "americana", "shoulder_lock": "americana",

    "rear_naked_choke": "rear_naked_choke",

    "north_south_choke": "north_south_choke",
    "choke_north_south": "north_south_choke",

    "anaconda_choke": "anaconda_choke",

    "toe_hold": "toehold", "toehold": "toehold", "straight_foot_lock": "toehold",
    "toe_hold_kneebar_transition": "toehold", "texas_cloverleaf": "toehold",

    "ankle_lock": "ankle_lock", "straight_ankle_lock": "ankle_lock",

    "kneebar": "kneebar",

    "baseball_bat_choke": "baseball_bat_choke", "baseball_choke": "baseball_bat_choke",

    "clock_choke": "clock_choke", "worm_hat_choke": "clock_choke",

    "ezekiel_choke": "ezekiel_choke", "arm_in_ezekiel_choke": "ezekiel_choke",
    "choke_lapel_ezekiel": "ezekiel_choke",

    "von_flue_choke": "von_flue_choke",

    "wrist_lock": "wrist_lock", "wristlock": "wrist_lock",

    "calf_slicer": "calf_slicer", "calf_crank": "calf_slicer", "bicep_slicer": "calf_slicer",

    "paper_cutter_choke": "paper_cutter_choke", "bread_cutter_choke": "paper_cutter_choke",

    "twister": "twister",

    "crucifix_choke": "crucifix_choke", "crucifix_submission": "crucifix_choke",

    "kesa_gatame": "kesa_gatame",

    "gogoplata": "gogoplata", "gogo_plata": "gogoplata",

    # ── Guard types ──────────────────────────────────────────────────────────
    "butterfly_guard_fundamentals": "butterfly_guard",

    "de_la_riva_to_single_leg_x": "de_la_riva_guard",
    "rdlr_hook_release": "de_la_riva_guard", "rdlr_pass": "de_la_riva_guard",

    "single_leg_x": "single_leg_x_guard",
    "single_leg_x_guard_position": "single_leg_x_guard",

    "x_guard": "x_guard", "x_guard_transition": "x_guard",

    "fifty_fifty": "fifty_fifty_guard",
    "backside_50_50_entry": "fifty_fifty_guard",
    "backside_50_50_escape": "fifty_fifty_guard",

    "rubber_guard": "rubber_guard", "rubber_guard_entry": "rubber_guard",

    "worm_guard": "worm_guard", "worm_guard_entry": "worm_guard",
    "worm_guard_setup": "worm_guard",

    # ── Sweeps ───────────────────────────────────────────────────────────────
    "butterfly_sweep": "butterfly_sweep",

    "x_guard_sweep": "x_guard_sweep",

    "single_leg_x_sweep": "single_leg_x_sweep",
    "single_leg_x_sweeps": "single_leg_x_sweep",

    "orbit_sweep": "guard_sweep", "double_ankle_sweep": "guard_sweep",
    "lasso_sweep": "guard_sweep", "waiter_sweep": "guard_sweep",
    "k_guard_sweep": "guard_sweep", "swinging_kite_sweep": "guard_sweep",
    "sumi_gaeshi": "guard_sweep", "shoulder_crunch_sweep": "guard_sweep",

    # ── Transitions ──────────────────────────────────────────────────────────
    "back_take": "back_take", "back_take_2": "back_take",
    "rolling_back_attack": "back_take",
    "50_50_of_the_arms_back_take": "back_take",

    "guard_pass": "guard_pass",
}

# ── DB ────────────────────────────────────────────────────────────────────────

def fetch_kb_data():
    """
    Returns {class_name: {"urls": [...], "visual_cues": "..."}}
    visual_cues are aggregated from all active KB records for that class.
    """
    import psycopg2
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    cur.execute("""
        SELECT event_id, source_url, visual_cues
        FROM technique_variants
        WHERE status = 'active'
          AND source_url IS NOT NULL
          AND source_url LIKE '%youtube%'
    """)
    rows = cur.fetchall()
    cur.close()
    conn.close()

    data = defaultdict(lambda: {"urls": set(), "cues": []})
    skipped = 0
    for event_id, url, cues in rows:
        cls = CLASS_MAP.get(event_id)
        if cls:
            data[cls]["urls"].add(url)
            if cues:
                data[cls]["cues"].append(cues.strip())
        else:
            skipped += 1

    result = {}
    for cls, d in sorted(data.items()):
        # Deduplicate visual cues and join into one compact description
        seen = set()
        unique_cues = []
        for c in d["cues"]:
            if c not in seen:
                seen.add(c)
                unique_cues.append(c)
        result[cls] = {
            "urls": list(d["urls"]),
            "visual_cues": " | ".join(unique_cues[:5]),  # cap at 5 to keep prompt small
        }

    total_vids = sum(len(v["urls"]) for v in result.values())
    print(f"KB: {len(rows)} records → {total_vids} unique videos across {len(result)} classes  ({skipped} skipped)")
    return result


# ── Stage 1: position gate (bjj3/1) ──────────────────────────────────────────

_pos_model = None

def _get_pos_model():
    global _pos_model
    if _pos_model is None:
        from inference import get_model
        print("  Loading bjj3/1 position gate …")
        _pos_model = get_model(model_id=POSITION_MODEL, api_key=ROBOFLOW_KEY)
    return _pos_model


def passes_position_gate(frame):
    """True if bjj3/1 detects any ground grappling position in this frame."""
    try:
        results = _get_pos_model().infer(frame)[0]
        return any(
            p.confidence >= POSITION_MIN_CONF and p.class_name in GROUND_POSITIONS
            for p in results.predictions
        )
    except Exception:
        return False


# ── Stage 2: Claude Vision — multi-class annotation ──────────────────────────
# Instead of YES/NO, Claude picks the actual class from our full label list.
# If the frame shows a different technique than the video's expected class,
# Claude corrects the label automatically.

_claude = None

# All valid destination classes (unique values from CLASS_MAP, sorted)
ALL_CLASSES = sorted(set(CLASS_MAP.values()))

def _get_claude():
    global _claude
    if _claude is None:
        import anthropic
        _claude = anthropic.Anthropic(api_key=ANTHROPIC_KEY)
    return _claude


def frame_to_b64(frame):
    small = cv2.resize(frame, CLAUDE_RESIZE)
    _, buf = cv2.imencode(".jpg", small, [cv2.IMWRITE_JPEG_QUALITY, 75])
    return base64.standard_b64encode(buf.tobytes()).decode("utf-8")


def classify_frame(frame, expected_class, visual_cues, debug=False, retries=2):
    """
    Ask Claude Haiku to classify the BJJ technique visible in this frame.

    Returns the class name string if a technique is clearly visible,
    or None if the frame should be discarded (no clear technique, standing,
    talking to camera, only close-up of hands, etc.)

    Crucially, the returned class may differ from expected_class — Claude
    corrects the label when the video contains a different technique.
    """
    class_list = "\n".join(f"  - {c}" for c in ALL_CLASSES)
    hint = expected_class.replace("_", " ")

    prompt = (
        "You are annotating BJJ (Brazilian Jiu-Jitsu) training images for a "
        "computer vision classifier. Two grapplers may be wearing gi or no-gi.\n\n"
        "Look at this image and identify which BJJ technique, guard position, sweep, "
        "or transition is clearly visible — meaning both athletes are on the ground "
        "and the characteristic grip or body position can be seen. Demonstrations, "
        "drills, and slow-motion reps all count.\n\n"
        f"HINT: this frame comes from a video about '{hint}', but correct the label "
        "if a different technique or position is clearly shown.\n\n"
        "Respond with EXACTLY ONE label from this list, or the word 'none' if nothing "
        "is clearly visible (e.g. instructor standing/talking, empty mat, "
        "only hands shown, unclear):\n\n"
        f"{class_list}\n  - none\n\n"
    )
    if visual_cues:
        prompt += f"Visual reference for '{hint}': {visual_cues[:250]}\n\n"
    prompt += "Your answer (one label only, no explanation):"

    for attempt in range(retries + 1):
        try:
            resp = _get_claude().messages.create(
                model=CLAUDE_MODEL,
                max_tokens=20,
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "image", "source": {
                            "type": "base64",
                            "media_type": "image/jpeg",
                            "data": frame_to_b64(frame),
                        }},
                        {"type": "text", "text": prompt},
                    ],
                }],
            )
            raw = resp.content[0].text.strip().lower().replace(" ", "_")
            # Normalise: strip punctuation, match to known class or None
            detected = next((c for c in ALL_CLASSES if c == raw), None)
            if detected is None and raw in ("none", "unclear", "unknown", "n/a"):
                detected = None
            if debug:
                correction = " ← CORRECTED" if detected and detected != expected_class else ""
                print(f"        Claude: {raw!r} → {detected}{correction}")
            return detected
        except Exception as e:
            if attempt < retries:
                time.sleep(2 ** attempt)
            else:
                print(f"      Claude error: {e}")
                return None


# ── Download ──────────────────────────────────────────────────────────────────

def download_video(url, videos_dir):
    from pytubefix import YouTube
    vid_id = url.split("v=")[-1].split("&")[0]
    dest = videos_dir / f"{vid_id}.mp4"
    if dest.exists():
        return dest
    try:
        yt = YouTube(url)
        stream = (
            yt.streams.filter(progressive=True, file_extension="mp4")
            .order_by("resolution").last()
            or yt.streams.get_lowest_resolution()
        )
        if not stream:
            return None
        stream.download(output_path=str(videos_dir), filename=dest.name)
        return dest
    except Exception as e:
        print(f"      download error: {e}")
        return None


# ── Frame extraction with position gate + Claude classification ───────────────

def extract_classified_frames(video_path, expected_class, visual_cues, frames_dir):
    """
    Yields (frame_path, detected_class) tuples where:
      - frame passed bjj3/1 ground position gate
      - Claude identified a clear technique (may differ from expected_class)

    Frames are saved under frames_dir/<detected_class>/ so that each frame
    lands in the correct label folder even when Claude corrects the label.
    """
    cap = cv2.VideoCapture(str(video_path))
    fps   = cap.get(cv2.CAP_PROP_FPS) or 30
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total / fps

    step    = max(1, int(fps * FRAME_INTERVAL_S))
    start_f = int(SKIP_START_S * fps)
    end_f   = max(start_f + 1, total - int(SKIP_END_S * fps))

    stem = video_path.stem
    frame_idx = 0
    candidates = passed_pos = passed_claude = corrections = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        if frame_idx >= start_f and frame_idx <= end_f and frame_idx % step == 0:
            h, w = frame.shape[:2]
            if min(h, w) >= MIN_DIM:
                candidates += 1

                # Stage 1 — bjj3/1 position gate
                if not passes_position_gate(frame):
                    frame_idx += 1
                    continue
                passed_pos += 1

                # Stage 2 — Claude multi-class classification
                detected = classify_frame(frame, expected_class, visual_cues, debug=True)
                if detected is None:
                    frame_idx += 1
                    continue
                passed_claude += 1
                if detected != expected_class:
                    corrections += 1

                # Save under the DETECTED class folder
                class_dir = frames_dir / detected
                class_dir.mkdir(parents=True, exist_ok=True)
                out_path = class_dir / f"{stem}_f{frame_idx:06d}.jpg"
                cv2.imwrite(str(out_path), frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
                yield out_path, detected

        frame_idx += 1

    cap.release()
    print(
        f"      {duration:.0f}s → {candidates} candidates "
        f"→ {passed_pos} ground → {passed_claude} classified "
        f"({corrections} label corrections)"
    )


# ── Upload ────────────────────────────────────────────────────────────────────

def upload_batch(items):
    """
    items: list of (frame_path, class_name) — each frame may have its own label.
    """
    rf   = Roboflow(api_key=ROBOFLOW_KEY)
    proj = rf.workspace(WORKSPACE).project(PROJECT)
    ok = fail = 0

    def _up(path, cls):
        try:
            proj.single_upload(image_path=str(path), annotation_path=cls,
                               split="train", num_retry_uploads=2)
            return True
        except Exception:
            return False

    with ThreadPoolExecutor(max_workers=UPLOAD_WORKERS) as pool:
        futures = {pool.submit(_up, p, c): (p, c) for p, c in items}
        for fut in as_completed(futures):
            if fut.result():
                ok += 1
            else:
                fail += 1
    return ok, fail


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run",  action="store_true",
                        help="Show plan without downloading or uploading")
    parser.add_argument("--class",    dest="only_class", default=None,
                        help="Only process this class (e.g. kimura)")
    parser.add_argument("--limit",    type=int, default=None,
                        help="Max number of videos to process")
    parser.add_argument("--videos-dir", default="extra_data/kb_videos")
    parser.add_argument("--frames-dir", default="extra_data/kb_frames")
    args = parser.parse_args()

    for dep in ("psycopg2", "anthropic", "pytubefix"):
        try:
            __import__(dep.replace("-", "_"))
        except ImportError:
            sys.exit(f"Missing: pip3 install {dep}")

    kb = fetch_kb_data()

    if args.only_class:
        kb = {k: v for k, v in kb.items() if k == args.only_class}
        if not kb:
            sys.exit(f"No KB data for class '{args.only_class}'")

    if args.dry_run:
        for cls, d in kb.items():
            print(f"\n[{cls}]  {len(d['urls'])} videos")
            for url in d["urls"]:
                print(f"  {url}")
            if d["visual_cues"]:
                print(f"  visual_cues: {d['visual_cues'][:120]} …")
        return

    videos_dir = Path(args.videos_dir)
    frames_dir = Path(args.frames_dir)
    videos_dir.mkdir(parents=True, exist_ok=True)
    frames_dir.mkdir(parents=True, exist_ok=True)

    total_uploaded = total_fail = videos_done = 0

    for cls, d in kb.items():
        urls  = d["urls"]
        cues  = d["visual_cues"]

        print(f"\n{'═'*60}")
        print(f"CLASS: {cls}   ({len(urls)} videos)")
        if cues:
            print(f"  cues: {cues[:100]} …")

        for url in urls:
            if args.limit and videos_done >= args.limit:
                break

            vid_id = url.split("v=")[-1].split("&")[0]
            print(f"\n  [{vid_id}] {url}")

            video_path = download_video(url, videos_dir)
            if not video_path:
                print("    SKIP — download failed")
                continue
            videos_done += 1

            # Collect (path, detected_class) pairs, upload in batches
            batch = []
            for frame_path, detected_class in extract_classified_frames(
                video_path, cls, cues, frames_dir
            ):
                batch.append((frame_path, detected_class))
                if len(batch) >= 50:
                    ok, fail = upload_batch(batch)
                    total_uploaded += ok
                    total_fail     += fail
                    for p, _ in batch:
                        p.unlink(missing_ok=True)
                    batch = []
                    print(f"      → batch uploaded  total_ok={total_uploaded}", flush=True)

            if batch:
                ok, fail = upload_batch(batch)
                total_uploaded += ok
                total_fail     += fail
                for p, _ in batch:
                    p.unlink(missing_ok=True)

            video_path.unlink(missing_ok=True)

        if args.limit and videos_done >= args.limit:
            break

    print(f"\n{'═'*60}")
    print(f"Done.  Uploaded: {total_uploaded}  Failed: {total_fail}")
    print("Next step: Roboflow → bjj-submissions → Generate new version → Train")


if __name__ == "__main__":
    main()
