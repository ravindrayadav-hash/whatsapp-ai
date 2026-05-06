import { useEffect, useRef } from 'react';

/**
 * Calls `refetch` on a fixed interval while `enabled` is true.
 * Clears the timer when the component unmounts or when enabled turns off.
 *
 * @param {() => void} refetch   stable refetch callback from useFetch
 * @param {number}     interval  polling interval in milliseconds
 * @param {boolean}    enabled   whether auto-refresh is active
 */
export default function useAutoRefresh(refetch, interval, enabled) {
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch; // always latest without re-running effect

  useEffect(() => {
    if (!enabled || interval <= 0) return;

    const id = setInterval(() => refetchRef.current(), interval);
    return () => clearInterval(id);
  }, [enabled, interval]);
}
