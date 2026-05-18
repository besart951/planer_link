import { json, type RequestHandler } from '@sveltejs/kit';
import { requireSyncAuth } from '$lib/server/auth/sync-auth';
import { getSyncStore } from '$lib/server/sync/store';
import { conflictResolutionSchema } from '$lib/sync/types';

export const GET: RequestHandler = async (event) => {
  requireSyncAuth(event);
  const status = event.url.searchParams.get('status') ?? 'open';
  const conflicts = await getSyncStore().listConflicts(status);
  return json({ conflicts });
};

export const PATCH: RequestHandler = async (event) => {
  requireSyncAuth(event);
  const body = await event.request.json();
  const id = typeof body?.id === 'string' ? body.id : '';
  const parsed = conflictResolutionSchema.safeParse(body);

  if (!id || !parsed.success) {
    return json({ error: 'Invalid conflict resolution payload.' }, { status: 400 });
  }

  const conflict = await getSyncStore().resolveConflict(id, parsed.data);
  if (!conflict) {
    return json({ error: 'Conflict not found.' }, { status: 404 });
  }

  return json({ conflict });
};
