// In-memory queue of outbound WhatsApp messages.
//
// The readAndSendJob enqueues messages here (no browser needed).
// The scraperJob drains the queue at the end of each tick using its
// already-open Chrome session — eliminating all profile-lock conflicts.

const _queue = []; // [{ groupName: string, text: string, addedAt: Date }]

export function queueMessage(groupName, text) {
  _queue.push({ groupName, text, addedAt: new Date() });
  console.log(
    `[SendQueue] Queued message for "${groupName}" (${text.length} chars). Queue size: ${_queue.length}`,
  );
}

export function drainQueue() {
  return _queue.splice(0, _queue.length); // return all items and clear queue
}

export function queueSize() {
  return _queue.length;
}
