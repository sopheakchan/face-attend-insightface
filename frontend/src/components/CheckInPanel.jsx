import { useEffect, useMemo, useRef, useState } from "react";
import { fetchAttendanceRecords, postAttendanceAction } from "../lib/attendanceApi";

const CAPTURE_SECONDS = 2;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const EXTERNAL_CAMERA_KEYWORDS = ["logitech", "logi", "usb", "webcam", "brio", "c920", "c922", "streamcam"];

function isPreferredExternalCamera(label) {
  const text = String(label || "").toLowerCase();
  return EXTERNAL_CAMERA_KEYWORDS.some((word) => text.includes(word));
}

function stopStreamTracks(stream) {
  if (!stream) {
    return;
  }
  stream.getTracks().forEach((track) => track.stop());
}

function todayStr() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function initialsFromName(name) {
  return String(name || "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((v) => v[0].toUpperCase())
    .join("");
}

function formatClassStartLabel(hhmm) {
  const [hRaw, mRaw] = String(hhmm || "08:00").split(":");
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (!Number.isFinite(h) || !Number.isFinite(m)) {
    return "08:00 AM";
  }
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${String(hour12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${suffix}`;
}

export default function CheckInPanel() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const captureCanvasRef = useRef(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [recognizedPerson, setRecognizedPerson] = useState(null);
  const [lastRecognitionResult, setLastRecognitionResult] = useState(null);
  const [lastAction, setLastAction] = useState(null);
  const [statusMsg, setStatusMsg] = useState("Waiting for action. Camera is ready.");
  const [classStart, setClassStart] = useState("08:00");

  useEffect(() => {
    let mounted = true;

    async function loadSettings() {
      try {
        const payload = await fetchAttendanceRecords();
        if (!mounted) {
          return;
        }
        setClassStart(payload?.settings?.class_start || "08:00");
      } catch {
        if (!mounted) {
          return;
        }
        setClassStart("08:00");
      }
    }

    loadSettings();
    const id = setInterval(loadSettings, 2000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  const recognized = Boolean(recognizedPerson);
  const confidence = useMemo(() => {
    if (!lastRecognitionResult) {
      return null;
    }
    const sim =
      lastRecognitionResult.recognized?.last_similarity ||
      lastRecognitionResult.similarity ||
      0;
    return Math.round((Number(sim) || 0) * 1000) / 10;
  }, [lastRecognitionResult]);

  const resultSimilarity = useMemo(() => {
    if (!lastRecognitionResult) {
      return null;
    }
    return Math.round((Number(lastRecognitionResult.similarity || 0) || 0) * 1000) / 10;
  }, [lastRecognitionResult]);

  const resultThreshold = useMemo(() => {
    if (!lastRecognitionResult) {
      return 0.6;
    }
    return Number(lastRecognitionResult.threshold || 0.6);
  }, [lastRecognitionResult]);

  const badge = useMemo(() => {
    const status = String(recognizedPerson?.status || "Absent");
    if (status === "Present") {
      return { label: "Present", cls: "bg-green-100 text-green-800" };
    }
    if (status === "Late") {
      return { label: "Late", cls: "bg-amber-100 text-amber-800" };
    }
    if (status === "Early") {
      return { label: "Early", cls: "bg-green-100 text-green-800" };
    }
    if (status === "Left") {
      return { label: "Left", cls: "bg-gray-100 text-gray-600" };
    }
    return { label: "Absent", cls: "bg-gray-100 text-gray-500" };
  }, [recognizedPerson]);

  async function startCamera() {
    let stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false,
    });

    const currentDeviceId = stream.getVideoTracks()[0]?.getSettings?.().deviceId || "";
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoInputs = devices.filter((d) => d.kind === "videoinput");
    const preferredExternal = videoInputs.find((d) => isPreferredExternalCamera(d.label));

    if (preferredExternal?.deviceId && preferredExternal.deviceId !== currentDeviceId) {
      try {
        const preferredStream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: preferredExternal.deviceId } },
          audio: false,
        });
        stopStreamTracks(stream);
        stream = preferredStream;
      } catch {
        // Keep current stream as fallback when preferred device cannot be opened.
      }
    }

    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  function captureFrame() {
    const video = videoRef.current;
    if (!video) {
      return "";
    }
    const canvas = captureCanvasRef.current || document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return "";
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  }

  async function handleAction(action) {
    if (isProcessing) {
      return;
    }
    setIsProcessing(true);
    setLastRecognitionResult(null);
    setLastAction(null);
    setStatusMsg("Opening camera...");

    try {
      try {
        await startCamera();
      } catch {
        setStatusMsg("Camera permission blocked or camera busy. Please allow camera access.");
        return;
      }

      setCameraActive(true);
      setStatusMsg(`Camera live. Capturing for ${CAPTURE_SECONDS} seconds...`);

      for (let sec = CAPTURE_SECONDS; sec >= 1; sec -= 1) {
        setCountdown(sec);
        await sleep(1000);
      }

      const imageData = captureFrame();
      const payload = await postAttendanceAction(action, imageData);
      setRecognizedPerson(payload.recognized || null);
      setLastRecognitionResult(payload);
      setLastAction(action);
      
      if (payload.recognized) {
        setStatusMsg(
          `Face recognized: ${payload.recognized.display_name} (sim ${(
            Number(payload.similarity || payload.recognized.last_similarity || 0) * 100
          ).toFixed(1)}%, threshold ${(Number(payload.threshold || 0.6) * 100).toFixed(0)}%)`
        );
      } else {
        const reason = payload.message ? `${payload.message}. ` : "";
        setStatusMsg(
          `${reason}Unknown (sim ${(Number(payload.similarity || 0) * 100).toFixed(1)}% < threshold ${(Number(
            payload.threshold || 0.6
          ) * 100).toFixed(0)}%). No attendance update.`
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown request error";
      setStatusMsg(`API error: ${msg}`);
    } finally {
      stopCamera();
      setCountdown(0);
      setCameraActive(false);
      setIsProcessing(false);
    }
  }

  return (
    <div className="grid grid-cols-2 gap-5 p-5 max-w-5xl mx-auto">
      {/* ── LEFT: Camera ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <span className="text-sm font-semibold text-gray-900">Face Recognition</span>
          <span
            className={`flex items-center gap-1.5 text-xs font-semibold ${
              !lastRecognitionResult ? "text-green-600" : lastRecognitionResult.recognized ? "text-green-600" : "text-red-600"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                !lastRecognitionResult ? "bg-green-500" : lastRecognitionResult.recognized ? "bg-green-500" : "bg-red-500"
              } animate-pulse`}
            />
            LIVE
          </span>
        </div>

        {/* Viewport */}
        <div className="relative bg-[#0a0b0d] flex-1 flex items-center justify-center overflow-hidden"
             style={{ aspectRatio: "4/3" }}>
          <video
            ref={videoRef}
            className={`absolute inset-0 h-full w-full object-cover ${cameraActive ? "opacity-100" : "opacity-0"}`}
            playsInline
            muted
          />
          <canvas ref={captureCanvasRef} className="hidden" />

          {cameraActive && (
            <>
              {/* Grid bg */}
              <div className="absolute inset-0"
                style={{
                  backgroundImage:
                    "linear-gradient(rgba(255,255,255,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.03) 1px,transparent 1px)",
                  backgroundSize: "32px 32px",
                }}
              />

              {/* Face oval + scan */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative w-36 h-44 rounded-full border border-green-500/40 animate-pulse-slow flex items-center justify-center">
                  <div className="absolute top-0 left-0 right-0 bottom-0 rounded-full border border-green-500/10 -m-2" />
                  {/* Scan line */}
                  <div className="absolute left-1/2 -translate-x-1/2 w-32 h-px bg-gradient-to-r from-transparent via-green-400 to-transparent scan-line shadow-green-400/50 shadow-sm" />
                  {/* Ghost face */}
                  <svg className="w-20 h-24 opacity-10 relative z-10" viewBox="0 0 80 96" fill="none">
                    <ellipse cx="40" cy="32" rx="20" ry="24" fill="white" />
                    <ellipse cx="40" cy="84" rx="32" ry="22" fill="white" />
                  </svg>
                </div>

                {/* Corner brackets */}
                <div className="absolute top-5 left-5 w-4 h-4 border-t-2 border-l-2 border-green-400 rounded-tl" />
                <div className="absolute top-5 right-5 w-4 h-4 border-t-2 border-r-2 border-green-400 rounded-tr" />
                <div className="absolute bottom-5 left-5 w-4 h-4 border-b-2 border-l-2 border-green-400 rounded-bl" />
                <div className="absolute bottom-5 right-5 w-4 h-4 border-b-2 border-r-2 border-green-400 rounded-br" />
              </div>
            </>
          )}

          {!cameraActive && !lastRecognitionResult && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm">
              Camera is ready to scan
            </div>
          )}

          {/* Result overlay */}
          {lastRecognitionResult && (
            <div
              className={`absolute inset-0 flex flex-col items-center justify-center p-6 text-center transition-all ${
                lastRecognitionResult.recognized
                  ? "bg-gradient-to-b from-green-950 to-green-900"
                  : "bg-gradient-to-b from-red-950 to-red-900"
              }`}
            >
              {lastRecognitionResult.recognized ? (
                <>
                  {/* Success state */}
                  <div className="aspect-square w-20 rounded-full bg-green-500/20 border-2 border-green-400 flex items-center justify-center mb-5">
                    <svg
                      className="w-10 h-10 text-green-300"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={3}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  </div>
                  <p className="text-3xl font-bold text-white mb-1.5">
                    {lastRecognitionResult.recognized.display_name}
                  </p>
                  <p className="text-sm text-white/70 mb-4">
                    {lastRecognitionResult.recognized.role}
                  </p>
                  <div className={`text-xs font-semibold px-3 py-2 rounded-full mb-6 ${
                    lastAction === "check_in"
                      ? "bg-green-500/30 border border-green-400/50 text-green-200"
                      : "bg-blue-500/30 border border-blue-400/50 text-blue-200"
                  }`}>
                    {lastAction === "check_in"
                      ? `Checked in at ${lastRecognitionResult.recognized.check_in}`
                      : `Checked out at ${lastRecognitionResult.recognized.check_out}`}
                  </div>
                  {/* Confidence bar */}
                  <div className="w-full max-w-xs">
                    <p className="text-xs text-white/60 mb-2">match confidence</p>
                    <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-green-400 to-green-300 transition-all"
                        style={{ width: `${Math.min(confidence, 100)}%` }}
                      />
                    </div>
                    <p className="text-right text-xs font-mono text-white/70 mt-1.5">
                      {confidence}%
                    </p>
                  </div>

                </>
              ) : (
                <>
                  {/* Failure state */}
                  <div className="aspect-square w-20 rounded-full bg-red-500/20 border-2 border-red-400 flex items-center justify-center mb-5">
                    <svg
                      className="w-10 h-10 text-red-300"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={3}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </div>
                  <p className="text-2xl font-bold text-white mb-1.5">Face not recognized</p>
                  <p className="text-sm text-white/70 mb-2">
                    Similarity too low ({resultSimilarity}%)
                  </p>
                  <p className="text-xs text-white/60 mb-6">Please reposition and try again</p>
                  <button
                    type="button"
                    onClick={() => setLastRecognitionResult(null)}
                    className="px-4 py-2 text-xs font-semibold bg-white/10 hover:bg-white/20 text-white rounded-md transition-colors"
                  >
                    Try again
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-t border-gray-200">
            <span className={`w-1.5 h-1.5 rounded-full ${recognized ? "bg-green-500" : "bg-gray-300"}`} />
          <span className="text-xs text-gray-500">{statusMsg}</span>
          {cameraActive && countdown > 0 && (
            <span className="ml-auto font-mono text-xs text-gray-400">{countdown}s</span>
          )}
        </div>
      </div>

      {/* ── RIGHT: Identity + Actions ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <span className="text-sm font-semibold text-gray-900">Identity</span>
          <span className="font-mono text-xs text-gray-400">{todayStr()}</span>
        </div>

        {/* Identity block */}
        <div className="p-4 flex-1">
          {/* Avatar + Name */}
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 border-2 transition-all duration-300
              ${recognized
                ? "bg-green-50 border-green-300 text-green-700"
                : "bg-gray-100 border-gray-200 text-gray-400"}`}
            >
              {recognized ? initialsFromName(recognizedPerson.display_name) : "?"}
            </div>
            <div>
              <p className={`text-base font-semibold tracking-tight transition-colors duration-300
                ${recognized ? "text-gray-900" : "text-gray-400"}`}>
                {recognized ? recognizedPerson.display_name : "Unknown"}
              </p>
              {recognized && (
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-mono text-xs text-gray-400">sim {confidence}%</span>
                </div>
              )}
            </div>
          </div>

          {/* Time Grid */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1.5">Check-in</p>
              <p className={`font-mono text-lg font-medium ${recognizedPerson?.check_in ? "text-gray-900" : "text-gray-300"}`}>
                {recognizedPerson?.check_in || "—"}
              </p>
              {recognizedPerson?.check_in && (
                <p className={`text-[10px] mt-0.5 font-medium ${
                  recognizedPerson.status === "Late"
                    ? "text-amber-600"
                    : recognizedPerson.status === "Early"
                      ? "text-green-600"
                      : "text-green-600"
                }`}>
                  {recognizedPerson.status === "Late"
                    ? `Late +${recognizedPerson?.late_minutes || 0}m`
                    : recognizedPerson.status === "Early"
                      ? `Early ${recognizedPerson?.early_minutes || 0}m`
                      : "On time"}
                </p>
              )}
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1.5">Check-out</p>
              <p className={`font-mono text-lg font-medium ${recognizedPerson?.check_out ? "text-gray-900" : "text-gray-300"}`}>
                {recognizedPerson?.check_out || "—"}
              </p>
              {recognizedPerson?.check_out && (
                <p className="text-[10px] mt-0.5 text-gray-400">Departed</p>
              )}
            </div>
          </div>

          {/* Status row */}
          <div className="flex items-center justify-between pt-3 border-t border-gray-100">
            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${badge.cls}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              {badge.label}
            </span>
            <span className="text-xs text-gray-400">
              {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </span>
          </div>
        </div>

        {/* Class cutoff bar */}
        <div className="mx-4 mb-3 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg">
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wider">Class starts</p>
            <p className="font-mono text-sm font-semibold text-gray-900 mt-0.5">{formatClassStartLabel(classStart)}</p>
          </div>
        </div>

        {/* Buttons */}
        <div className="px-4 pb-4 flex flex-col gap-2">
          <button
            onClick={() => handleAction("check_in")}
            disabled={isProcessing}
            className="w-full py-3 rounded-lg text-sm font-semibold bg-gray-900 text-white
              transition-all hover:bg-gray-700 active:scale-[.99]
              disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none"
          >
            {isProcessing && cameraActive ? "Capturing..." : "Check in"}
          </button>
          <button
            onClick={() => handleAction("check_out")}
            disabled={isProcessing}
            className="w-full py-3 rounded-lg text-sm font-semibold
              border border-gray-200 text-gray-700 bg-white
              transition-all hover:bg-gray-50 active:scale-[.99]
              disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none"
          >
            {isProcessing && cameraActive ? "Capturing..." : "Check out"}
          </button>
        </div>
      </div>

      {/* Scan animation style */}
      <style>{`
        @keyframes scan {
          0%, 100% { top: 20%; opacity: 0.7; }
          50% { top: 72%; opacity: 1; }
        }
        .scan-line { position: absolute; animation: scan 2.4s ease-in-out infinite; }
        @keyframes pulse-slow {
          0%, 100% { opacity: 1; border-color: rgba(34,197,94,0.4); }
          50% { opacity: 0.85; border-color: rgba(34,197,94,0.7); }
        }
        .animate-pulse-slow { animation: pulse-slow 3s ease-in-out infinite; }
      `}</style>
    </div>
  );
}
