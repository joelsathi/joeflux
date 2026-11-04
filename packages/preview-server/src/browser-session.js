// Browser credentials stay scoped to this origin (including its port). Host cookies
// cannot hold API credentials: unrelated loopback servers would receive them too.
const STORAGE_KEY = 'joeflux-token';
let session;
export function ensureSession() {
  if (!session) {
    const supplied = new URLSearchParams(location.hash.slice(1)).get('token');
    if (supplied) {
      sessionStorage.setItem(STORAGE_KEY, supplied);
      history.replaceState(history.state, '', `${location.pathname}${location.search}`);
    }
    const token = sessionStorage.getItem(STORAGE_KEY);
    session = (async () => {
      if (!token) throw new Error('Open the studio from the link the preview command printed; it carries the session key.');
      const response = await fetch('/api/session', { credentials: 'omit', headers: { 'x-joeflux-token': token } });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? 'Could not open a studio session. Reload the page.');
      return token;
    })().catch((error) => { session = undefined; throw error; });
  }
  return session;
}

// Every API request carries the token header; bodies are always JSON objects.
export async function apiFetch(url, { method, body, signal, headers: extra } = {}) {
  method ??= body === undefined ? 'GET' : 'POST';
  const headers = { ...extra, 'x-joeflux-token': await ensureSession() };
  if (method !== 'GET' && method !== 'HEAD') headers['content-type'] = 'application/json';
  return fetch(url, { method, headers, signal, credentials: 'omit', body: headers['content-type'] ? JSON.stringify(body ?? {}) : undefined });
}

export async function* readEvents(response) {
  if (!response.ok) throw new Error((await response.json()).error);
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      for (let end; (end = buffer.indexOf('\n\n')) >= 0; buffer = buffer.slice(end + 2)) {
        const chunk = buffer.slice(0, end);
        if (chunk.startsWith('data: ')) yield JSON.parse(chunk.slice(6));
      }
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

// EventSource cannot send the API header. Preserve its reconnect behavior with fetch.
export function subscribeEvents(onEvent) {
  const controller = new AbortController();
  let timer;
  const connect = async () => {
    try {
      for await (const event of readEvents(await apiFetch('/api/events', { signal: controller.signal }))) onEvent(event);
    } catch { /* Retry after a dropped connection; bootstrap errors also reach the project loader. */ }
    if (!controller.signal.aborted) timer = setTimeout(connect, 1000);
  };
  connect();
  return () => { controller.abort(); clearTimeout(timer); };
}
