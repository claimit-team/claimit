/**
 * SSE resume helpers for the notifications stream (ticket 5.11 / BUG-123 S2).
 *
 * The api-gateway stamps every notification frame with a composite SSE
 * `id:` of the form `<created_at>|<_id>` (see services/event_stream.py).
 * On reconnect the client passes the last id it saw back as the
 * `last_event_id` query param so the new stream resumes exactly past that
 * event instead of reseeding its watermark to now() — which would silently
 * drop any proactive card written during the disconnect gap.
 *
 * Query-param (not the Last-Event-ID header) because the stream uses
 * query-param auth and useProactiveAssistant does a manual reconnect
 * (a fresh EventSource), which does not carry the browser's automatic
 * Last-Event-ID header.
 */

/**
 * Build the events-stream URL. `lastEventId` is appended only when present,
 * so the first connection omits it and the server starts from now().
 */
export function buildStreamUrl(
  apiBaseUrl: string,
  token: string,
  lastEventId?: string | null,
): string {
  let url = `${apiBaseUrl}/api/v1/events/stream?token=${encodeURIComponent(token)}`;
  if (lastEventId) {
    url += `&last_event_id=${encodeURIComponent(lastEventId)}`;
  }
  return url;
}
