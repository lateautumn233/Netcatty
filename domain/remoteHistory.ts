import { RemoteHistoryEntry, RemoteHistorySource } from './models';

const ZSH_EXTENDED_LINE = /^: (\d+):\d+;(.*)$/;

const makeId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `rh-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const cleanCommand = (cmd: string): string => cmd.replace(/\\\n/g, '\n').trim();

export function parseBashHistory(text: string): RemoteHistoryEntry[] {
  if (!text) return [];
  const result: RemoteHistoryEntry[] = [];
  const lines = text.split(/\r?\n/);
  let pendingTimestamp: number | undefined;
  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');
    if (!line) continue;
    // Bash HISTTIMEFORMAT writes a `#<epoch>` line before each command.
    const tsMatch = /^#(\d{9,})$/.exec(line);
    if (tsMatch) {
      pendingTimestamp = Number(tsMatch[1]) * 1000;
      continue;
    }
    const command = cleanCommand(line);
    if (!command) {
      pendingTimestamp = undefined;
      continue;
    }
    result.push({
      id: makeId(),
      command,
      source: 'bash',
      timestamp: pendingTimestamp,
    });
    pendingTimestamp = undefined;
  }
  return result;
}

export function parseZshHistory(text: string): RemoteHistoryEntry[] {
  if (!text) return [];
  const result: RemoteHistoryEntry[] = [];
  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');
    if (!line) continue;
    const extended = ZSH_EXTENDED_LINE.exec(line);
    if (extended) {
      const command = cleanCommand(extended[2] ?? '');
      if (!command) continue;
      result.push({
        id: makeId(),
        command,
        source: 'zsh',
        timestamp: Number(extended[1]) * 1000,
      });
      continue;
    }
    const command = cleanCommand(line);
    if (!command) continue;
    result.push({
      id: makeId(),
      command,
      source: 'zsh',
    });
  }
  return result;
}

export function parseShellHistory(
  source: RemoteHistorySource,
  text: string,
): RemoteHistoryEntry[] {
  return source === 'bash' ? parseBashHistory(text) : parseZshHistory(text);
}

/**
 * Merge multiple history lists, de-dupe by exact command text keeping the most
 * recent occurrence (closer to the end of the file), and cap length.
 */
export function mergeRemoteHistory(
  lists: RemoteHistoryEntry[][],
  max = 1000,
): RemoteHistoryEntry[] {
  const combined: RemoteHistoryEntry[] = lists.flat();
  const seen = new Set<string>();
  const reversed: RemoteHistoryEntry[] = [];
  for (let i = combined.length - 1; i >= 0; i -= 1) {
    const entry = combined[i];
    if (seen.has(entry.command)) continue;
    seen.add(entry.command);
    reversed.push(entry);
  }
  // reversed is newest-first. Cap to max.
  return reversed.slice(0, max);
}
