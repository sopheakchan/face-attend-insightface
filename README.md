# FaceAttendance: Using InsightFace and Cosine Similarity

## Overview

Traditional attendance systems are inefficient. Teachers spend time calling names, and students can cheat by signing in for others. There's also no real-time tracking or analytics.

Our goal was a face-based attendance system that is fast, accurate, and requires no retraining. The workflow is simple: students register their faces once, then subsequent check-ins are instant face recognition without any manual input needed.

---

## Why InsightFace + Cosine Similarity?

Before diving into how the system works, it's important to understand why we chose this specific approach over alternatives like CNN classifiers or YOLO-based detection.

### The Problem with CNN Classifiers

A naive approach would train a CNN to classify identities directly (e.g., "Student 1", "Student 2", etc.). This sounds straightforward but has major drawbacks:

- **Closed-set problem** — the network learns only the exact faces in your training set. Enrolling a new student requires retraining the entire model
- **Scalability nightmare** — each new person added to the system requires retraining with all previous data
- **Real-world deployment** — updates to the model mean stopping the entire system during retraining
- **Limited generalization** — the model hasn't seen the new person's face during training, so accuracy is unpredictable

### The Problem with YOLO for Face Recognition

YOLO is designed for object detection (finding bounding boxes), not for identifying which specific person is in the box. We would still need a separate identification model after YOLO detects the face. This creates unnecessary complexity and computational overhead.

### Why InsightFace + Cosine Similarity Works

InsightFace is a pre-trained deep face recognition model (trained on millions of faces) that has already learned the universal properties of human faces. Instead of classifying identities, it extracts a fixed-size embedding — a 512-dimensional vector representing the face.

The embedding is the key innovation: it converts each face into a point in a 512-dimensional space where similar faces are close together and different faces are far apart.

<!-- Add system architecture diagram here -->
<!-- Add cosine similarity diagram here -->

InsightFace is a pre-trained deep learning model trained on millions of faces. It converts each face into a 512-dimensional vector. We can think of this as a **face fingerprint** — unique to each person, stable across lighting and angles.

<!-- Add embedding table image here (image 1) -->

Similar faces produce similar vectors, while different faces produce very different ones. We visualized this in [`visualization.ipynb`](visualization.ipynb) — each person's embeddings form a tight cluster, and unknown faces scatter far from all of them.

<!-- Add embedding visualization here (image 2) -->

### Key Advantages

- **Open-set recognition** — new people can be added by simply computing their embedding and storing it. No retraining needed
- **Real-time enrollment** — students can self-enroll by capturing 5 seconds of video. Their prototype is instantly available for recognition
- **Simple arithmetic** — identifying a new face is just a dot product (cosine similarity) between the test embedding and stored prototypes
- **Production-ready** — the model is pre-trained and frozen. No model updates, updates are data-only
- **Threshold-based flexibility** — adjust sensitivity by changing the similarity threshold, not retraining

---

## Registered User Check-in Flow

<!-- Add check-in flow diagram here (image 3) -->

1. Student opens the browser and goes to the Check In/Out tab
2. Clicks Capture — the browser takes a single webcam frame
3. The frame is sent to our FastAPI service as a Base64 JPEG
4. InsightFace detects the face and extracts a 512D embedding
5. We compute cosine similarity against every stored prototype
6. If the best match is ≥ 0.60 → recognized, attendance is logged with name, role, time, and similarity score
7. If it falls below the threshold → unknown, no record is created

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS |
| Backend API | FastAPI, Uvicorn |
| Face Recognition | InsightFace Buffalo_L (ONNX Runtime) |
| Data | CSV files — no database needed |
| Dev Runner | concurrently — one `npm start` launches everything |

---

## API Reference

**POST `/extract-embedding`** — pure face extraction, used during enrollment

**POST `/recognize`** — extraction + prototype matching, used during check-in

Request format:
```json
{
  "imageData": "data:image/jpeg;base64,/9j/4AAQSkZJR...",
  "threshold": 0.6
}
```

Response format:
```json
{
  "success": true,
  "embedding": [0.123, -0.456, ...],
  "det_score": 0.85,
  "person": "John Doe",
  "role": "student",
  "similarity": 0.75,
  "message": "Matched"
}
```

---

## Setup & Running

**Requirements:** Python 3.10+, Node.js 16+, a webcam

```bash
# 1. Clone the repo
git clone <your-repo-url>
cd face-attend-insightface

# 2. Install root dependencies
npm install

# 3. Create and activate a Python virtual environment
python -m venv env

# Windows:
env\Scripts\activate
# Mac/Linux:
source env/bin/activate

# 4. Install Python dependencies
pip install -r requirements.txt

# 5. Start everything with one command
npm start
```

Open **http://localhost:5173** in your browser.

> **First run:** InsightFace automatically downloads ~500MB of face recognition models into `.insightface/`. This is a one-time download — subsequent starts are instant.

> **Every day after setup:** activate the venv, then `npm start`.

---

## References

- [InsightFace](https://github.com/deepinsight/insightface)
- [FaceNet paper](https://arxiv.org/abs/1503.03832) — foundational work on face embeddings
- [Cosine Similarity](https://en.wikipedia.org/wiki/Cosine_similarity)
