# Mobile release checklist

Record device model, OS/browser version, build commit SHA, network profile, tester, date, and
evidence for every run. These boxes are intentionally unchecked until testing occurs on the deployed
release candidate; Playwright viewport checks do not count as real-device verification.

## Devices and baseline

- [ ] Android Chrome on a currently supported physical phone, portrait and landscape.
- [ ] iPhone Safari on a currently supported physical iPhone, portrait and landscape.
- [ ] `390x844` and `430x932` layouts have no horizontal overflow or clipped Arabic text.
- [ ] Arabic is RTL by default; arrows, drawers, tabs, transitions, spacing, and mixed LTR content
      behave correctly.
- [ ] Browser console and network inspection show no errors, hydration warnings, or secret-bearing
      responses.

## Authentication and navigation

- [ ] Email magic-link sign-in opens in the correct browser/session and returns to the production
      HTTPS origin.
- [ ] Google sign-in succeeds if configured; cancellation and provider errors return a safe Arabic
      state.
- [ ] Session cookies are Secure/HttpOnly as applicable and sign-out invalidates navigation.
- [ ] Bottom navigation, back/forward, deep links, refresh, offline/reconnect, and PWA installation
      remain usable.

## Interaction and accessibility

- [ ] Opening the keyboard does not cover the composer, focused control, validation error, or bottom
      navigation; content remains scrollable when the keyboard changes viewport height.
- [ ] Long pages, nested scrolling, modals, confirmation dialogs, menus, and focus restoration work
      with touch and an external keyboard.
- [ ] Touch targets are at least 44px, focus is visible, screen-reader labels are meaningful, color
      contrast is adequate, and 200% text zoom does not clip primary actions.
- [ ] Reduced-motion preference removes nonessential animation.

## Product and file flows

- [ ] Create/open/rename/archive/search project flows show truthful loading, empty, success, and
      recoverable error states.
- [ ] File selection/upload rejects invalid MIME/size safely, preserves the selected filename in UI,
      handles cancellation, and never creates duplicate submissions.
- [ ] Run planning/execution progress survives backgrounding, reconnects through persisted SSE, and
      never displays fabricated progress.
- [ ] Preview remains sandboxed and readable; modal/preview close and browser back are predictable.
- [ ] Authorized signed download links open/download on both browsers, use the expected filename,
      and fail safely after expiry without making the bucket public.

## Adverse conditions

- [ ] Repeat key flows on throttled 3G/high-latency networking and during a short offline period.
- [ ] Verify expired session, rate limit, database/Redis readiness failure, worker failure, model
      error, sandbox error, R2 error, and quota/limit states are understandable and retry-safe.
- [ ] Rapid taps, app background/foreground, screen lock/unlock, and browser process restart do not
      duplicate a run or lose durable history.
