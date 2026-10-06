import { describe, expect, it } from 'vitest';
import { worktreeTestDatabase } from '../../scripts/lib/test-db';

/** Each git worktree runs the database suites on a database of its own; the main checkout keeps vewbox_test. */
describe('test database per checkout', () => {
  it('a worktree gets vewbox_test_<name>; the main checkout none (vewbox_test)', () => {
    expect(worktreeTestDatabase('D:\\volexar-studio\\volexar-studio\\.claude\\worktrees\\agent-a79620fd8529c855a')).toBe('vewbox_test_a79620fd8529c855a');
    expect(worktreeTestDatabase('/home/x/repo/.claude/worktrees/Product-UI/sub')).toBe('vewbox_test_product_ui');
    expect(worktreeTestDatabase('D:\\volexar-studio\\volexar-studio')).toBeUndefined();
  });
});
