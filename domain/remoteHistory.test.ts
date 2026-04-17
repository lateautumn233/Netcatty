import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseBashHistory,
  parseZshHistory,
  mergeRemoteHistory,
} from './remoteHistory.ts';

test('parseBashHistory: plain lines', () => {
  const out = parseBashHistory(['ls -la', 'cd /tmp', 'echo hi'].join('\n'));
  assert.equal(out.length, 3);
  assert.equal(out[0].command, 'ls -la');
  assert.equal(out[0].source, 'bash');
  assert.equal(out[0].timestamp, undefined);
});

test('parseBashHistory: HISTTIMEFORMAT timestamp lines', () => {
  const text = ['#1700000000', 'ls -la', '#1700000100', 'pwd'].join('\n');
  const out = parseBashHistory(text);
  assert.equal(out.length, 2);
  assert.equal(out[0].command, 'ls -la');
  assert.equal(out[0].timestamp, 1700000000000);
  assert.equal(out[1].command, 'pwd');
  assert.equal(out[1].timestamp, 1700000100000);
});

test('parseBashHistory: skips blank lines and trims', () => {
  const out = parseBashHistory('\n  ls  \n\necho hi\n');
  assert.deepEqual(
    out.map((e) => e.command),
    ['ls', 'echo hi'],
  );
});

test('parseZshHistory: plain lines', () => {
  const out = parseZshHistory(['ls', 'cd /tmp'].join('\n'));
  assert.equal(out.length, 2);
  assert.equal(out[0].source, 'zsh');
  assert.equal(out[0].timestamp, undefined);
});

test('parseZshHistory: EXTENDED_HISTORY format', () => {
  const text = [': 1700000000:0;ls -la', ': 1700000100:0;pwd'].join('\n');
  const out = parseZshHistory(text);
  assert.equal(out.length, 2);
  assert.equal(out[0].command, 'ls -la');
  assert.equal(out[0].timestamp, 1700000000000);
  assert.equal(out[1].command, 'pwd');
});

test('mergeRemoteHistory: dedupes keeping most recent occurrence', () => {
  const a = parseBashHistory(['ls', 'pwd', 'ls'].join('\n'));
  const b = parseZshHistory([': 1700000000:0;ls', ': 1700000100:0;whoami'].join('\n'));
  const merged = mergeRemoteHistory([a, b]);
  const commands = merged.map((e) => e.command);
  // Newest-first, unique
  assert.deepEqual(commands, ['whoami', 'ls', 'pwd']);
});

test('mergeRemoteHistory: caps to max', () => {
  const entries = Array.from({ length: 50 }, (_, i) => `cmd-${i}`).join('\n');
  const merged = mergeRemoteHistory([parseBashHistory(entries)], 10);
  assert.equal(merged.length, 10);
  // Newest-first means cmd-49 comes first
  assert.equal(merged[0].command, 'cmd-49');
});
