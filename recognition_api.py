from __future__ import annotations

import base64
from typing import Any

import cv2
import numpy as np
import uvicorn
from fastapi import FastAPI
from pydantic import BaseModel

from app import PROTOTYPES_CSV, build_model, load_prototypes, predict_identity


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

proto_names, proto_roles, proto_matrix = load_prototypes(PROTOTYPES_CSV)
model = build_model(det_thresh=0.5)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/recognize")
def recognize(payload: RecognitionRequest) -> dict[str, Any]:
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
        "message": "Matched" if known else "Similarity below threshold",
    }


if __name__ == "__main__":
    uvicorn.run("recognition_api:app", host="127.0.0.1", port=8001, reload=False)
