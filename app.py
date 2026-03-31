from __future__ import annotations

import argparse
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np
import pandas as pd
from insightface.app import FaceAnalysis


BASE_DIR = Path(__file__).resolve().parent
ARTIFACTS_DIR = BASE_DIR / "artifacts"
PROTOTYPES_CSV = ARTIFACTS_DIR / "person_prototypes.csv"
CAPTURES_DIR = ARTIFACTS_DIR / "captures"

MODEL_NAME = "buffalo_l"
DEFAULT_THRESHOLD = 0.45
DEFAULT_DET_THRESH = 0.5


def l2_normalize(vec: np.ndarray) -> np.ndarray:
	vec = np.asarray(vec, dtype=np.float32)
	norm = np.linalg.norm(vec)
	return vec if norm == 0 else vec / norm


def _embedding_columns(df: pd.DataFrame) -> list[str]:
	emb_cols = [col for col in df.columns if col.startswith("e")]
	if not emb_cols:
		raise ValueError("No embedding columns found. Expected columns like e0, e1, e2...")

	try:
		emb_cols = sorted(emb_cols, key=lambda c: int(c[1:]))
	except ValueError:
		emb_cols = sorted(emb_cols)
	return emb_cols


def load_prototypes(csv_path: Path) -> tuple[list[str], list[str], np.ndarray]:
	if not csv_path.exists():
		raise FileNotFoundError(f"Prototype file not found: {csv_path}")

	proto_df = pd.read_csv(csv_path)
	if proto_df.empty:
		raise ValueError("Prototype CSV is empty.")
	if "person" not in proto_df.columns:
		raise ValueError("Prototype CSV must include a 'person' column.")

	emb_cols = _embedding_columns(proto_df)
	proto_matrix = proto_df[emb_cols].to_numpy(dtype=np.float32)
	proto_matrix = np.vstack([l2_normalize(row) for row in proto_matrix])
	proto_names = proto_df["person"].astype(str).tolist()
	if "role" in proto_df.columns:
		proto_roles = proto_df["role"].fillna("unknown").astype(str).tolist()
	else:
		proto_roles = ["unknown"] * len(proto_names)
	return proto_names, proto_roles, proto_matrix


def _face_value(face, key: str):
	if isinstance(face, dict):
		return face.get(key)
	return getattr(face, key, None)


def predict_identity(
	embedding: np.ndarray,
	proto_names: list[str],
	proto_roles: list[str],
	proto_matrix: np.ndarray,
	threshold: float,
) -> tuple[str, str, float]:
	emb = l2_normalize(embedding)
	sims = proto_matrix @ emb
	best_idx = int(np.argmax(sims))
	best_score = float(sims[best_idx])

	if best_score >= threshold:
		return proto_names[best_idx], proto_roles[best_idx], best_score
	return "Unknown", "unknown", best_score


def draw_prediction(frame: np.ndarray, bbox: np.ndarray, text: str, color: tuple[int, int, int]) -> None:
	x1, y1, x2, y2 = [int(v) for v in bbox]
	h, w = frame.shape[:2]
	x1 = max(0, min(x1, w - 1))
	x2 = max(0, min(x2, w - 1))
	y1 = max(0, min(y1, h - 1))
	y2 = max(0, min(y2, h - 1))

	cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
	label_y = max(15, y1 - 8)
	cv2.putText(frame, text, (x1, label_y), cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 2, cv2.LINE_AA)


def build_model(det_thresh: float) -> FaceAnalysis:
	model = FaceAnalysis(name=MODEL_NAME, providers=["CPUExecutionProvider"])
	model.prepare(ctx_id=-1, det_size=(640, 640), det_thresh=det_thresh)
	return model


def run(camera_id: int, threshold: float, det_thresh: float) -> None:
	proto_names, proto_roles, proto_matrix = load_prototypes(PROTOTYPES_CSV)
	model = build_model(det_thresh)

	CAPTURES_DIR.mkdir(parents=True, exist_ok=True)

	cap = cv2.VideoCapture(camera_id)
	if not cap.isOpened():
		raise RuntimeError(f"Cannot open webcam index {camera_id}")

	print(f"Loaded {len(proto_names)} person prototypes from {PROTOTYPES_CSV}")
	print(f"Running webcam recognition on CPU. Threshold={threshold:.2f}")
	print("Controls: q or ESC = quit | c = capture frame")

	window_name = "Face Recognition Test"
	while True:
		ok, frame = cap.read()
		if not ok:
			print("Warning: failed to read frame from webcam.")
			continue

		faces = model.get(frame, max_num=0)
		for face in faces:
			bbox = _face_value(face, "bbox")
			emb = _face_value(face, "embedding")
			det_score = float(_face_value(face, "det_score") or 0.0)
			if bbox is None or emb is None:
				continue

			person, role, sim = predict_identity(emb, proto_names, proto_roles, proto_matrix, threshold)
			is_known = person != "Unknown"
			color = (0, 200, 0) if is_known else (0, 165, 255)
			if is_known:
				text = f"{person} ({role}) | sim={sim:.3f} | det={det_score:.2f}"
			else:
				text = f"{person} | sim={sim:.3f} | det={det_score:.2f}"
			draw_prediction(frame, bbox, text, color)

		cv2.putText(
			frame,
			"q/ESC: quit | c: capture",
			(10, 25),
			cv2.FONT_HERSHEY_SIMPLEX,
			0.65,
			(255, 255, 255),
			2,
			cv2.LINE_AA,
		)

		cv2.imshow(window_name, frame)
		key = cv2.waitKey(1) & 0xFF

		if key in (27, ord("q")):
			break
		if key == ord("c"):
			stamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
			out_path = CAPTURES_DIR / f"capture_{stamp}.jpg"
			cv2.imwrite(str(out_path), frame)
			print(f"Saved capture: {out_path}")

	cap.release()
	cv2.destroyAllWindows()


def parse_args() -> argparse.Namespace:
	parser = argparse.ArgumentParser(description="Minimal webcam face recognition test app")
	parser.add_argument("--camera", type=int, default=0, help="Webcam index, default is 0")
	parser.add_argument(
		"--threshold",
		type=float,
		default=DEFAULT_THRESHOLD,
		help="Cosine similarity threshold for known vs Unknown",
	)
	parser.add_argument(
		"--det-thresh",
		type=float,
		default=DEFAULT_DET_THRESH,
		help="Detection confidence threshold for InsightFace",
	)
	return parser.parse_args()


if __name__ == "__main__":
	args = parse_args()
	run(camera_id=args.camera, threshold=args.threshold, det_thresh=args.det_thresh)
