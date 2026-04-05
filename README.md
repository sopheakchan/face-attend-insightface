# Face Recognition Attendance System

## Quick Start

**Requirements:** Python 3.10+, Node.js 16+, a webcam

```bash
# 1. Clone
git clone <your-repo-url>
cd my-own-experiement

# 2. Install root dependencies (gets concurrently)
npm install

# 3. Create and activate a Python virtual environment
python -m venv env

# Windows:
env\Scripts\activate
# Mac/Linux:
source env/bin/activate

# 4. Install Python dependencies
pip install -r requirements.txt

# 5. Start everything (installs frontend deps automatically on first run)
npm start
```

Open **http://localhost:5174** in your browser.

> **First run:** InsightFace downloads ~500MB of face recognition models into `.insightface/` automatically. This is a one-time download — subsequent starts are instant.

> **Tip:** Steps 2–4 are one-time setup. After that, just activate your venv and `npm start`.

---

A full-stack web application for real-time face recognition-based attendance tracking. This system captures student/teacher faces during enrollment, extracts deep face embeddings, and recognizes them during check-in/check-out, all with a modern web interface and a production-grade ML inference service.

## Project Overview

The system consists of three main components:

1. **Frontend**: React + Vite web application with live video face capture
2. **Backend API**: FastAPI service running InsightFace for face detection and embedding extraction
3. **Data Layer**: CSV-based persistence of embeddings, prototypes, and attendance records

The attendance workflow is simple: Students register their faces once, then subsequent check-ins are instant face recognition without any manual input needed.

## Why InsightFace + Cosine Similarity?

Before diving into how the system works, it's important to understand why we chose this specific approach over alternatives like CNN classifiers or YOLO-based detection.

### The Problem with CNN Classifiers

A naive approach would train a CNN to classify identities directly (e.g., "Student 1", "Student 2", etc.). This sounds straightforward but has major drawbacks:

- **Closed-set problem**: The network learns only the exact faces in your training set. Enrolling a new student requires retraining the entire model
- **Scalability nightmare**: Each new person added to the system requires retraining with all previous data
- **Real-world deployment**: Updates to the model mean stopping the entire system during retraining
- **Limited generalization**: The model hasn't seen the new person's face during training, so accuracy is unpredictable

### The Problem with YOLO for Face Recognition

YOLO is designed for object detection (finding bounding boxes), not for identifying which specific person is in the box. You would still need a separate identification model after YOLO detects the face. This creates unnecessary complexity and computational overhead.

### Why InsightFace + Cosine Similarity Works

InsightFace is a pre-trained deep face recognition model (trained on millions of faces) that has already learned the universal properties of human faces. Instead of classifying identities, it extracts a fixed-size embedding (a 512-dimensional vector) representing the face.

**Key advantages:**

1. **Open-set recognition**: New people can be added by simply computing their embedding and storing it. No retraining needed
2. **Real-time enrollment**: Students can self-enroll by capturing 5 seconds of video. Their prototype is instantly available for recognition
3. **Simple arithmetic**: Once we have embeddings, identifying a new face is just a dot product (cosine similarity) between the test embedding and stored prototypes
4. **Production-ready**: The model is pre-trained and frozen. No model updates, updates are data-only
5. **Threshold-based flexibility**: Adjust sensitivity by changing the similarity threshold, not retraining

The embedding is the key innovation: it converts each face into a point in a 512-dimensional space where similar faces are close together and different faces are far apart.

## How It Works

### System Architecture

The system has three main layers working together:

**Layer 1: Frontend (React + Vite)**
- Location: Browser at `http://localhost:5174`
- Components: Check-In/Out panel and Register component
- User captures: 5-second video (enrollment) or single frame (check-in)
- Sends to: Vite middleware at `/api/attendance/*` or `/api/enrollment/enroll`
- Data format: Base64-encoded JPEG frames

**Layer 2: Middleware Processing (Vite Dev Server)**
- Location: Vite dev server running locally
- Responsibility: Orchestrate ML pipeline and manage CSV files
- For enrollment: Loop through frames → Extract embeddings → Filter by quality → Average vectors → Save to CSV
- For recognition: Single frame → Call FastAPI → Get person name and similarity score
- Calls: FastAPI service at `http://127.0.0.1:8001`

**Layer 3: ML Inference (FastAPI Service)**
- Location: `http://127.0.0.1:8001`
- Model: InsightFace Buffalo_L (pre-trained on millions of faces)
- Two endpoints:
  - `/extract-embedding` → Returns 512D embedding + detection score (for enrollment, no prototype matching)
  - `/recognize` → Returns person name + similarity score + role (for check-in, requires prototypes)

**Data Storage (CSV Files in /artifacts/)**
- `person_prototypes.csv` → One row per registered person with their embedding
- `enrollment_embeddings.csv` → All individual frames used during training
- `attendance_records.csv` → Daily check-in/check-out records with similarity scores

---

### Enrollment Flow (How New Students Register)

1. Student opens browser → Navigate to Register tab
2. Clicks "Start Capture" → Browser records 5 seconds of video at 2 fps (~10 frames)
3. Middleware receives all frames and processes:
   - For each frame: Send to `/extract-embedding` API
   - InsightFace detects face and extracts 512-dimensional embedding
   - Check: Is detection_score >= 0.60? (quality filter)
   - If YES: Keep this embedding
   - If NO: Discard (too blurry or low confidence)
4. Collect ~6-8 good embeddings and compute:
   - Average all embeddings together
   - L2 normalize the result (make magnitude = 1)
   - Save to `person_prototypes.csv` as new row
5. Also save individual frames to `enrollment_embeddings.csv` for analysis
6. Response: "Successfully enrolled [Name] with 8 face samples"
7. Result: Student now appears in everyone's recognition database automatically

---

### Recognition Flow (Daily Check-In/Check-Out)

1. Student opens browser → Navigate to Check-In/Out tab
2. Clicks "Capture" → Browser takes single frame from webcam
3. Middleware sends frame to `/recognize` API with current prototypes loaded
4. InsightFace:
   - Detects face in frame
   - Extracts 512D embedding from detected face
   - Compares embedding against ALL prototypes using cosine similarity
   - Returns: Best matching person + highest similarity score
5. Check threshold:
   - If similarity >= 0.60 → Student RECOGNIZED, name shows on screen
   - If similarity < 0.60 → Student marked UNKNOWN, shows "Face not recognized"
6. If recognized: Update `attendance_records.csv` with:
   - Current date, time
   - Person name and role
   - Check-in or check-out action
   - Similarity score for audit trail
7. Display: Shows person name, role, time, and similarity confidence

---

### What Each API Endpoint Does

**POST /extract-embedding**
- Purpose: Pure face extraction (used during enrollment)
- Input: Base64 JPEG frame
- Process:
  1. Detect face in image
  2. Align face to standard pose
  3. Extract embedding (512 numbers)
  4. Return detection confidence score
- Output: `{success: true, embedding: [...], det_score: 0.85}`
- Does NOT: Compare against prototypes

**POST /recognize**
- Purpose: Face extraction + matching (used for check-in)
- Input: Base64 JPEG frame
- Process:
  1. Detect face and extract embedding (same as above)
  2. Load all prototypes from `person_prototypes.csv`
  3. Compute cosine similarity: embedding · prototype for each person
  4. Find person with highest similarity
  5. Check if highest >= threshold (0.60)
- Output: `{success: true, person: "John", role: "student", similarity: 0.78}`
- Requires: Prototype CSV must exist and be populated

---

### Key Technical Concepts

**Embedding (512D Vector)**
- What it is: A fixed-size representation of a face in 512-dimensional space
- How it works: InsightFace's ResNet50 backbone extracts these numbers from aligned face image
- Why 512D: Empirically found to balance accuracy and efficiency
- Property: Similar faces have embeddings close together, different faces far apart

**Cosine Similarity**
- Formula: `(a · b) / (||a|| * ||b||)` = angle between two embeddings
- Range: 0 (completely different) to 1 (identical) for normalized vectors
- Why used: Invariant to brightness/scale changes, computationally efficient
- In practice: Dot product after L2 normalization is fast matrix multiplication

**L2 Normalization**
- What it does: Divides embedding by its magnitude to make all vectors length 1
- Formula: `v_normalized = v / ||v||`
- Why: Makes cosine similarity = dot product, improves numerical stability
- When applied: After extraction from model, before storing in CSV, before comparison

**Detection Score (det_score)**
- What it is: Model's confidence that detected face is actually a face (0 to 1)
- Used for: Quality filtering during enrollment (keep >= 0.60)
- High value (>0.9): Perfect face detection, sharp image, frontal angle
- Low value (<0.5): Blurry, partial face, or false detection
- Why filter: Bad quality faces create poor prototypes that hurt recognition later

---

### Data Flow Visualization (Text Format)

**Student Enrollment Day 1:**
```
Browser (5sec video with 10 frames)
  ↓
Vite Middleware
  ├─→ Frame 1 → /extract-embedding → det_score=0.85 ✓ Keep
  ├─→ Frame 2 → /extract-embedding → det_score=0.82 ✓ Keep
  ├─→ Frame 3 → /extract-embedding → det_score=0.55 ✗ Reject (too low)
  ├─→ Frame 4 → /extract-embedding → det_score=0.88 ✓ Keep
  ... (repeat for all 10 frames)
  ↓
Collect 8 good embeddings
  ↓
Average + L2 normalize
  ↓
Save to person_prototypes.csv
  ↓
Now: Student can be recognized!
```

**Student Check-In Day 2:**
```
Browser (single webcam frame)
  ↓
Vite Middleware
  ↓
/recognize endpoint
  ├─→ Extract embedding from new frame
  ├─→ Load all 50 prototypes from CSV
  ├─→ Compute similarity with each: [0.78, 0.45, 0.22, ..., 0.91]
  ├─→ Find max similarity: 0.91 (matches John)
  ├─→ Check: 0.91 >= 0.60? YES
  ↓
Return: "John recognized at 08:05, similarity=0.91"
  ↓
Update attendance_records.csv
  ↓
Display to user: "Welcome John, Student"
```

### Data Flow: Enrollment

When a new student registers:

1. **Capture Phase**: Browser captures video for 5 seconds at 2 fps, yielding approximately 10 frames
2. **Extraction Phase**: Each frame is sent to `/extract-embedding` endpoint which:
   - Detects the face in the frame
   - Extracts a 512-dimensional embedding vector
   - Checks if detection confidence (det_score) >= 0.60 (quality filter)
   - Discards low-quality detections
3. **Processing Phase**: Valid embeddings are collected and:
   - Stored individually in `enrollment_embeddings.csv` (training data)
   - Combined via L2-normalized mean to create a prototype
   - L2 normalization ensures the embedding magnitude is 1, making cosine similarity equivalent to dot product
4. **Storage Phase**: The prototype is stored in `person_prototypes.csv` for future recognition

### Data Flow: Recognition (Check-In/Check-Out)

When a student checks in:

1. **Capture Phase**: Browser captures a single frame via webcam
2. **Extraction Phase**: Frame is sent to `/recognize` endpoint which:
   - Detects the face
   - Extracts the embedding
   - Computes cosine similarity with all prototypes in `person_prototypes.csv`
3. **Matching Phase**: 
   - Highest similarity score is selected
   - If similarity >= 0.60 (configurable threshold), the student is recognized
   - Otherwise, marked as "Unknown"
4. **Recording Phase**: Attendance record is updated with check-in time, person name, role, and similarity score

## Understanding Cosine Similarity

Cosine similarity measures the angle between two embedding vectors, not their magnitude.

**Formula:**
```
cosine_similarity(a, b) = (a · b) / (||a|| * ||b||)
```

Where:
- `a · b` is the dot product
- `||a||` and `||b||` are the vector magnitudes (L2 norm)
- Result ranges from -1 to 1 (for normalized vectors: 0 to 1)

**Why it's better than Euclidean distance for embeddings:**

- It's invariant to scaling: A face can be bright or dim, but the angle between embeddings remains the same
- It captures angular similarity: Two faces that are roughly aligned to have small angle between their embeddings
- It's computationally efficient: Just matrix multiplication, no square roots

**Example visualization from the project:**

The `visualization.ipynb` notebook shows how embeddings cluster:
- Each person's training embeddings form a tight cluster in 512D space
- When a test image is projected to 2D/3D via PCA, known faces fall near their cluster
- Unknown faces fall far from all clusters (all similarity scores below threshold)

## System Components

### Frontend (React + Vite)

Located in `./frontend/`

**Pages:**
- **Check In/Out Panel**: Live webcam feed with single-frame capture for attendance
- **Register Component**: Face capture (5 sec video) + name/role input for enrollment
- **Admin Panel**: View today's attendance records

**How video capture works:**
- Canvas API extracts frames from video element
- Each frame is converted to JPEG, then Base64-encoded
- Sent to backend as JSON: `{imageData: "data:image/jpeg;base64,..."}`

### Backend API (FastAPI)

Located in `./recognition_api.py`, runs on port 8001

**Endpoints:**

| Endpoint | Method | Purpose | Use Case |
|----------|--------|---------|----------|
| `/health` | GET | Service availability check | Monitoring |
| `/extract-embedding` | POST | Pure face detection + embedding | Enrollment (no prototypes needed) |
| `/recognize` | POST | Embedding + prototype matching | Check-in/Check-out (requires prototypes) |

**Request format:**
```json
{
  "imageData": "data:image/jpeg;base64,/9j/4AAQSkZJR...",
  "threshold": 0.6
}
```

**Response format:**
```json
{
  "success": true,
  "embedding": [0.123, -0.456, ...],  // 512 values
  "det_score": 0.85,
  "person": "John Doe",  // Only in /recognize
  "role": "student",     // Only in /recognize  
  "similarity": 0.75,    // Only in /recognize
  "message": "Matched"
}
```

### ML Model: InsightFace Buffalo_L

Pre-trained face recognition model with the following pipeline:

1. **Detection** (det_10g.onnx): SSD-style detector finds face bounding boxes
2. **Alignment** (2d106det.onnx, 1k3d68.onnx): Detects 106 2D landmarks and 68 3D landmarks for face alignment
3. **Embedding** (w600k_r50.onnx): ResNet50-based model extracts 512-D embeddings from aligned faces
4. **Gender/Age** (genderage.onnx): Optional demographic inference

**Key parameters:**
- `DET_THRESH = 0.5`: Model's confidence threshold for face detection (lower = more sensitive, more false positives)
- `QUALITY_DET_SCORE = 0.60`: Our quality filter for frame selection during enrollment (stricter than model threshold)
- `COSINE_THRESHOLD = 0.60`: Similarity threshold for "known" vs "unknown" classification

## CSV Data Structure

### person_prototypes.csv

One row per person (after enrollment)

```
person,role,samples_used,e0,e1,e2,...,e511
john_doe,student,8,0.123,-0.456,0.789,...,0.234
jane_smith,teacher,10,0.456,0.123,-0.789,...,0.567
```

- `person`: Student/teacher name
- `role`: "student" or "teacher"
- `samples_used`: Number of registration frames used to build this prototype
- `e0` to `e511`: The 512-dimensional embedding (L2-normalized)

### enrollment_embeddings.csv

All individual registration frames (for analysis/retraining)

```
person,role,image_path,det_score,e0,e1,e2,...,e511
john_doe,student,data/john_doe/frame_001.jpg,0.85,0.120,-0.460,0.788,...,0.235
john_doe,student,data/john_doe/frame_002.jpg,0.82,0.125,-0.451,0.791,...,0.232
```

- `person`, `role`, `image_path`: Metadata about the source frame
- `det_score`: Model's confidence in face detection for this frame
- `e0` to `e511`: Individual frame's embedding

### attendance_records.csv

Daily attendance log

```
date,person,check_in,check_out,status,late_minutes,last_similarity,last_action,updated_at
2026-03-31,john_doe,08:05,17:30,Late,-5,0.78,check_out,2026-03-31 17:30:14
2026-03-31,jane_smith,07:58,17:00,Present,0,0.82,check_out,2026-03-31 17:00:22
```

- `date`: Attendance date (YYYY-MM-DD)
- `person`: Student name
- `check_in`, `check_out`: Time of day (HH:MM format)
- `status`: "Present", "Late", "Absent", or "Left"
- `late_minutes`: Minutes late (0 if on time)
- `last_similarity`: Highest cosine similarity score during recognition
- `last_action`: "check_in" or "check_out"
- `updated_at`: Timestamp of last update

## Notebooks for Analysis

### experimental.ipynb

End-to-end workflow demonstrating the complete algorithm:

1. **Load training images** from `data/` folder
2. **Extract embeddings** using InsightFace model
3. **Quality filtering** to keep only high-confidence detections (det_score >= 0.60)
4. **Split data** into enrollment (template building) and evaluation (testing)
5. **Build prototypes** by computing mean embedding per person
6. **Evaluate** on held-out images with accuracy metrics
7. **Save CSVs** with embeddings and prototypes

**Key insight:** This notebook shows the mathematical foundations. The live system follows the same algorithms but in real-time on web camera input.

### visualization.ipynb

Interactive visualization of embedding space:

1. **2D Projection** via PCA: Shows how different people's embeddings cluster in 2D space
2. **3D Projection** via PCA: Richer visualization with 3 principal components
3. **Distance metrics**: Compares Euclidean, Manhattan, and Cosine distances
4. **Threshold testing**: Experiment with different COSINE_THRESHOLD values to see how recognition accuracy changes

**What to look for:**
- Each person's enrollment embeddings form a tight cluster
- Test image embeddings fall near their person's cluster if recognized correctly
- Unknown faces scatter across space with low similarity to all prototypes

### preprocessing.ipynb

Data preparation and exploration:

- Load and organize raw images
- Verify face detection
- Inspect extraction quality
- Prepare training/test splits

## Setup & Running

### Prerequisites

- Python 3.10+ with pip
- Node.js 16+ with npm
- Webcam for face capture
- Modern web browser (Chrome, Firefox, Edge)

### Installation

1. **Clone repository**
   ```bash
   cd my-own-experiement
   ```

2. **Create Python environment**
   ```bash
   python -m venv env
   env\Scripts\activate  # Windows
   # or: source env/bin/activate  # Linux/Mac
   ```

3. **Install Python dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Install Node.js dependencies**
   ```bash
   cd frontend
   npm install
   cd ..
   ```

### Running the System

1. **Start FastAPI service** (Terminal 1)
   ```bash
   python recognition_api.py
   ```
   API will listen on http://127.0.0.1:8001

2. **Start Vite dev server** (Terminal 2)
   ```bash
   cd frontend
   npm run dev
   ```
   Frontend will be available at http://localhost:5174

3. **Open browser**
   - Navigate to http://localhost:5174
   - Use "Register" tab to enroll new faces
   - Use "Check In/Out" tab for attendance

## Configuration

Key thresholds are defined in multiple places (must stay consistent):

**`experimental.ipynb`** (reference/analysis):
```python
DET_THRESH = 0.5              # Model detection confidence
QUALITY_DET_SCORE = 0.60      # Frame quality filter
COSINE_THRESHOLD = 0.60       # Recognition threshold
```

**`frontend/vite.config.js`** (live system):
```javascript
const DET_THRESH = 0.5;
const QUALITY_DET_SCORE = 0.60;
const COSINE_THRESHOLD = 0.60;
```

**`recognition_api.py`** (API):
- Model uses DET_THRESH internally
- Prototypes loaded from CSV (already normalized)

### Tuning Sensitivity

**Increase recognition threshold (0.60 → 0.70):**
- More strict: Only very confident matches are recognized
- Fewer false positives (random people not recognized)
- More false negatives (legitimate users not recognized, marked Unknown)

**Decrease recognition threshold (0.60 → 0.50):**
- More lenient: Even marginal matches are recognized
- More false positives (wrong person recognized)
- Fewer false negatives (users almost always recognized)

Adjust based on your use case: Stricter for security (prisons, banks), more lenient for convenience (classroom check-in).

## Troubleshooting

### "No face detected" during enrollment
- Ensure good lighting
- Face should be centered in frame
- Try moving closer to camera

### Consistent high similarity but "Unknown" result
- Threshold might be set too high
- Lower COSINE_THRESHOLD in both frontend and API

### Enrollment/check-in API returns 404 errors
- Ensure both services are running:
  - `python recognition_api.py` on port 8001 (FastAPI)
  - `npm run dev` in frontend folder for Vite middleware
- Check URLs in enrollmentApi.js match your port configuration

### Low accuracy on recognition
- Verify prototypes CSV exists and has data: `artifacts/person_prototypes.csv`
- Check frame quality during enrollment (det_score values)
- Ensure consistent lighting between enrollment and check-in
- Add more enrollment samples for the person (quality > quantity)

## Project Structure

```

face-attend/
├── app.py                      # Core ML functions (shared utilities)
├── recognition_api.py          # FastAPI service for face embedding
├── requirements.txt            # Python dependencies
├── README.md                   # This file
│
├── frontend/                   # React + Vite web application
│   ├── src/
│   │   ├── App.jsx            # Main app with navbar routing
│   │   ├── components/
│   │   │   ├── CheckInPanel.jsx
│   │   │   ├── Register.jsx
│   │   │   └── AdminPanel.jsx
│   │   └── lib/
│   │       ├── attendanceApi.js
│   │       └── enrollmentApi.js
│   ├── vite.config.js         # Vite config + ML middleware for endpoints
│   ├── package.json
│   └── index.html
│
├── notebooks/                  # Analysis & experimentation
│   ├── experimental.ipynb      # Complete algorithm walkthrough
│   ├── visualization.ipynb     # Embedding space visualization
│   └── preprocessing.ipynb     # Data preparation
│
├── data/                       # Training images (organized by person)
│   ├── john_doe/
│   │   ├── Image_1.jpg
│   │   ├── Image_2.jpg
│   │   └── ...
│   └── jane_smith/
│       ├── Image_1.jpg
│       └── ...
│
└── artifacts/                  # Generated data files
    ├── person_prototypes.csv           # Live prototype embeddings
    ├── enrollment_embeddings.csv       # Training embeddings
    ├── attendance_records.csv          # Attendance log
    ├── attendance_settings.json        # Configuration
    └── captures/                       # Captured frames (optional)
```

## Technical Deep Dive

### Why L2 Normalization?

In the code, embeddings are normalized: `embedding / ||embedding||`

This ensures:
- All embeddings lie on the surface of a unit sphere
- Cosine similarity becomes dot product (more efficient)
- Magnitude differences (lighting, distance) don't affect similarity
- Numerical stability

### Why Mean of Enrollments?

During enrollment, we collect multiple frames (~10) and compute their mean embedding as the prototype.

Benefits:
- Noise reduction: Averaging smooths out detection artifacts
- Robustness: Prototype captures the person's "average" face
- Efficiency: One prototype per person instead of storing all enrollments for recognition

Mathematical process:
```
1. Extract embedding for each enrollment frame: e1, e2, ..., en
2. Stack into matrix: E = [e1; e2; ...; en]
3. Compute mean: mean_e = E.mean(axis=0)
4. Normalize: normalized_prototype = l2_normalize(mean_e)
```

### Matrix Operations for Speed

The recognize endpoint uses efficient batch operations:

```python
# proto_matrix: (num_people, 512) - all people's embeddings
# test_embedding: (1, 512) - new test face
# Cosine similarities via dot product
similarities = proto_matrix @ test_embedding  # (num_people,) - one score per person

# Find best match
best_person_idx = argmax(similarities)
best_score = similarities[best_person_idx]
```

This is O(n*d) where n is number of people and d is embedding dimension (512). Even with 1000 students, this runs in milliseconds on CPU.

## Future Enhancements

Potential improvements to the system:

- **GPU support**: Run InsightFace on CUDA-enabled GPU for 3-5x speedup
- **Multi-face tracking**: Handle scenarios with multiple people in frame
- **Liveness detection**: Prevent spoofing with liveness checks
- **Mask detection**: Separate handling for masked vs unmasked faces
- **Real-time metrics**: Dashboard showing recognition accuracy, false positive rate
- **Continuous learning**: Update prototypes with feedback from check-ins
- **Mobile app**: Flutter/React Native for iOS/Android mobile check-in
- **Database**: Replace CSV with PostgreSQL for scalability
- **Authentication**: Add login system to prevent unauthorized access

## License

This project is created for educational and institutional use.

## References

- InsightFace: https://github.com/deepinsight/insightface
- Cosine Similarity: https://en.wikipedia.org/wiki/Cosine_similarity
- Face Recognition Basics: https://arxiv.org/abs/1503.03832 (FaceNet paper)
- L2 Normalization: https://en.wikipedia.org/wiki/Norm_(mathematics)#Euclidean_norm

## Questions?

Refer to the notebooks for algorithm details:
- `experimental.ipynb` for end-to-end workflow
- `visualization.ipynb` for embedding space intuition
- `preprocessing.ipynb` for data preparation

Check service logs for error messages:
- FastAPI: Look for 500/400 errors in terminal running `recognition_api.py`
- Frontend: Check browser console for JavaScript errors (F12 → Console)
- Vite middleware: Check for enrollment endpoint errors in frontend terminal
