from __future__ import annotations

import base64
from typing import Any

import cv2
import numpy as np
import uvicorn
from fastapi import FastAPI
from pydantic import BaseModel

from app import PROTOTYPES_CSV, build_model, load_prototypes, predict_identity, l2_normalize


class RecognitionRequest(BaseModel):
    imageData: str
    threshold: float = 0.6


def _face_value(face: Any, key: str):
    if isinstance(face, dict):
        return face.get(key)
    return getattr(face, key, None)


def _decode_image(image_data: str) -> np.ndarray | None:
    src = str(image_data or "").strip()
    if not src:
        return None

    if "," in src:
        src = src.split(",", 1)[1]

    try:
        raw = base64.b64decode(src)
    except Exception:
        return None

    arr = np.frombuffer(raw, dtype=np.uint8)
    if arr.size == 0:
        return None
    frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    return frame


app = FastAPI(title="FaceAttend Recognition API")

# Global variables for prototypes - will be reloaded on each request
proto_names = []
proto_roles = []
proto_matrix = None
model = build_model(det_thresh=0.5)


def reload_prototypes():
    """Reload prototypes from CSV file in case it was updated"""
    global proto_names, proto_roles, proto_matrix
    try:
        proto_names, proto_roles, proto_matrix = load_prototypes(PROTOTYPES_CSV)
    except Exception as e:
        print(f"Warning: Failed to load prototypes: {e}")
        # Reset to empty if loading fails (for first enrollment)
        proto_names = []
        proto_roles = []
        proto_matrix = None


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/extract-embedding")
def extract_embedding(payload: RecognitionRequest) -> dict[str, Any]:
    """Extract face embedding from image WITHOUT requiring prototypes (for enrollment)"""
    frame = _decode_image(payload.imageData)

    if frame is None:
        return {
            "success": False,
            "embedding": None,
            "det_score": 0.0,
            "message": "Invalid or empty image payload",
        }

    faces = model.get(frame, max_num=0)
    if not faces:
        return {
            "success": False,
            "embedding": None,
            "det_score": 0.0,
            "message": "No face detected",
        }

    best_face = max(faces, key=lambda f: float(_face_value(f, "det_score") or 0.0))
    emb = _face_value(best_face, "embedding")
    det_score = float(_face_value(best_face, "det_score") or 0.0)

    if emb is None:
        return {
            "success": False,
            "embedding": None,
            "det_score": det_score,
            "message": "Face embedding not available",
        }

    return {
        "success": True,
        "embedding": emb.tolist(),
        "det_score": det_score,
        "message": "Embedding extracted successfully",
    }


@app.post("/recognize")
def recognize(payload: RecognitionRequest) -> dict[str, Any]:
    global proto_names, proto_roles, proto_matrix
    
    # Reload prototypes on each request to pick up new enrollments
    reload_prototypes()
    
    threshold = float(payload.threshold or 0.6)
    frame = _decode_image(payload.imageData)

    if frame is None:
        return {
            "known": False,
            "person": None,
            "role": "unknown",
            "similarity": 0.0,
            "threshold": threshold,
            "message": "Invalid or empty image payload",
        }

    faces = model.get(frame, max_num=0)
    if not faces:
        return {
            "known": False,
            "person": None,
            "role": "unknown",
            "similarity": 0.0,
            "threshold": threshold,
            "message": "No face detected",
        }

    best_face = max(faces, key=lambda f: float(_face_value(f, "det_score") or 0.0))
    emb = _face_value(best_face, "embedding")
    det_score = float(_face_value(best_face, "det_score") or 0.0)

    if emb is None:
        return {
            "known": False,
            "person": None,
            "role": "unknown",
            "similarity": 0.0,
            "threshold": threshold,
            "det_score": det_score,
            "message": "Face embedding not available",
        }

    person, role, similarity = predict_identity(
        emb,
        proto_names,
        proto_roles,
        proto_matrix,
        threshold,
    )

    known = person != "Unknown"
    return {
        "known": known,
        "person": person if known else None,
        "role": role if known else "unknown",
        "similarity": float(similarity),
        "threshold": threshold,
        "det_score": det_score,
        "embedding": emb.tolist() if emb is not None else None,
        "message": "Matched" if known else "Similarity below threshold",
    }


if __name__ == "__main__":
    uvicorn.run("recognition_api:app", host="127.0.0.1", port=8001, reload=False)
