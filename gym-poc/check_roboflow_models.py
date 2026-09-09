#!/usr/bin/env python3
"""
Verify the Roboflow models this codebase depends on actually exist and serve.

Both harvesters gate every frame on `bjj3/1`, and passes_position_gate() treats
ANY non-OK response as "not a ground position" — so if that model has no trained
version, every frame is silently discarded and nothing is ever uploaded. This
script tells you whether that is happening.

Stdlib only, no dependencies. Reads the key from the environment:

    ROBOFLOW_API_KEY=... python3 gym-poc/check_roboflow_models.py
"""

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

WORKSPACE = "hello-rollplan-ai"

# Model ids referenced in the codebase — keep in sync if these change.
REFERENCED_MODELS = [
    ("bjj3/1",            "position gate: kb_harvest.py, harvest-roboflow-frames.ts, analyse.py"),
    ("bjj-submissions/6", "analyse.py SUBMISSION_MODEL_ID, extract_and_upload.py CURRENT_VERSION"),
]

# 1x1 white JPEG — enough to prove the endpoint serves without shipping a fixture.
TINY_JPEG_B64 = (
    "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a"
    "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAA"
    "AQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIh"
    "MUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpT"
    "VFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5"
    "usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iii"
    "gD//2Q=="
)


def get_json(url, timeout=25):
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")[:300]
        return e.code, body
    except Exception as e:  # network/DNS/timeout
        return None, str(e)


def main():
    key = os.environ.get("ROBOFLOW_API_KEY")
    if not key:
        sys.exit("ROBOFLOW_API_KEY is not set. Export it and re-run.")

    q = urllib.parse.urlencode({"api_key": key})
    failures = []

    print("1. Validating API key")
    status, body = get_json(f"https://api.roboflow.com/?{q}")
    if status is None:
        print(f"   FAIL  could not reach api.roboflow.com: {body}")
        sys.exit("   Network problem, not a key problem — check egress/proxy and retry.")
    if status != 200:
        print(f"   FAIL  HTTP {status}  {body}")
        sys.exit("   Key rejected by Roboflow — nothing else can be checked.")
    print(f"   OK    workspace: {body.get('workspace')}")

    print(f"\n2. Listing projects in '{WORKSPACE}'")
    status, body = get_json(f"https://api.roboflow.com/{WORKSPACE}?{q}")
    existing = set()
    if status == 200:
        for p in body.get("workspace", {}).get("projects", []):
            pid = p.get("id", "").split("/")[-1]
            existing.add(pid)
            print(f"   - {pid:<20} type={p.get('type'):<24} images={p.get('images')}")
    else:
        print(f"   WARN  HTTP {status}  {body}")

    print("\n3. Checking each referenced model")
    for model_id, used_by in REFERENCED_MODELS:
        project, version = model_id.split("/")
        print(f"\n   {model_id}   ({used_by})")

        if existing and project not in existing:
            print(f"   FAIL  project '{project}' is not in the workspace")
            failures.append(f"{model_id}: project missing")
            continue

        status, body = get_json(f"https://api.roboflow.com/{WORKSPACE}/{project}/{version}?{q}")
        if status != 200:
            print(f"   FAIL  metadata HTTP {status}  {body}")
            failures.append(f"{model_id}: metadata HTTP {status}")
            continue

        trained = (body.get("version") or {}).get("model")
        print(f"   {'OK   ' if trained else 'FAIL '} trained model on this version: {bool(trained)}")
        if not trained:
            failures.append(f"{model_id}: version exists but has no trained model")
            continue

        # Live inference ping — this is the call the harvesters actually make.
        req = urllib.request.Request(
            f"https://detect.roboflow.com/{model_id}?{q}&confidence=30",
            data=f"image={urllib.parse.quote(TINY_JPEG_B64)}&image_type=base64".encode(),
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=40) as r:
                print(f"   OK    inference endpoint responded HTTP {r.status}")
        except urllib.error.HTTPError as e:
            detail = e.read().decode(errors="replace")[:200]
            # 4xx about the image itself still proves the model is being served.
            verdict = "OK   " if e.code in (400, 413, 415) else "FAIL "
            print(f"   {verdict} inference HTTP {e.code}  {detail}")
            if verdict.strip() == "FAIL":
                failures.append(f"{model_id}: inference HTTP {e.code}")
        except Exception as e:
            print(f"   FAIL  inference error: {e}")
            failures.append(f"{model_id}: {e}")

    print("\n" + "=" * 60)
    if failures:
        print("PROBLEMS FOUND:")
        for f in failures:
            print(f"  - {f}")
        print("\nIf bjj3/1 failed: passes_position_gate() returns False on any non-OK")
        print("response, so every frame is discarded and no images reach Roboflow.")
        sys.exit(1)
    print("All referenced models exist and serve.")


if __name__ == "__main__":
    main()
