import { intakeState, pauseIntake, resumeIntake } from '@/server/jobs/intake';
import { sql } from '@/server/db/client';

/** Operator switch for job intake (maintenance / cleanup).
 *    pnpm exec tsx --env-file=.env --env-file=.env.local scripts/studio-intake.ts status
 *    pnpm exec tsx --env-file=.env --env-file=.env.local scripts/studio-intake.ts pause "Phase 0 cleanup"
 *    pnpm exec tsx --env-file=.env --env-file=.env.local scripts/studio-intake.ts resume */
const [cmd, ...rest] = process.argv.slice(2);
const out = cmd === 'pause' ? await pauseIntake(rest.join(' ') || 'maintenance') : cmd === 'resume' ? await resumeIntake() : await intakeState();
console.log(JSON.stringify(out));
await sql().end();
