import { json, route } from '@/server/http';
import { bootstrap } from '@/server/bootstrap';
import { capabilities } from '@/server/env';
import { readState } from '@/server/studio/engine';
import { settingsHonoured } from '@/domain/settings';

export const dynamic = 'force-dynamic';

/** THE SETTINGS AND WHETHER EACH TAKES EFFECT TODAY: `{ settings, honoured: { videoModel: false, … }, notes: { … } }`
 *  (src/domain/settings.ts settingsHonoured). Read only: settings change through the `updateSettings` command. */
export const GET = route(async () => {
  await bootstrap();
  const { state } = await readState();
  return json({ settings: state.settings, ...settingsHonoured({ minimax: capabilities().minimax }) }, { headers: { 'Cache-Control': 'no-store' } });
});
