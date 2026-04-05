export async function postEnrollment(payload) {
  const response = await fetch("/api/enrollment/enroll", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      full_name: payload.fullName,
      role: payload.role,
      frames: payload.frames,
    }),
  });

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`Failed to submit enrollment (${response.status}): ${bodyText}`);
  }

  return response.json();
}
