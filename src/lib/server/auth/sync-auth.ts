import { error, type RequestEvent } from '@sveltejs/kit';

export function requireSyncAuth(event: RequestEvent): void {
  const expectedToken = process.env.SYNC_API_TOKEN?.trim();

  if (!expectedToken && process.env.NODE_ENV !== 'production') {
    return;
  }

  if (!expectedToken) {
    throw error(503, 'Sync authentication is not configured.');
  }

  const authorization = event.request.headers.get('authorization') ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length).trim() : '';

  if (token !== expectedToken) {
    throw error(401, 'Unauthorized sync request.');
  }
}
