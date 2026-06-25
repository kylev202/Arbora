import { useEffect, useState } from "react";

export type AsyncState<T> =
  | { status: "loading"; data: undefined; error: undefined }
  | { status: "loaded"; data: T; error: undefined }
  | { status: "error"; data: undefined; error: Error };

/**
 * Run an async fetcher and track loading/loaded/error. Re-runs when `deps`
 * change. Screens render: loading → skeleton, error → retry, loaded → content
 * (and "empty" is loaded-with-empty-data, handled by the screen). This gives
 * every screen its four states (UI plan §4) with mock data today.
 */
export function useAsync<T>(fetcher: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({
    status: "loading",
    data: undefined,
    error: undefined,
  });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading", data: undefined, error: undefined });
    fetcher()
      .then((data) => {
        if (!cancelled) setState({ status: "loaded", data, error: undefined });
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setState({
            status: "error",
            data: undefined,
            error: e instanceof Error ? e : new Error(String(e)),
          });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
