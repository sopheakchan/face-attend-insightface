import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ARTIFACTS_DIR = path.resolve(__dirname, "../artifacts");
const ATTENDANCE_CSV = path.join(ARTIFACTS_DIR, "attendance_records.csv");
const PROTOTYPES_CSV = path.join(ARTIFACTS_DIR, "person_prototypes.csv");
const SETTINGS_JSON = path.join(ARTIFACTS_DIR, "attendance_settings.json");
const DEFAULT_CLASS_START = "08:00";
const COSINE_THRESHOLD = 0.6;
const RECOGNITION_API_URL = "http://127.0.0.1:8001/recognize";

function parseCsv(content) {
  const rows = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!rows.length) {
    return [];
  }
  const headers = rows[0].split(",");
  return rows.slice(1).map((line) => {
    const values = line.split(",");
    const record = {};
    headers.forEach((header, idx) => {
      record[header] = values[idx] ?? "";
    });
    return record;
  });
}

function stringifyCsv(rows, headers) {
  const headerLine = headers.join(",");
  const dataLines = rows.map((row) => headers.map((h) => row[h] ?? "").join(","));
  return [headerLine, ...dataLines].join("\n") + "\n";
}

function readCsv(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const raw = fs.readFileSync(filePath, "utf-8");
  return parseCsv(raw);
}

function writeAttendanceCsv(rows) {
  const headers = [
    "date",
    "person",
    "check_in",
    "check_out",
    "status",
    "arrival_delta_minutes",
    "late_minutes",
    "early_minutes",
    "last_similarity",
    "last_action",
    "updated_at",
  ];
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  fs.writeFileSync(ATTENDANCE_CSV, stringifyCsv(rows, headers), "utf-8");
}

function normalizeHm(value) {
  const raw = String(value || "").trim();
  const m = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) {
    return null;
  }
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isInteger(h) || !Number.isInteger(min) || h < 0 || h > 23 || min < 0 || min > 59) {
    return null;
  }
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function readAttendanceSettings() {
  let classStart = DEFAULT_CLASS_START;
  if (fs.existsSync(SETTINGS_JSON)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(SETTINGS_JSON, "utf-8"));
      const normalized = normalizeHm(parsed?.class_start);
      if (normalized) {
        classStart = normalized;
      }
    } catch {
      classStart = DEFAULT_CLASS_START;
    }
  }
  return {
    class_start: classStart,
    class_start_minutes: toMinutes(classStart),
  };
}

function writeAttendanceSettings(nextClassStart) {
  const normalized = normalizeHm(nextClassStart);
  if (!normalized) {
    return null;
  }
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  fs.writeFileSync(SETTINGS_JSON, JSON.stringify({ class_start: normalized }, null, 2), "utf-8");
  return {
    class_start: normalized,
    class_start_minutes: toMinutes(normalized),
  };
}

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function hhmmNow() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function toMinutes(hhmm) {
  const [h, m] = String(hhmm || "0:0").split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) {
    return 0;
  }
  return h * 60 + m;
}

function computeStatus(checkIn, checkOut, classStartMinutes) {
  if (checkOut) {
    return "Left";
  }
  if (!checkIn) {
    return "Absent";
  }
  const delta = toMinutes(checkIn) - classStartMinutes;
  if (delta > 0) {
    return "Late";
  }
  if (delta < 0) {
    return "Early";
  }
  return "Present";
}

function toTitle(person) {
  return String(person || "")
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function mergedTodayRecords() {
  const allAttendance = readCsv(ATTENDANCE_CSV);
  const prototypes = readCsv(PROTOTYPES_CSV);
  const settings = readAttendanceSettings();
  const classStartMinutes = settings.class_start_minutes;
  const today = todayIso();
  const todayAttendance = allAttendance.filter((row) => row.date === today);

  const byPerson = new Map(todayAttendance.map((row) => [row.person, row]));
  const people = prototypes.map((p) => ({ person: p.person, role: p.role || "unknown" }));

  const records = people.map((p) => {
    const attendance = byPerson.get(p.person) || {};
    const checkIn = attendance.check_in || "";
    const checkOut = attendance.check_out || "";
    const arrivalDeltaMinutes = checkIn ? toMinutes(checkIn) - classStartMinutes : 0;
    const lateMinutes = Math.max(0, arrivalDeltaMinutes);
    const earlyMinutes = Math.max(0, -arrivalDeltaMinutes);
    return {
      date: today,
      person: p.person,
      display_name: toTitle(p.person),
      role: p.role,
      check_in: checkIn,
      check_out: checkOut,
      status: computeStatus(checkIn, checkOut, classStartMinutes),
      arrival_delta_minutes: arrivalDeltaMinutes,
      late_minutes: lateMinutes,
      early_minutes: earlyMinutes,
      last_similarity: Number(attendance.last_similarity || 0),
      last_action: attendance.last_action || "",
      updated_at: attendance.updated_at || "",
    };
  });

  const checkedIn = records.filter((r) => r.check_in).length;
  const checkedOut = records.filter((r) => r.check_out).length;
  const totalRegistered = records.length;
  const absent = Math.max(0, totalRegistered - checkedIn);

  return {
    today,
    settings,
    records,
    stats: {
      totalRegistered,
      checkedIn,
      checkedOut,
      absent,
    },
  };
}

function upsertAttendanceForPerson(person, action, similarity) {
  const payload = mergedTodayRecords();
  const today = payload.today;
  const classStartMinutes = payload.settings.class_start_minutes;
  const allAttendance = readCsv(ATTENDANCE_CSV);
  const now = new Date();
  const nowText = `${today} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;

  let row = allAttendance.find((r) => r.date === today && r.person === person);
  if (!row) {
    row = {
      date: today,
      person,
      check_in: "",
      check_out: "",
      status: "Absent",
      arrival_delta_minutes: "0",
      late_minutes: "0",
      early_minutes: "0",
      last_similarity: "0",
      last_action: "",
      updated_at: "",
    };
    allAttendance.push(row);
  }

  const nowHm = hhmmNow();
  if (action === "check_in") {
    if (!row.check_in) {
      row.check_in = nowHm;
    }
  }
  if (action === "check_out") {
    row.check_out = nowHm;
  }

  const arrivalDeltaMinutes = row.check_in ? toMinutes(row.check_in) - classStartMinutes : 0;
  const lateMinutes = Math.max(0, arrivalDeltaMinutes);
  const earlyMinutes = Math.max(0, -arrivalDeltaMinutes);
  row.arrival_delta_minutes = String(arrivalDeltaMinutes);
  row.late_minutes = String(lateMinutes);
  row.early_minutes = String(earlyMinutes);
  row.status = computeStatus(row.check_in, row.check_out, classStartMinutes);
  row.last_similarity = Number(similarity || 0).toFixed(4);
  row.last_action = action;
  row.updated_at = nowText;

  writeAttendanceCsv(allAttendance);

  const updated = mergedTodayRecords();
  const recognized = updated.records.find((r) => r.person === person) || null;
  return { recognized, records: updated.records, stats: updated.stats };
}

function clearTodayAttendance() {
  const today = todayIso();
  const allAttendance = readCsv(ATTENDANCE_CSV);
  const keptRows = allAttendance.filter((row) => row.date !== today);
  writeAttendanceCsv(keptRows);
  return mergedTodayRecords();
}

async function recognizeWithInsightFace(imageData, threshold) {
  try {
    const response = await fetch(RECOGNITION_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ imageData, threshold }),
    });

    if (!response.ok) {
      return {
        known: false,
        similarity: 0,
        threshold,
        message: "Recognition API request failed",
      };
    }

    return await response.json();
  } catch {
    return {
      known: false,
      similarity: 0,
      threshold,
      message: "Recognition API unreachable. Start Python API first.",
    };
  }
}

async function applyAttendanceActionWithFrame(action, imageData) {
  const recognition = await recognizeWithInsightFace(imageData, COSINE_THRESHOLD);
  const similarity = Number(recognition.similarity || 0);

  if (!recognition.known || similarity < COSINE_THRESHOLD || !recognition.person) {
    const current = mergedTodayRecords();
    return {
      recognized: null,
      similarity: Number(similarity.toFixed(4)),
      threshold: COSINE_THRESHOLD,
      message: recognition.message || "Similarity below threshold",
      records: current.records,
      stats: current.stats,
    };
  }

  const result = upsertAttendanceForPerson(recognition.person, action, similarity);
  const recognized = result.recognized;

  return {
    recognized,
    similarity: Number(similarity.toFixed(4)),
    threshold: COSINE_THRESHOLD,
    message: "Matched",
    records: result.records,
    stats: result.stats,
  };
}

function attendanceApiPlugin() {
  return {
    name: "attendance-api-plugin",
    configureServer(server) {
      server.middlewares.use("/api/attendance", (req, res, next) => {
        if (!req.url) {
          next();
          return;
        }

        if (req.method === "GET" && req.url === "/records") {
          const payload = mergedTodayRecords();
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ...payload, threshold: COSINE_THRESHOLD }));
          return;
        }

        if (req.method === "GET" && req.url === "/settings") {
          const settings = readAttendanceSettings();
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ settings }));
          return;
        }

        if (req.method === "POST" && req.url === "/action") {
          let body = "";
          req.on("data", (chunk) => {
            body += chunk;
          });
          req.on("end", async () => {
            let action = "check_in";
            let imageData = "";
            try {
              const parsed = JSON.parse(body || "{}");
              action = parsed.action === "check_out" ? "check_out" : "check_in";
              imageData = parsed.imageData || "";
            } catch {
              action = "check_in";
              imageData = "";
            }

            try {
              const payload = await applyAttendanceActionWithFrame(action, imageData);
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(payload));
            } catch (err) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(
                JSON.stringify({
                  recognized: null,
                  similarity: 0,
                  threshold: COSINE_THRESHOLD,
                  message: `Attendance action failed: ${err?.message || "Unknown error"}`,
                })
              );
            }
          });
          return;
        }

        if (req.method === "POST" && req.url === "/clear-today") {
          const payload = clearTodayAttendance();
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ...payload, threshold: COSINE_THRESHOLD }));
          return;
        }

        if (req.method === "POST" && req.url === "/settings") {
          let body = "";
          req.on("data", (chunk) => {
            body += chunk;
          });
          req.on("end", () => {
            let classStart = "";
            try {
              const parsed = JSON.parse(body || "{}");
              classStart = parsed.class_start || "";
            } catch {
              classStart = "";
            }

            const updated = writeAttendanceSettings(classStart);
            if (!updated) {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ message: "Invalid class_start. Use HH:MM in 24-hour format." }));
              return;
            }

            const payload = mergedTodayRecords();
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ...payload, threshold: COSINE_THRESHOLD }));
          });
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), attendanceApiPlugin()],
});
