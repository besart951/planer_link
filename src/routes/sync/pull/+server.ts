import { json, type RequestHandler } from '@sveltejs/kit';
import { requireSyncAuth } from '$lib/server/auth/sync-auth';
import { getSyncStore } from '$lib/server/sync/store';
import { syncPullRequestSchema } from '$lib/sync/types';

export const POST: RequestHandler = async (event) => {
  requireSyncAuth(event);
  const parsed = syncPullRequestSchema.safeParse(await event.request.json());

  if (!parsed.success) {
    return json({ error: 'Invalid sync pull payload.', issues: parsed.error.issues }, { status: 400 });
  }

  const result = await getSyncStore().pull(parsed.data.device_id, parsed.data.cursor, parsed.data.limit);
  return json(result);
};
