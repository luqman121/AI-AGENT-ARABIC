/**
 * Connectivity state machine. "reconnecting" is shown only while a real
 * refresh is pending after the browser reports connectivity again —
 * never on a timer.
 */
export type ConnectivityState = "online" | "offline" | "reconnecting";

export type ConnectivityEvent = "went-offline" | "went-online" | "refresh-complete";

export function connectivityReducer(
  state: ConnectivityState,
  event: ConnectivityEvent,
): ConnectivityState {
  switch (event) {
    case "went-offline":
      return "offline";
    case "went-online":
      return state === "offline" ? "reconnecting" : state;
    case "refresh-complete":
      return state === "reconnecting" ? "online" : state;
  }
}
