# Open Source References

This file records the external repositories inspected for the Arabic agent workspace UI work.
Reference repositories were cloned with shallow clones into `/tmp/wakil-open-source-refs` and were
not copied into this repository.

## Summary

No source code was copied, transplanted, adapted, or imported from any reference repository. The
work uses Wakil's existing Next.js/Tailwind/Radix UI stack and design tokens. References were used
only to study visual/product behavior patterns.

## References

| Repository                                    | License                                                                                                               | Patterns studied                                                                                                                                   | Code reused | Wakil files affected                                                                                                        | Required attribution                      | Licensing concern                                                                                                        |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `https://github.com/freestyle-sh/Adorable`    | MIT (`LICENSE`, commit `35d6b1b`)                                                                                     | Conversational app-building layout, split workspace, embedded preview, persistent project navigation, loading and empty states.                    | None.       | `apps/web/app/(app)/projects/[projectId]/conversation-view.tsx`, `apps/web/app/(app)/projects/[projectId]/preview/page.tsx` | None required because no code was reused. | Low; MIT is permissive, but no source reuse occurred.                                                                    |
| `https://github.com/stackblitz-labs/bolt.diy` | MIT (`LICENSE`, commit `2e254ac`)                                                                                     | Prompt composer behavior, file attachment UX, files/tools panel concepts, preview controls, responsive workspace behavior, voice prompt flow.      | None.       | `apps/web/app/(app)/new/create-project-form.tsx`, `apps/web/app/(app)/projects/[projectId]/preview/page.tsx`                | None required because no code was reused. | Low; MIT is permissive, but no source reuse occurred.                                                                    |
| `https://github.com/onlook-dev/onlook`        | Apache-2.0 (`LICENSE.md`, commit `423e2e9`)                                                                           | Preview toolbar, viewport switching, side-by-side preview/editing mental model, checkpoints/visual-editing concepts.                               | None.       | `apps/web/app/(app)/projects/[projectId]/preview/page.tsx`                                                                  | None required because no code was reused. | Low; Apache-2.0 notices would be required if code were reused. No source reuse occurred.                                 |
| `https://github.com/sa4hnd/vibra-code`        | AGPL-3.0 at repository root (`LICENSE`, commit `0a8524a6`); nested mobile starter includes MIT Expo template license. | Mobile chat layout, full-screen mobile preview, voice/image input UX, mobile progress feedback, sticky composer, bottom-sheet/navigation behavior. | None.       | No source-derived changes. Existing Wakil composer and mobile shell were reviewed against these behavior patterns only.     | None required because no code was reused. | High if code is reused: AGPL-3.0 is copyleft for network software. Do not copy/adapt/import source without legal review. |

## Source-use decision

- Reference clones are temporary and outside the application source tree.
- No files from the references were committed.
- No AGPL source was copied from Vibra Code.
- UX patterns were independently implemented using Wakil's existing design system and backend
  contracts.
- Future source copying must repeat license inspection and update this document before code is
  committed.
