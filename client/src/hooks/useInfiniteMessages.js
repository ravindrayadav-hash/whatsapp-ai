import { useState, useEffect, useCallback, useRef } from "react";
import { fetchMessages } from "../api/client.js";

// Increment to force-reload from page 1 without changing group/filter params.

const PAGE_SIZE = 50;

/**
 * Infinite-scroll pagination hook for messages.
 *
 * Owns all fetch / pagination / dedup / IntersectionObserver logic.
 * The component only needs to attach `sentinelRef` to a bottom sentinel div.
 *
 * Design notes:
 *  - pageRef / loadingRef / hasMoreRef are plain refs so `loadMore` never
 *    closes over stale state and never needs to be recreated.
 *  - `loadMoreRef` keeps the observer callback stable — the observer is set up
 *    once and never torn down / recreated as state changes.
 *  - A string `filterKey` (not object identity) drives the reset + initial-load
 *    effect so filter-object re-creation doesn't cause spurious fetches.
 *
 * @param {string} groupName
 * @param {{ from?: string, to?: string, sender?: string, order?: string }} [opts]
 */
export function useInfiniteMessages(
  groupName,
  { from = "", to = "", sender = "", order = "ASC" } = {},
) {
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [total, setTotal] = useState(0);
  const [reloadTick, setReloadTick] = useState(0);

  // Mutable refs — read synchronously inside callbacks to avoid stale closures
  const pageRef = useRef(0);
  const loadingRef = useRef(false);
  const hasMoreRef = useRef(true);

  // DOM ref returned to the component; attach to a sentinel div at list bottom
  const sentinelRef = useRef(null);

  // Stable key derived from primitive values — changes only when content changes,
  // not on every render (avoids object-identity issues with inline options)
  // reloadTick is included so incrementing it resets + refetches from page 1
  const filterKey = [groupName, from, to, sender, order, reloadTick].join("|");

  // ── Core fetch function ──────────────────────────────────────────────────
  const loadMore = useCallback(async () => {
    if (!groupName || loadingRef.current || !hasMoreRef.current) return;

    loadingRef.current = true;
    setLoading(true);

    const nextPage = pageRef.current + 1;

    try {
      const res = await fetchMessages(groupName, {
        page: nextPage,
        limit: PAGE_SIZE,
        order,
        ...(from && { from }),
        ...(to && { to }),
        ...(sender && { sender }),
      });

      const batch = Array.isArray(res.data) ? res.data : [];
      const more = res.hasMore ?? false;

      // Page 1 → replace; subsequent pages → append
      setMessages((prev) => (nextPage === 1 ? batch : [...prev, ...batch]));
      setHasMore(more);
      setTotal(res.total ?? 0);

      pageRef.current = nextPage;
      hasMoreRef.current = more;
    } catch (e) {
      setError(e.message);
      hasMoreRef.current = false;
    } finally {
      loadingRef.current = false;
      setLoading(false);

      // If the sentinel is still visible after this batch, load the next page
      // immediately. This handles the case where fewer rows than the viewport
      // height were returned, so the IntersectionObserver never re-fires.
      if (hasMoreRef.current && sentinelRef.current) {
        const rect = sentinelRef.current.getBoundingClientRect();
        if (rect.top < window.innerHeight + 400) {
          loadMoreRef.current();
        }
      }
    }
  }, [groupName, from, to, sender, order]);

  // Always-current ref so the IntersectionObserver callback never goes stale
  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;

  // ── Reset + initial load ─────────────────────────────────────────────────
  // Fires when group or any filter value changes.
  // Resets refs synchronously (important: before calling loadMore) then
  // triggers the first page fetch.
  useEffect(() => {
    // Synchronous ref reset — loadMore reads these before the async fetch starts
    pageRef.current = 0;
    loadingRef.current = false;
    hasMoreRef.current = true;

    // Async state reset
    setMessages([]);
    setHasMore(false);
    setTotal(0);
    setLoading(false);
    setError(null);

    if (groupName) {
      // Call via ref so we always use the latest loadMore (correct filter values)
      loadMoreRef.current();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  // ── IntersectionObserver ─────────────────────────────────────────────────
  // Set up once on mount. The callback reads from loadMoreRef so it never
  // needs to be recreated — no observer teardown on state changes.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) loadMoreRef.current();
      },
      // Start fetching 400 px before the sentinel scrolls fully into view
      { rootMargin: "0px 0px 400px 0px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — observer is stable via loadMoreRef

  // Reload resets to page 1 and re-fetches by incrementing reloadTick,
  // which changes filterKey and triggers the existing reset effect.
  const reload = useCallback(() => setReloadTick((t) => t + 1), []);

  return { messages, loading, error, hasMore, total, sentinelRef, loadMore, reload };
}
