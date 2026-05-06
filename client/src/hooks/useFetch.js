import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Generic data-fetching hook.
 * Re-fetches whenever fetchFn reference changes (wrap with useCallback + deps).
 * @param {() => Promise<any>} fetchFn  async function that returns data
 */
export default function useFetch(fetchFn) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  // Keep a stable ref to the latest fetchFn so the run callback stays stable
  // while still always calling the most recent version.
  const fetchRef = useRef(fetchFn);
  fetchRef.current = fetchFn;

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchRef.current();
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []); // stable — never recreated

  // Re-run whenever fetchFn reference changes (i.e. when filter deps change)
  useEffect(() => { run(); }, [fetchFn]); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, loading, error, refetch: run };
}
