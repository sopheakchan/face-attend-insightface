import { useEffect, useMemo, useState } from "react";
import {
  clearTodayAttendanceRecords,
  fetchAttendanceRecords,
  fetchAttendanceSettings,
  updateAttendanceSettings,
} from "../lib/attendanceApi";
import ConfirmDialog from "./ConfirmDialog";

function formatClassStartLabel(hhmm) {
  const [hRaw, mRaw] = String(hhmm || "08:00").split(":");
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (!Number.isFinite(h) || !Number.isFinite(m)) {
    return "08:00 AM";
  }
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${suffix}`;
}

function RolePill({ role }) {
  return (
    <span
      className={`inline-block text-xs font-semibold px-2 py-0.5 rounded
      ${role === "student" ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-800"}`}
    >
      {role}
    </span>
  );
}

function StatusChip({ status, lateMinutes, earlyMinutes }) {
  const lm = Number(lateMinutes || 0);
  const em = Number(earlyMinutes || 0);
  const map = {
    Present: {
      label: "Present",
      dot: "bg-green-500",
      cls: "bg-green-100 text-green-800",
    },
    Late: {
      label: `Late${lm ? ` +${lm}m` : ""}`,
      dot: "bg-amber-500",
      cls: "bg-amber-100 text-amber-800",
    },
    Early: {
      label: `Early${em ? ` ${em}m` : ""}`,
      dot: "bg-green-500",
      cls: "bg-green-100 text-green-800",
    },
    Left: {
      label: "Left",
      dot: "bg-gray-400",
      cls: "bg-gray-100 text-gray-600",
    },
    Absent: {
      label: "Absent",
      dot: "bg-red-500",
      cls: "bg-red-100 text-red-700",
    },
  };
  const s = map[status] || map.Absent;
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded ${s.cls}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

function CheckInStatusChip({ lateMinutes, earlyMinutes, checkIn }) {
  const lm = Number(lateMinutes || 0);
  const em = Number(earlyMinutes || 0);
  
  // Only show check-in status if person actually checked in
  if (!checkIn) {
    return (
      <span className="text-xs text-gray-300">—</span>
    );
  }
  
  if (lm > 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded bg-amber-100 text-amber-800">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
        Late +{lm}m
      </span>
    );
  }
  
  if (em > 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded bg-blue-100 text-blue-800">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
        Early {em}m
      </span>
    );
  }
  
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded bg-green-100 text-green-800">
      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
      On-time
    </span>
  );
}

const STAT_CONFIG = [
  { label: "Total registered", key: "totalRegistered", cls: "text-gray-900" },
  { label: "Checked in", key: "checkedIn", cls: "text-green-600" },
  { label: "Checked out", key: "checkedOut", cls: "text-gray-900" },
  { label: "Absent", key: "absent", cls: "text-amber-600" },
];

export default function AdminPanel() {
  const [search, setSearch] = useState("");
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [roleFilter, setRoleFilter] = useState("");
  const [rows, setRows] = useState([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isSavingClassStart, setIsSavingClassStart] = useState(false);
  const [classStart, setClassStart] = useState("08:00");
  const [classStartDraft, setClassStartDraft] = useState("08:00");
  const [classStartSaveStatus, setClassStartSaveStatus] = useState("");
  const [isEditingClassStart, setIsEditingClassStart] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [stats, setStats] = useState({
    totalRegistered: 0,
    checkedIn: 0,
    checkedOut: 0,
    absent: 0,
  });

  async function loadRecords() {
    const payload = await fetchAttendanceRecords();
    setRows(payload.records || []);
    setStats(
      payload.stats || {
        totalRegistered: 0,
        checkedIn: 0,
        checkedOut: 0,
        absent: 0,
      },
    );
  }

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const [payload, settingsPayload] = await Promise.all([
          fetchAttendanceRecords(),
          fetchAttendanceSettings(),
        ]);
        if (!mounted) {
          return;
        }
        setRows(payload.records || []);
        setStats(
          payload.stats || {
            totalRegistered: 0,
            checkedIn: 0,
            checkedOut: 0,
            absent: 0,
          },
        );
        const nextClassStart =
          settingsPayload?.settings?.class_start ||
          payload?.settings?.class_start ||
          "08:00";
        setClassStart(nextClassStart);
        if (!isEditingClassStart && !isSavingClassStart) {
          setClassStartDraft(nextClassStart);
        }
      } catch {
        if (!mounted) {
          return;
        }
        setRows([]);
      }
    }

    load();
    const id = setInterval(load, 2000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [isEditingClassStart, isSavingClassStart]);

  async function handleRefresh() {
    setActionMessage("");
    setIsRefreshing(true);
    try {
      await loadRecords();
      setActionMessage("Attendance refreshed.");
    } catch {
      setActionMessage("Refresh failed. Please try again.");
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleClearToday() {
    setActionMessage("");
    setIsClearing(true);
    try {
      const payload = await clearTodayAttendanceRecords();
      setRows(payload.records || []);
      setStats(
        payload.stats || {
          totalRegistered: 0,
          checkedIn: 0,
          checkedOut: 0,
          absent: 0,
        },
      );
      setActionMessage("Today history cleared.");
    } catch {
      setActionMessage("Clear today failed. Please try again.");
    } finally {
      setIsClearing(false);
      setShowClearConfirm(false);
    }
  }

  async function handleSaveClassStart() {
    if (!classStartDraft || classStartDraft === classStart) {
      setClassStartSaveStatus("");
      return;
    }
    setActionMessage("");
    setClassStartSaveStatus("Saving...");
    setIsSavingClassStart(true);
    try {
      const payload = await updateAttendanceSettings(classStartDraft);
      setRows(payload.records || []);
      setStats(
        payload.stats || {
          totalRegistered: 0,
          checkedIn: 0,
          checkedOut: 0,
          absent: 0,
        },
      );
      const savedClassStart = payload?.settings?.class_start || classStartDraft;
      setClassStart(savedClassStart);
      setClassStartDraft(savedClassStart);
      setClassStartSaveStatus("");
      setActionMessage(
        `Class start updated to ${formatClassStartLabel(savedClassStart)}.`,
      );
    } catch {
      setClassStartSaveStatus("Not saved");
      setActionMessage(
        "Failed to update class start. Use HH:MM (24-hour), for example 08:00 or 12:00.",
      );
    } finally {
      setIsSavingClassStart(false);
    }
  }

  function csvEscape(value) {
    const text = String(value ?? "");
    if (text.includes(",") || text.includes("\n") || text.includes('"')) {
      return `"${text.replace(/\"/g, '""')}"`;
    }
    return text;
  }

  function getCheckInStatusText(lateMinutes, earlyMinutes, checkIn) {
    if (!checkIn) {
      return "";
    }
    const lm = Number(lateMinutes || 0);
    const em = Number(earlyMinutes || 0);
    if (lm > 0) {
      return `Late +${lm}m`;
    }
    if (em > 0) {
      return `Early ${em}m`;
    }
    return "On-time";
  }

  function handleDownloadCurrentView() {
    const lines = [
      "Total registered,Checked in,Checked out,Absent",
      [stats.totalRegistered, stats.checkedIn, stats.checkedOut, stats.absent]
        .map(csvEscape)
        .join(","),
      "",
      "Name,Role,Check-in,Check-in Status,Check-out,Status",
      ...filtered.map((r) =>
        [
          r.display_name || "",
          r.role || "",
          r.check_in || "",
          getCheckInStatusText(r.late_minutes, r.early_minutes, r.check_in),
          r.check_out || "",
          r.status || "",
        ]
          .map(csvEscape)
          .join(","),
      ),
    ];

    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setActionMessage(`Downloaded ${filtered.length} row(s).`);
  }

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const q = search.toLowerCase();
      const displayName = String(r.display_name || "").toLowerCase();
      const person = String(r.person || "").toLowerCase();
      const matchSearch = !q || displayName.includes(q) || person.includes(q);
      const matchRole = !roleFilter || r.role === roleFilter;
      return matchSearch && matchRole;
    });
  }, [rows, search, roleFilter]);

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="p-5 max-w-5xl mx-auto">
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h1 className="text-base font-semibold tracking-tight text-gray-900">
            Attendance records
          </h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing || isClearing}
              className="h-8 px-3 text-xs font-semibold rounded-md border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-60"
            >
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </button>
            <button
              type="button"
              onClick={() => setShowClearConfirm(true)}
              disabled={isRefreshing || isClearing}
              className="h-8 px-3 text-xs font-semibold rounded-md border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-60"
            >
              {isClearing ? "Clearing..." : "Clear history"}
            </button>
            <button
              type="button"
              onClick={handleDownloadCurrentView}
              disabled={isRefreshing || isClearing}
              className="h-8 px-3 text-xs font-semibold rounded-md border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-60"
            >
              Export data
            </button>
            <span className="font-mono text-xs text-gray-400">{today}</span>
          </div>
        </div>

        {actionMessage ? (
          <div className="px-5 py-2 border-b border-gray-200 bg-gray-50">
            <p className="text-xs text-gray-600">{actionMessage}</p>
          </div>
        ) : null}

        {/* Stats */}
        <div className="grid grid-cols-4 border-b border-gray-200">
          {STAT_CONFIG.map((s, i) => (
            <div
              key={s.key}
              className={`px-5 py-4 ${i < STAT_CONFIG.length - 1 ? "border-r border-gray-200" : ""}`}
            >
              <p className="text-xs text-gray-400 mb-1.5 tracking-wide">
                {s.label}
              </p>
              <p className={`text-2xl font-semibold tracking-tight ${s.cls}`}>
                {stats[s.key]}
              </p>
            </div>
          ))}
        </div>

        {/* Class cutoff note */}
        <div className="px-5 py-2.5 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
          <svg
            className="w-3.5 h-3.5 text-amber-600 flex-shrink-0"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h3.25a.75.75 0 000-1.5H10.75V5z"
              clipRule="evenodd"
            />
          </svg>
          <span className="text-xs text-amber-700 font-semibold">
            Class starts at{" "}
            <span className="font-mono font-semibold">
              {formatClassStartLabel(classStart)}
            </span>
            . Arrivals after {classStart} are marked{" "}
            <span className="font-bold text-red bg-red-100 px-1.5 py-0.5 rounded">
              Late
            </span>
          </span>
        </div>

        <div className="px-5 py-3 border-b border-gray-200 bg-gray-50 flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-600">
            Class start
          </span>
          <input
            type="time"
            value={classStartDraft}
            onFocus={() => setIsEditingClassStart(true)}
            onBlur={() => {
              setIsEditingClassStart(false);
              if (classStartDraft !== classStart) {
                handleSaveClassStart();
              }
            }}
            onChange={(e) => {
              setClassStartDraft(e.target.value);
              setClassStartSaveStatus("Unsaved changes");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSaveClassStart();
              }
            }}
            className="h-8 px-2.5 text-sm bg-white border border-gray-300 rounded-md text-gray-700 outline-none focus:border-gray-400"
          />
          <button
            type="button"
            onClick={handleSaveClassStart}
            disabled={isSavingClassStart || classStartDraft === classStart}
            className="h-7 px-2.5 text-[11px] font-medium rounded-md border border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100 disabled:opacity-40"
          >
            {isSavingClassStart ? "Saving..." : "Save"}
          </button>
          {classStartSaveStatus ? (
            <span
              className={`text-[11px] ${
                classStartSaveStatus === "Not saved"
                  ? "text-rose-500"
                  : "text-gray-500"
              }`}
            >
              {classStartSaveStatus}
            </span>
          ) : null}
        </div>

        {/* Controls */}
        <div className="flex gap-2 px-4 py-3 border-b border-gray-200">
          {/* Search */}
          <div className="relative flex-1">
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
              />
            </svg>
            <input
              type="text"
              placeholder="Search name or ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-8 pl-8 pr-3 text-sm bg-gray-50 border border-gray-200 rounded-lg
                text-gray-900 placeholder-gray-400 outline-none focus:border-gray-300 transition-colors"
            />
          </div>

          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="h-8 px-2.5 text-sm bg-gray-50 border border-gray-200 rounded-lg
              text-gray-600 outline-none cursor-pointer focus:border-gray-300 transition-colors"
          >
            <option value="">All roles</option>
            <option value="student">Student</option>
            <option value="teacher">Teacher</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {["Name", "Role", "Check-in", "Check-in Status", "Check-out", "Status"].map(
                  (h) => (
                    <th
                      key={h}
                      className="text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400 px-5 py-3"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-10 text-center text-sm text-gray-400"
                  >
                    No records match your filters
                  </td>
                </tr>
              ) : (
                filtered.map((r, i) => (
                  <tr
                    key={r.person}
                    className={`border-b border-gray-100 hover:bg-gray-50 transition-colors
                      ${i === filtered.length - 1 ? "border-b-0" : ""}`}
                  >
                    <td className="px-5 py-3">
                      <p className="text-sm font-semibold text-gray-900">
                        {r.display_name}
                      </p>
                      <p className="text-[11px] font-mono text-gray-400 mt-0.5">
                        {r.person}
                      </p>
                    </td>
                    <td className="px-5 py-3">
                      <RolePill role={r.role} />
                    </td>
                    <td className="px-5 py-3 font-mono text-sm text-gray-900">
                      {r.check_in || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-5 py-3">
                      <CheckInStatusChip
                        lateMinutes={r.late_minutes}
                        earlyMinutes={r.early_minutes}
                        checkIn={r.check_in}
                      />
                    </td>
                    <td className="px-5 py-3 font-mono text-sm text-gray-900">
                      {r.check_out || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-5 py-3">
                      <StatusChip
                        status={r.status}
                        lateMinutes={r.late_minutes}
                        earlyMinutes={r.early_minutes}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-200 bg-gray-50">
          <p className="text-xs text-gray-400">
            {filtered.length} of {stats.totalRegistered} records shown
          </p>
        </div>
      </div>
      <ConfirmDialog
        open={showClearConfirm}
        onConfirm={handleClearToday}
        onCancel={() => setShowClearConfirm(false)}
        isLoading={isClearing}
      />
    </div>
  );
}
