import { useState, useEffect } from "react";
import CheckInPanel from "./components/CheckInPanel";
import AdminPanel from "./components/AdminPanel";
import Register from "./components/Register";

export default function App() {
  const [activeTab, setActiveTab] = useState("checkin");
  const [clock, setClock] = useState("");

  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="min-h-screen bg-[#f5f4f0] font-sans">
      {/* Navbar */}
      <nav className="sticky top-0 z-10 flex items-center justify-between h-13 px-6 bg-white border-b border-gray-200">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-gray-900 rounded-md flex items-center justify-center flex-shrink-0">
            <svg className="w-3.5 h-3.5 fill-white" viewBox="0 0 20 20">
              <path d="M10 2a4 4 0 100 8 4 4 0 000-8zm-7 13c0-3 3.13-5 7-5s7 2 7 5v1H3v-1z" />
            </svg>
          </div>
          <span className="text-sm font-semibold tracking-tight text-gray-900">
            FaceAttendance
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setActiveTab("checkin")}
            className={`text-sm font-medium px-3.5 py-1.5 rounded-md transition-colors ${
              activeTab === "checkin"
                ? "bg-gray-100 text-gray-900"
                : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
            }`}
          >
            Check In / Out
          </button>
          <button
            onClick={() => setActiveTab("admin")}
            className={`text-sm font-medium px-3.5 py-1.5 rounded-md transition-colors ${
              activeTab === "admin"
                ? "bg-gray-100 text-gray-900"
                : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
            }`}
          >
            Attendance
          </button>
          <button
            onClick={() => setActiveTab("register")}
            className={`text-sm font-medium px-3.5 py-1.5 rounded-md transition-colors ${
              activeTab === "register"
                ? "bg-gray-100 text-gray-900"
                : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
            }`}
          >
            Register
          </button>
          <span className="ml-2 font-mono text-xs text-gray-400">{clock}</span>
        </div>
      </nav>

      {activeTab === "checkin" ? (
        <CheckInPanel />
      ) : activeTab === "register" ? (
        <Register />
      ) : (
        <AdminPanel />
      )}
    </div>
  );
}
