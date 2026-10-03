import os from 'node:os';
import path from 'node:path';
import { markTestLibrary } from '../../src/server/test-guard';

/** UNIT TESTS NEVER REACH A REAL DATABASE OR LIBRARY (docs/BACKEND-AUDIT-2026-10.md C3): whatever the shell or a .env
 *  says, DATABASE_URL points at a closed port with a test name, LIBRARY_ROOT at a marked scratch folder, and reset is
 *  off unless a test turns it on for itself. A test that needs other values stubs them (vi.stubEnv). */
process.env.DATABASE_URL = 'postgres://unit:unit@127.0.0.1:1/vewbox_unit_test';
process.env.LIBRARY_ROOT = markTestLibrary(path.join(os.tmpdir(), 'vewbox-unit-library'));
delete process.env.VEWBOX_ALLOW_RESET;
