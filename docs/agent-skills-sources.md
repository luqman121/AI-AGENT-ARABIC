# Agent Skills — Sources, Licensing, and Security Decisions

This platform separates two skill layers:

- **Layer A — Developer skills:** guidance for the coding agent working _on this repository_.
  Optional, project-level, never shipped to customers.
- **Layer B — Runtime skills:** the internal, provider-neutral catalog the customer-facing agent
  selects, loads, and executes at run time. These live in `packages/skills/src/runtime/` (source of
  truth) and are mirrored to `skills/<id>/SKILL.md` + `manifest.json` for inspection and admin
  visibility.

All Layer B skills are **original content authored for Wakil** (trust level `internal`, license
`proprietary`). No third-party skill text is vendored into the runtime.

## Layer B — Runtime skills (this repository)

| Skill                     | Category     | Trust    | License     | Status   |
| ------------------------- | ------------ | -------- | ----------- | -------- |
| `website-design`          | website      | internal | proprietary | authored |
| `arabic-rtl-ui`           | design       | internal | proprietary | authored |
| `design-system-generator` | design       | internal | proprietary | authored |
| `premium-depth-shadow`    | design       | internal | proprietary | authored |
| `design-critic`           | quality      | internal | proprietary | authored |
| `website-quality-gate`    | quality      | internal | proprietary | authored |
| `document-reader`         | reading      | internal | proprietary | authored |
| `pdf-studio`              | pdf          | internal | proprietary | authored |
| `spreadsheet-studio`      | spreadsheet  | internal | proprietary | authored |
| `document-studio`         | document     | internal | proprietary | authored |
| `presentation-studio`     | presentation | internal | proprietary | authored |
| `artifact-quality-gate`   | quality      | internal | proprietary | authored |

The authoritative metadata and instruction checksums are in `skills/manifest.lock.json`, generated
by `scripts/generate-skill-catalog.ts`. A vitest test fails if the committed catalog drifts from the
registry.

## Layer A — External references (reviewed, not vendored)

These informed the _principles_ in the runtime skills. **None were copied verbatim, and none are
auto-installed by this change.** Auto-installing third-party skills in an unattended session would
run their install scripts with network and filesystem access — exactly the risk the security section
of the task warns against. Installing any of them is a deliberate, reviewed, version-pinned action
for a human operator.

| Reference                     | Repository / URL                                                                      | License (as observed) | Decision   | Notes                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------- | --------------------- | ---------- | ---------------------------------------------------------------------- |
| UI/UX Pro Max                 | github.com/nextlevelbuilder/ui-ux-pro-max-skill                                       | Review before use     | referenced | Informed hierarchy/typography/spacing principles only.                 |
| Anthropic Frontend Design     | github.com/anthropics/claude-code (plugins/frontend-design)                           | Review before use     | referenced | "Avoid generic template output" principles.                            |
| Vercel Agent Skills           | github.com/vercel-labs/agent-skills (`web-design-guidelines`, `react-best-practices`) | Review before use     | referenced | Web-audit and React composition principles.                            |
| Open Agent Skills CLI         | github.com/vercel-labs/skills (`npx skills`)                                          | Review before use     | not used   | Not run in this automated session; install is a manual, reviewed step. |
| shadcn/ui skills + RTL        | ui.shadcn.com/docs/skills, ui.shadcn.com/docs/rtl                                     | MIT (components)      | referenced | Prefer the existing component library; RTL guidance folded in.         |
| UAE Design System (aegov-dls) | github.com/TDRA-ae/aegov-dls                                                          | Review before use     | referenced | Arabic digital-service + a11y patterns; not a government look.         |
| Cairo font                    | github.com/Gue3bara/Cairo                                                             | SIL OFL 1.1           | referenced | Default Arabic interface face; load per current font architecture.     |
| Anthropic `skills` (docs)     | github.com/anthropics/skills (PDF/DOCX/XLSX/PPTX examples)                            | Review each LICENSE   | referenced | Architectural reference only; original implementation required.        |

### Rules applied

- **No verbatim copying.** Every runtime skill is original text.
- **No blind installation.** Marketplace popularity is not a security signal. Before any Layer A
  skill is installed, a human must review its `SKILL.md`, executable scripts, dependencies, network
  access, and license, then pin the exact version/commit and record it here.
- **License gating.** Proprietary or source-available document skills (e.g. some under
  `anthropics/skills`) must **not** be vendored into this commercial runtime. Provider-managed
  document skills may only be used through an authorized provider API and under its terms.
- **Trust levels.** Only `internal`, `reviewed-open-source`, and `provider-managed` skills may load
  into the runtime prompt or execute tools (`packages/skills/src/runtime/security.ts`).
  `untrusted`/`disabled` are never routed.

## Update policy

1. Edit the instruction body / metadata in `packages/skills/src/runtime/`.
2. Bump the skill `version` (semver) and, for prompt-wide changes, the `CORE_SYSTEM_PROMPT_VERSION`.
3. Run `pnpm exec tsx scripts/generate-skill-catalog.ts` to regenerate the on-disk catalog and lock
   file.
4. Run the gate (`pnpm lint && pnpm typecheck && pnpm test && pnpm build`); the catalog-sync test
   guards against drift.
5. For a new **external** reference, add a row above with repository, version or commit, observed
   license, decision, security-review status, and runtime permissions before use.
