export async function fetchAttendanceRecords() {
  const response = await fetch("/api/attendance/records");
  if (!response.ok) {
    throw new Error("Failed to fetch attendance records");
  }
  return response.json();
}

export async function postAttendanceAction(action, imageData) {
  const response = await fetch("/api/attendance/action", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action, imageData }),
  });

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`Failed to submit attendance action (${response.status}): ${bodyText}`);
  }

  return response.json();
}

export async function clearTodayAttendanceRecords() {
  const response = await fetch("/api/attendance/clear-today", {
    method: "POST",
  });

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`Failed to clear today attendance (${response.status}): ${bodyText}`);
  }

  return response.json();
}

export async function fetchAttendanceSettings() {
  const response = await fetch("/api/attendance/settings");
  if (!response.ok) {
    throw new Error("Failed to fetch attendance settings");
  }
  return response.json();
}

export async function updateAttendanceSettings(classStart) {
  const response = await fetch("/api/attendance/settings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ class_start: classStart }),
  });

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`Failed to update attendance settings (${response.status}): ${bodyText}`);
  }

  return response.json();
}
