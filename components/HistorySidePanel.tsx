/**
 * HistorySidePanel — Termius-style remote shell history browser for the
 * terminal side panel. Reads ~/.bash_history and ~/.zsh_history from the
 * focused session and exposes search, paste-to-terminal, run-in-terminal,
 * and save-as-snippet actions.
 */

import {
  Check,
  ClipboardCopy,
  Clipboard as ClipboardIcon,
  Play,
  RefreshCw,
  Save,
  Search,
  Terminal as TerminalIcon,
} from 'lucide-react';
import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n } from '../application/i18n/I18nProvider';
import type { Host, RemoteHistoryEntry } from '../domain/models';
import { cn } from '../lib/utils';
import { ScrollArea } from './ui/scroll-area';
import { Input } from './ui/input';
import type { RemoteHistoryHostState } from '../application/state/useRemoteHistoryState';

export interface HistorySidePanelProps {
  focusedHost: Host | null;
  focusedSessionId: string | null;
  state: RemoteHistoryHostState;
  onFetch: (sessionId: string, hostId: string) => void;
  onPasteToTerminal: (command: string) => void;
  onRunInTerminal: (command: string) => void;
  isVisible?: boolean;
}

const SUPPORTED_PROTOCOLS = new Set(['ssh', 'mosh', 'et']);

const HistorySidePanelInner: React.FC<HistorySidePanelProps> = ({
  focusedHost,
  focusedSessionId,
  state,
  onFetch,
  onPasteToTerminal,
  onRunInTerminal,
  isVisible = true,
}) => {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const protocol = focusedHost?.protocol;
  const isSupportedSession =
    !!focusedHost && !!focusedSessionId && SUPPORTED_PROTOCOLS.has(String(protocol ?? 'ssh'));

  // Auto-fetch on first open per (host, session) combination.
  useEffect(() => {
    if (!isVisible || !isSupportedSession || !focusedHost || !focusedSessionId) return;
    if (state.loading) return;
    if (state.fetchedAt != null || state.error) return;
    onFetch(focusedSessionId, focusedHost.id);
  }, [
    isVisible,
    isSupportedSession,
    focusedHost,
    focusedSessionId,
    state.loading,
    state.fetchedAt,
    state.error,
    onFetch,
  ]);

  const handleRefresh = useCallback(() => {
    if (!focusedHost || !focusedSessionId) return;
    onFetch(focusedSessionId, focusedHost.id);
  }, [focusedHost, focusedSessionId, onFetch]);

  const filtered = useMemo((): RemoteHistoryEntry[] => {
    if (!search.trim()) return state.entries;
    const q = search.toLowerCase();
    return state.entries.filter((e) => e.command.toLowerCase().includes(q));
  }, [state.entries, search]);

  const handleCopy = useCallback(async (entry: RemoteHistoryEntry) => {
    try {
      await navigator.clipboard.writeText(entry.command);
      setCopiedId(entry.id);
      window.setTimeout(() => {
        setCopiedId((current) => (current === entry.id ? null : current));
      }, 1200);
    } catch {
      /* clipboard may be unavailable; swallow silently */
    }
  }, []);

  const handleSaveAsSnippet = useCallback((entry: RemoteHistoryEntry) => {
    window.dispatchEvent(
      new CustomEvent('netcatty:snippets:add', {
        detail: { command: entry.command },
      }),
    );
  }, []);

  if (!isVisible) return null;

  return (
    <div
      className="h-full flex flex-col bg-background overflow-hidden"
      data-section="history-panel"
    >
      {/* Search + refresh */}
      <div className="shrink-0 px-2 py-1.5 border-b border-border/50 flex items-center gap-1.5">
        <div className="relative flex-1 min-w-0">
          <Search
            size={12}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('history.searchPlaceholder')}
            className="h-7 pl-7 text-xs bg-muted/30 border-none"
          />
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={!isSupportedSession || state.loading}
          title={t('history.action.refresh')}
          aria-label={t('history.action.refresh')}
          className="shrink-0 h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-40 disabled:hover:text-muted-foreground disabled:hover:bg-transparent"
        >
          <RefreshCw size={14} className={cn(state.loading && 'animate-spin')} />
        </button>
      </div>

      {/* Host header */}
      {focusedHost && (
        <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 text-[11px] text-muted-foreground border-b border-border/30 min-h-[28px]">
          <TerminalIcon size={10} className="shrink-0" />
          <span className="truncate">{focusedHost.label}</span>
          {state.fetchedAt && (
            <span className="ml-auto shrink-0 opacity-70">
              {t('history.meta.count', { count: state.entries.length })}
            </span>
          )}
        </div>
      )}

      {/* Body */}
      <ScrollArea className="flex-1">
        <div className="py-1">
          {!focusedHost && (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-muted-foreground text-center">
              <TerminalIcon size={24} className="opacity-40 mb-2" />
              <span className="text-xs">{t('history.empty.noSession')}</span>
            </div>
          )}

          {focusedHost && !isSupportedSession && (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-muted-foreground text-center">
              <TerminalIcon size={24} className="opacity-40 mb-2" />
              <span className="text-xs">{t('history.empty.unsupportedProtocol')}</span>
            </div>
          )}

          {focusedHost && isSupportedSession && state.loading && state.entries.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-muted-foreground text-center">
              <RefreshCw size={20} className="opacity-60 mb-2 animate-spin" />
              <span className="text-xs">{t('history.loading')}</span>
            </div>
          )}

          {focusedHost && isSupportedSession && state.error && (
            <div className="px-3 py-4 text-xs text-center">
              <div className="text-destructive mb-2">{state.error}</div>
              <button
                type="button"
                onClick={handleRefresh}
                className="text-primary hover:underline"
              >
                {t('history.action.retry')}
              </button>
            </div>
          )}

          {focusedHost &&
            isSupportedSession &&
            !state.loading &&
            !state.error &&
            state.entries.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 px-4 text-muted-foreground text-center">
                <TerminalIcon size={24} className="opacity-40 mb-2" />
                <span className="text-xs">{t('history.empty.noHistory')}</span>
              </div>
            )}

          {filtered.length === 0 && state.entries.length > 0 && (
            <div className="px-3 py-4 text-xs text-muted-foreground italic text-center">
              {t('common.noResultsFound')}
            </div>
          )}

          {filtered.map((entry) => (
            <HistoryRow
              key={entry.id}
              entry={entry}
              isCopied={copiedId === entry.id}
              onCopy={() => handleCopy(entry)}
              onPaste={() => onPasteToTerminal(entry.command)}
              onRun={() => onRunInTerminal(entry.command)}
              onSave={() => handleSaveAsSnippet(entry)}
              labels={{
                copy: t('history.action.copy'),
                copied: t('history.action.copied'),
                paste: t('history.action.paste'),
                run: t('history.action.run'),
                save: t('history.action.saveAsSnippet'),
              }}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};

interface HistoryRowProps {
  entry: RemoteHistoryEntry;
  isCopied: boolean;
  onCopy: () => void;
  onPaste: () => void;
  onRun: () => void;
  onSave: () => void;
  labels: {
    copy: string;
    copied: string;
    paste: string;
    run: string;
    save: string;
  };
}

const HistoryRow: React.FC<HistoryRowProps> = memo(
  ({ entry, isCopied, onCopy, onPaste, onRun, onSave, labels }) => (
    <div className="group flex items-start gap-2 px-3 py-1.5 hover:bg-accent/50 transition-colors">
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="font-mono text-[11px] whitespace-pre-wrap break-all leading-snug">
          {entry.command}
        </div>
        {entry.timestamp && (
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {new Date(entry.timestamp).toLocaleString()}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <IconButton title={isCopied ? labels.copied : labels.copy} onClick={onCopy}>
          {isCopied ? <Check size={12} /> : <ClipboardCopy size={12} />}
        </IconButton>
        <IconButton title={labels.paste} onClick={onPaste}>
          <ClipboardIcon size={12} />
        </IconButton>
        <IconButton title={labels.run} onClick={onRun}>
          <Play size={12} />
        </IconButton>
        <IconButton title={labels.save} onClick={onSave}>
          <Save size={12} />
        </IconButton>
      </div>
    </div>
  ),
);
HistoryRow.displayName = 'HistoryRow';

const IconButton: React.FC<{
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ title, onClick, children }) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    onClick={onClick}
    className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
  >
    {children}
  </button>
);

export const HistorySidePanel = memo(HistorySidePanelInner);
HistorySidePanel.displayName = 'HistorySidePanel';
