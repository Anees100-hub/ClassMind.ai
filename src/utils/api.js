export function getAuthToken() {
    return localStorage.getItem('classmind_token');
}

export function getAuthHeaders(extra = {}) {
    const token = getAuthToken();
    return {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...extra,
    };
}

export async function apiFetch(url, options = {}) {
    const headers = {
        ...getAuthHeaders(),
        ...(options.headers || {}),
    };
    if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
    }
    return fetch(url, { ...options, headers });
}

export function clearAuthSession() {
    localStorage.removeItem('classmind_token');
    localStorage.removeItem('classmind_user');
}
