import { useEffect, useRef, useState } from "react";
import { postEnrollment } from "../lib/enrollmentApi";

const CAPTURE_SECONDS = 5;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function todayStr() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function Register() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const captureCanvasRef = useRef(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [framesCapture, setFramesCaptured] = useState(0);
  const [statusMsg, setStatusMsg] = useState("Ready to register. Enter your details below.");
  
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("student");
  const [enrollmentResult, setEnrollmentResult] = useState(null);
  const [capturedFrames, setCapturedFrames] = useState([]);

  async function startCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: false,
    });
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

  async function handleStartCapture() {
    // Validate input
    if (!fullName.trim()) {
      setStatusMsg("Please enter your full name");
      return;
    }

    if (isProcessing) {
      return;
    }

    setIsProcessing(true);
    setEnrollmentResult(null);
    setCapturedFrames([]);
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
      const frames = [];

      for (let sec = CAPTURE_SECONDS; sec >= 1; sec -= 1) {
        setCountdown(sec);
        // Capture 2 frames per second for better enrollment
        for (let i = 0; i < 2; i++) {
          frames.push(captureFrame());
          await sleep(500);
        }
      }

      setCapturedFrames(frames);
      setFramesCaptured(frames.length);

      // Send to backend for enrollment
      setStatusMsg("Processing frames and computing embeddings...");
      const result = await postEnrollment({
        fullName: fullName.trim(),
        role,
        frames,
      });

      setEnrollmentResult(result);

      if (result.success) {
        setStatusMsg(`✓ Successfully registered ${fullName} with ${result.samples_used} frames`);
      } else {
        setStatusMsg(`Error: ${result.message || "Unknown error during enrollment"}`);
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

  function handleReset() {
    setFullName("");
    setRole("student");
    setEnrollmentResult(null);
    setCapturedFrames([]);
    setFramesCaptured(0);
    setStatusMsg("Ready to register. Enter your details below.");
  }

  const canCapture = fullName.trim().length > 0 && !isProcessing;

  return (
    <div className="grid grid-cols-2 gap-5 p-5 max-w-5xl mx-auto">
      {/* ── LEFT: Face Capture ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <span className="text-sm font-semibold text-gray-900">Face Capture</span>
          <span
            className={`flex items-center gap-1.5 text-xs font-semibold ${
              !enrollmentResult ? "text-green-600" : enrollmentResult.success ? "text-green-600" : "text-red-600"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                !enrollmentResult ? "bg-green-500" : enrollmentResult.success ? "bg-green-500" : "bg-red-500"
              } ${!enrollmentResult ? "animate-pulse" : ""}`}
            />
            {cameraActive ? "LIVE" : "READY"}
          </span>
        </div>

        {/* Viewport */}
        <div
          className="relative bg-[#0a0b0d] flex-1 flex items-center justify-center overflow-hidden"
          style={{ aspectRatio: "4/3" }}
        >
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
              <div
                className="absolute inset-0"
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

          {!cameraActive && !enrollmentResult && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <svg className="w-16 h-16 text-gray-300 mb-3" viewBox="0 0 80 96" fill="none">
                <ellipse cx="40" cy="32" rx="20" ry="24" fill="currentColor" />
                <ellipse cx="40" cy="84" rx="32" ry="22" fill="currentColor" />
              </svg>
              <p className="text-gray-500 text-sm">Camera ready to capture</p>
            </div>
          )}

          {/* Result overlay */}
          {enrollmentResult && (
            <div
              className={`absolute inset-0 flex flex-col items-center justify-center p-6 text-center transition-all ${
                enrollmentResult.success
                  ? "bg-gradient-to-b from-green-950 to-green-900"
                  : "bg-gradient-to-b from-red-950 to-red-900"
              }`}
            >
              {enrollmentResult.success ? (
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
                  <p className="text-2xl font-bold text-white mb-1.5">Registration Successful</p>
                  <p className="text-sm text-white/70 mb-2">{fullName}</p>
                  <p className="text-sm text-white/70 mb-4">Frames captured: {enrollmentResult.samples_used}</p>
                  <div className="text-xs font-semibold px-3 py-2 rounded-full bg-green-500/30 border border-green-400/50 text-green-200">
                    Role: {enrollmentResult.role}
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
                  <p className="text-2xl font-bold text-white mb-1.5">Registration Failed</p>
                  <p className="text-sm text-white/70 mb-6">{enrollmentResult.message}</p>
                  <button
                    type="button"
                    onClick={handleReset}
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
          <span className={`w-1.5 h-1.5 rounded-full ${cameraActive ? "bg-green-500" : "bg-gray-300"}`} />
          <span className="text-xs text-gray-500">{statusMsg}</span>
          {cameraActive && countdown > 0 && (
            <span className="ml-auto font-mono text-xs text-gray-400">{countdown}s</span>
          )}
          {cameraActive && framesCapture > 0 && (
            <span className="ml-auto font-mono text-xs text-green-600">{framesCapture} frames</span>
          )}
        </div>
      </div>

      {/* ── RIGHT: Registration Details ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <span className="text-sm font-semibold text-gray-900">Registration details</span>
          <span className="font-mono text-xs text-gray-400">{todayStr()}</span>
        </div>

        {/* Form Section */}
        <div className="p-4 flex-1 flex flex-col gap-4">
          {/* Step 1: Face Capture */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-full bg-blue-100 border border-blue-300 flex items-center justify-center text-xs font-semibold text-blue-600">
                1
              </div>
              <span className="text-sm font-semibold text-gray-700">Capture Face</span>
            </div>
            <button
              onClick={handleStartCapture}
              disabled={!canCapture || isProcessing}
              className="w-full py-3 rounded-lg text-sm font-semibold bg-blue-600 text-white
                transition-all hover:bg-blue-700 active:scale-[.99]
                disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none"
            >
              {isProcessing && cameraActive ? "Capturing..." : "Start Capture"}
            </button>
            {framesCapture > 0 && (
              <p className="text-xs text-gray-500 mt-2">✓ Captured {framesCapture} frames</p>
            )}
          </div>

          {/* Step 2: Personal Details */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-full bg-purple-100 border border-purple-300 flex items-center justify-center text-xs font-semibold text-purple-600">
                2
              </div>
              <span className="text-sm font-semibold text-gray-700">Personal Details</span>
            </div>

            {/* Full Name Input */}
            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Full name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Sophea Meas"
                disabled={enrollmentResult !== null}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm
                  focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400
                  disabled:bg-gray-50 disabled:text-gray-400"
              />
            </div>

            {/* Role Selection */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">Role</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setRole("student")}
                  disabled={enrollmentResult !== null}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                    role === "student"
                      ? "bg-blue-100 border border-blue-300 text-blue-700"
                      : "border border-gray-200 text-gray-600 hover:bg-gray-50"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  👤 Student
                </button>
                <button
                  onClick={() => setRole("teacher")}
                  disabled={enrollmentResult !== null}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                    role === "teacher"
                      ? "bg-orange-100 border border-orange-300 text-orange-700"
                      : "border border-gray-200 text-gray-600 hover:bg-gray-50"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  🎓 Teacher
                </button>
              </div>
            </div>
          </div>

          {/* Status Message */}
          {enrollmentResult && (
            <div
              className={`p-3 rounded-lg text-xs ${
                enrollmentResult.success
                  ? "bg-green-50 text-green-700 border border-green-200"
                  : "bg-red-50 text-red-700 border border-red-200"
              }`}
            >
              {enrollmentResult.success
                ? `✓ ${fullName} registered successfully with ${enrollmentResult.samples_used} enrollment samples`
                : `✗ ${enrollmentResult.message}`}
            </div>
          )}
        </div>

        {/* Footer Buttons */}
        <div className="px-4 pb-4 flex flex-col gap-2">
          {enrollmentResult && (
            <button
              onClick={handleReset}
              className="w-full py-3 rounded-lg text-sm font-semibold bg-gray-900 text-white
                transition-all hover:bg-gray-700 active:scale-[.99]"
            >
              Register Another
            </button>
          )}
          <span className="text-xs text-center text-gray-400 py-2">
            {enrollmentResult === null
              ? "Complete face capture and details to register"
              : enrollmentResult.success
                ? "Ready to register another person"
                : "Please try again"}
          </span>
        </div>
      </div>

      {/* Scan animation style */}
      <style>{`
        @keyframes scan {
          0%, 100% { top: 20%; opacity: 0.7; }
          50% { top: 60%; opacity: 0.3; }
        }
        .scan-line {
          animation: scan 2s ease-in-out infinite;
        }
        @keyframes pulse-slow {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .animate-pulse-slow {
          animation: pulse-slow 3s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
      `}</style>
    </div>
  );
}
