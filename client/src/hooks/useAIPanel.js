import { useState } from 'react';
import { runAIAction } from '../api/client.js';

const CONTEXT_WINDOW = 15; // messages before + after the selected one

/**
 * Manages the per-message AI side panel.
 *
 * @param {Array}  allMessages — full list of loaded messages (for context window)
 * @param {string} [groupName] — source group, stored in the AI log
 */
export function useAIPanel(allMessages = [], groupName = '') {
  const [selectedMsg, setSelectedMsg] = useState(null);
  const [activeTab,   setActiveTab]   = useState('summarize');
  const [loadingTab,  setLoadingTab]  = useState(null);
  const [cache,       setCache]       = useState({});  // `${id}_${action}` → { data?, error? }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function contextFor(msg) {
    if (!msg) return [];
    const idx   = allMessages.findIndex(m => m.id === msg.id);
    if (idx === -1) return [msg];
    const start = Math.max(0, idx - CONTEXT_WINDOW);
    const end   = Math.min(allMessages.length, idx + CONTEXT_WINDOW + 1);
    return allMessages.slice(start, end);
  }

  // ── Fetch ──────────────────────────────────────────────────────────────────

  async function runTab(msg, tab) {
    if (!msg || loadingTab) return;
    const key = `${msg.id}_${tab}`;
    if (cache[key]?.data) return;  // already have a successful result

    setLoadingTab(tab);
    try {
      const context = contextFor(msg);
      const payload = context.map(m => ({
        sender:       m.sender,
        message:      m.message,
        message_time: m.message_time,
        image_url:    m.image_url || undefined,
      }));
      const res = await runAIAction({ messages: payload, action: tab, group_name: groupName || undefined });
      setCache(prev => ({ ...prev, [key]: { data: res.data, error: null } }));
    } catch (err) {
      setCache(prev => ({ ...prev, [key]: { data: null, error: err.message } }));
    } finally {
      setLoadingTab(null);
    }
  }

  // ── Panel controls ─────────────────────────────────────────────────────────

  function openPanel(msg) {
    setSelectedMsg(msg);
    setActiveTab('summarize');
  }

  async function openPanelWithAction(msg, tab) {
    setSelectedMsg(msg);
    setActiveTab(tab);
    await runTab(msg, tab);
  }

  function closePanel() {
    setSelectedMsg(null);
  }

  function switchTab(tab) {
    setActiveTab(tab);
  }

  // ── Derived state ──────────────────────────────────────────────────────────

  const currentKey      = selectedMsg ? `${selectedMsg.id}_${activeTab}` : null;
  const currentResult   = currentKey ? (cache[currentKey] ?? null) : null;
  const contextMessages = selectedMsg ? contextFor(selectedMsg) : [];

  return {
    isOpen:   !!selectedMsg,
    selectedMsg,
    activeTab,
    loadingTab,
    currentResult,
    contextMessages,
    openPanel,
    openPanelWithAction,
    closePanel,
    switchTab,
    runTab,
  };
}
