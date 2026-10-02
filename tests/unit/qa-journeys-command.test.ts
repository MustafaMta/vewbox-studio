import { describe, expect, it } from 'vitest';
import { playwrightCli, playwrightCommand } from '../../scripts/qa-journeys-command.mjs';

/** scripts/qa-journeys.mjs starts Playwright without a shell (finding 22): it used to spawn `pnpm.cmd` with
 *  `shell: true` on Windows, so a --grep regex with `&` or `|` was run through cmd.exe. Building the command is pure;
 *  nothing is spawned here. */

describe('the journeys command', () => {
  it('runs the Playwright CLI with this Node and no shell; a regex with shell metacharacters stays one argument', () => {
    const grep = 'reference & voice|"Iraqi" > out.txt';
    const c = playwrightCommand({ grep, headed: true, rest: ['--workers=1', 'a b&c'], cli: '/x/cli.js', node: '/usr/bin/node' });
    expect(c.command).toBe('/usr/bin/node');
    expect(c.options).toEqual({ shell: false, windowsHide: true });
    expect(c.args).toEqual(['/x/cli.js', 'test', '--project=journeys', '--reporter=list,html', '--grep', grep, '--headed', '--workers=1', 'a b&c']);
    expect(c.command).not.toMatch(/\.cmd$|pnpm/);
  });
  it('resolves the CLI from the project and defaults to the running Node', () => {
    expect(playwrightCli()).toMatch(/@playwright[\\/]test[\\/]cli\.js$/);
    const c = playwrightCommand();
    expect(c.command).toBe(process.execPath);
    expect(c.args.slice(1)).toEqual(['test', '--project=journeys', '--reporter=list,html']);
  });
});
