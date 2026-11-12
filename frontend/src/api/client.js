const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

async function request(path, options = {}) {
  const headers = { ...options.headers };
  if (options.body != null && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE_URL}${path}`, {
    headers,
    credentials: "include",
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data.errors ? data.errors.join(", ") : data.message || "Request failed";
    const error = new Error(message);
    error.status = res.status;
    throw error;
  }
  return data;
}

export function registerAccount(email, password) {
  return request("/api/auth/register", { method: "POST", body: JSON.stringify({ email, password }) });
}
export function loginAccount(email, password) {
  return request("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
}
export function logoutAccount() { return request("/api/auth/logout", { method: "POST" }); }
export function getCurrentUser() { return request("/api/auth/me"); }

// Households
export function geocodeAddress(address) {
  return request(`/api/households/geocode?address=${encodeURIComponent(address)}`);
}

export function registerHousehold(payload) {
  return request("/api/households", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getMyHousehold() { return request("/api/households/me"); }

export function getHousehold(householdId) {
  return request(`/api/households/${householdId}`);
}

export function getHouseholdStatus(householdId) {
  return request(`/api/households/${householdId}/status`);
}

export function getLatestMonitoring(householdId) {
  return request(`/api/households/${householdId}/monitoring/latest`);
}

export function getMonitoringRuns(householdId, limit = 5) {
  return request(`/api/households/${householdId}/monitoring/runs?limit=${limit}`);
}

export function getHouseholdEarthquakes(householdId, radiusKm = 500) {
  return request(`/api/households/${householdId}/hazards/earthquakes?radius_km=${radiusKm}`);
}

export function getHouseholdWeather(householdId) {
  return request(`/api/households/${householdId}/hazards/weather`);
}

// Alerts
export function getHouseholdAlerts(householdId) {
  return request(`/api/alerts/${householdId}`);
}

export function confirmSafe(householdId) {
  return request(`/api/alerts/${householdId}/confirm-safe`, { method: "POST" });
}

export function startEarthquakeSimulation(password) {
  return request("/api/admin/simulation/earthquake", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

export function confirmSimulationSafe(jobId, householdId) {
  return request(`/api/admin/simulation/earthquake/${encodeURIComponent(jobId)}/${encodeURIComponent(householdId)}/confirm-safe`, { method: "POST" });
}

export function getEarthquakeSimulation(jobId, afterEvent) {
  const cursor = afterEvent == null ? "" : `?after_event=${encodeURIComponent(afterEvent)}`;
  return request(`/api/admin/simulation/earthquake/${encodeURIComponent(jobId)}${cursor}`);
}
