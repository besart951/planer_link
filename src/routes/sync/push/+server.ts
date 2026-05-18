import { json, type RequestHandler } from '@sveltejs/kit';
import { requireSyncAuth } from '$lib/server/auth/sync-auth';
import { getSyncStore } from '$lib/server/sync/store';
import { syncPushRequestSchema } from '$lib/sync/types';

export const POST: RequestHandler = async (event) => {
  requireSyncAuth(event);
  const parsed = syncPushRequestSchema.safeParse(await event.request.json());

  if (!parsed.success) {
    return json({ error: 'Invalid sync push payload.', issues: parsed.error.issues }, { status: 400 });
  }

  const result = await getSyncStore().push(parsed.data.device_id, parsed.data.changes);
  return json(result);
};
