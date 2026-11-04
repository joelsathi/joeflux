// Only the backend-to-host IPC channel can retrieve a key. There is no HTTP key getter.
export function connectionClient(channel = process) {
  let sequence = 0;
  const pending = new Map();
  channel.on('message', message => {
    if (message?.type !== 'connection-result') return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id); clearTimeout(request.timer);
    message.error ? request.reject(new Error(message.error)) : request.resolve(message.result);
  });
  channel.on('disconnect', () => {
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('Desktop connection closed.')); }
    pending.clear();
  });
  const call = (method, ...args) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Setup timed out. Check Terminal, then try again.')); }, 180000);
    pending.set(id, { resolve, reject, timer });
    channel.send({ type: 'connection-request', id, method, args }, error => {
      if (error) { clearTimeout(timer); pending.delete(id); reject(new Error('Desktop connection closed.')); }
    });
  });
  return { status: () => call('status'), action: (...args) => call('action', ...args), key: id => call('key', id) };
}
