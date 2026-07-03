async function parsePayload(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return response.json();
  const text = await response.text();
  return text ? { error: text } : {};
}

export async function requestJson(url, options = {}) {
  const { method = "GET", payload } = options;
  const response = await fetch(url, {
    method,
    credentials: "same-origin",
    headers: payload ? { "Content-Type": "application/json" } : {},
    body: payload ? JSON.stringify(payload) : undefined
  });
  const data = await parsePayload(response);
  if (!response.ok) {
    const error = new Error(data?.error || `HTTP ${response.status}`);
    error.status = response.status;
    error.code = data?.code || "";
    error.data = data;
    throw error;
  }
  return data;
}

export async function getJson(url) {
  return requestJson(url);
}

export async function postJson(url, payload) {
  return requestJson(url, { method: "POST", payload });
}
