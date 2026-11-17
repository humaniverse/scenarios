# Model picker improvements

Implementation specification · 17 November 2026

This supplements [the product specification](../spec.md). Confirmed choices came from requirements discovery; working assumptions remain labelled. Implementation is local to this repository. Automatic AA Briefcase ingestion is deliberately gated, not claimed as delivered.

## Purpose

Make model assignment visible and quick, support different models or Fusion panels at different analysis stages, provide current model discovery, and allow reusable configurations. Browsing, editing, importing and metadata refresh must make no inference requests.

## Confirmed decisions

| Area        | Decision                                                                               |
| ----------- | -------------------------------------------------------------------------------------- |
| Stage setup | Editable overview of every AI-assisted stage, with bulk assignment.                    |
| Fusion      | Presets and custom members, with optional analyst model and shared thinking effort.    |
| Suggested   | A balanced shortlist informed by AA Briefcase performance, developer breadth and cost. |
| Fast        | Output-speed ordering by default; time to first token as an alternative.               |
| Smartest    | AA Intelligence Index rather than Briefcase alone.                                     |

## Working assumptions

Use free permitted data sources; support reusable panels and full stage setups; bundle a curated GitHub library plus JSON import/export; defer arbitrary URL imports. A stage uses independent models or Fusion. Keep the existing single-model starter. Independent-model thinking effort can differ by stage. Settings apply to the current exercise, with no accounts or cloud synchronisation.

## Assignment experience

Show defaults and Explore drivers (1), Assess drivers (2), Develop hypotheses (4), Build scenario combinations (5), and Write & review scenarios (6). Legacy stage 7 resolves to 6. Other stages do not receive model-assignment rows.

Each row displays effective assignments, independent/Fusion mode, effort, inheritance/custom status and availability issues. Display the default writer separately: writing runs one proposal at a time. Single-response subsidiary operations use the resolved writer/first stage override, matching existing semantics.

Opening a row edits it directly. Do not require enabling custom settings first. Keep the overview visible; preserve discovery search/tab when moving between stages. Use only replaces a selection, Add adds an independent contribution, and Remove removes a selected model. Keep at least one model. Mode switching retains inactive settings.

Ordinary changes autosave and offer Undo. Reset removes all overrides for that stage, including scoped effort and Fusion settings. Preserve partial inheritance: changing a stage's effort must not pin its model group or mode.

Bulk editing selects stages, edits one draft and commits once with Apply. Cancel changes nothing. Bulk-applied configurations are copied into independent overrides. A multi-model group applied to writing requires an explicit writing-model choice. Do not truncate silently. Defaults affect inherited fields; show affected stages and keep explicit overrides intact.

| Task, from an open overview with the desired model visible | Target                                           |
| ---------------------------------------------------------- | ------------------------------------------------ |
| Inspect all assignments                                    | No disclosure clicks.                            |
| Replace or add a visible model                             | Open editor, then choose model: two activations. |
| Remove a model in an open editor                           | One activation.                                  |
| Restore defaults                                           | One activation, with Undo.                       |
| Configure several stages                                   | Select targets, configure once, Apply once.      |

Search, scrolling and optional inspection are additional actions. Core controls have been exercised in Chrome through a self-contained application build; see [verification notes](../VERIFICATION.md). Full interaction-target, narrow-screen and zoom acceptance remains outstanding. The environment still cannot bind a normal preview server port.

## Discovery

Provide Suggested, Fast, Smartest, Free and Browse all tabs. Reuse the browser for independent models, custom Fusion members and the analyst, with role-specific eligibility.

Keep selected models visible regardless of filtering or ranking. Metadata changes never mutate exercise settings. Show readable names, exact IDs, prices per million input/output tokens, request charges where known, context limits and effort settings. Label moving aliases as tracking provider updates.

Fast uses OpenRouter throughput order or latency order. Show source and successful retrieval date. Do not invent numeric measurements or a measured top-N ranking when the source only supplies ordering. Unmeasured models sort last according to OpenRouter. This discovery sort does not alter inference-provider routing.

Smartest uses OpenRouter's documented intelligence ordering with `min_intelligence_index=0`, excluding unscored models. Show ten initially, with more available. Deduplicate canonical identities where provided. Do not apply diversity or cost weighting. Numerical scores, benchmark version and ties cannot be inferred from ordering alone; explain their absence. New unscored models remain in Browse all.

Suggested currently uses the versioned maintained list, intersected with the current catalogue, with review date and honest non-benchmark labels. Display: “Benchmark performance is not a direct measure of foresight quality.”

When a permitted Briefcase source becomes available, the proposed policy is a pool of the top 20 distinct mapped entries, up to six strong performers prioritising different developers, plus up to two lower-cost alternatives. Explain reasons for inclusion. Compare cost using a disclosed reference workload, provisionally 20,000 input and 4,000 output tokens plus request charges. These numerical limits remain working defaults. Developer breadth is not proof of independent training data or judgements.

## Briefcase data gate and eventual refresh

No permitted, reliable Briefcase feed or import route has been confirmed. The public page says no public API is available; general AA API availability does not establish Briefcase coverage or reuse rights.

Before implementing automatic ingestion, record the documented/permitted route, coverage and evaluation settings, display/caching/redistribution rights, attribution, owner, limits and a reproducible validated sample. Manual copying is not an exemption. Do not reverse-engineer undocumented endpoints or substitute another benchmark under a Briefcase label.

Until then, retain maintained suggestions with their real review date. No scheduled Briefcase fetch, extraction code, feed credential or unverified score is included.

Once authorised, a proposed weekly repository workflow can publish a complete validated snapshot through deployment. Validate schema, mappings, source version, timestamps and completeness; quarantine ambiguous entries. Publish atomically and retain the previous valid snapshot for rollback. Failed fetches or partial updates keep the last-known-good list and original success date. A fetch failure does not mean a model disappeared. Proposed stale threshold: 14 days.

Maintain explicit mappings between evaluated model/effort identities and exact OpenRouter versions. Do not equate releases or settings by name similarity. Benchmark evidence attached to moving aliases requires verified resolution to the evaluated version.

Catalogue availability/prices and benchmark imports are separate refreshes. Ranking failures retain the previous valid in-session order, intersected with the current account catalogue. No key or inference response is cached in ranking metadata.

## Fusion

Offer provider-default Quality, the explicit Quality (`general-high`), Budget (`general-budget`) and Fast (`general-fast`) presets, plus custom panels. Preserve legacy Quality/High behaviour. Provider-managed membership is labelled as such; do not claim an old member list is current.

Custom panels support 1–8 distinct individual members, optional analyst and shared thinking effort. Exclude routers from inner roles. Explicit effort must be advertised by configured roles; otherwise require a supported choice or Provider default. No per-member effort is implied. Validation must precede dispatch and budget reservation. Invalid configurations must not fall back silently.

Display exact custom member and analyst IDs. Preview the effective configuration before running. Persist supplied configuration with every request, plus returned model identity and evidence of Fusion invocation. Do not invent identities for hidden inner calls. Settings changed during a run must not alter its snapshot. Retries use saved configuration unless the user explicitly replaces it.

Keep existing Fusion cost reservation/reconciliation. Variable costs are not a guaranteed total or external spending cap.

## Portable configurations and library

Two JSON types share `format: scenario-designer-models`, `schemaVersion: 1`, ID, revision, name, description and optional author/source/review metadata:

- Panel: independent group or Fusion configuration, including writer and effort.
- Stage setup: defaults plus explicit stage configurations or `inherit`; omitted stages remain untouched.

Use strict validation and a 256 KiB file limit. Reject unknown versions/fields, credentials, malformed content, invalid stages, recursive roles and duplicate members. Exports allowlist settings; they contain no budgets, exercise identifiers, questions, prompts, notes, narratives or run history. Source links accept HTTP(S) only; descriptions render as text.

Import opens a preview of targets, current/proposed settings, writer, provenance and issues. Show consequential changes to other stages through default inheritance. Users can choose targets and repair settings before applying. Unavailable selections require replacement or deselection of the affected target; never substitute silently. Apply is atomic and undoable. Offline preview/export is allowed; apply requires current catalogue validation.

The GitHub library lives in `model-configurations/`, with a manifest and versioned files bundled into the application. Browsing requires no GitHub account. Examples cover a starter, free router, multiple developers, custom Fusion and a mixed stage setup. They are illustrative, not empirically validated for foresight. Applying copies settings; later library changes never update an exercise automatically. Provenance records the source revision.

## Persistence and compatibility

Use one resolver for effective configuration across the overview, setup readiness, run preview, planning and dispatch, including writing and subsidiary operations. Preserve group order, separate writers, partial overrides, existing effort preferences, legacy stage aliases and historical records.

Project backups retain schema version 1.0 with additive optional/defaulted settings and run-snapshot fields. Older backups receive empty overrides/default legacy Fusion behaviour. New backups round-trip the added data; use the current application when restoring these settings. Portable configuration files have their own strict version 1 schema and are not project backups.

## Acceptance and verification

Require visible assignments, the interaction targets, isolated/undoable bulk changes, predictable inheritance, selection preservation during refresh, honest missing-data handling, no automated Briefcase ingestion before permission, consistent Fusion requests, atomic import failures, portable round-trips and backwards-compatible backups. Browsing/editing/importing must make no inference calls.

Use domain tests for inheritance and imports, request-contract tests for Fusion and retry snapshots, catalogue ordering tests, and component rendering checks. Complete type checking, the full test suite and production build. Core stage-editing, Undo, live public catalogue/ranking discovery, bulk-validation and library-browsing checks have been performed in Chrome using a self-contained application build. Native dropdown/file-chooser, full import/apply/export, narrow-width, zoom, authenticated inference, deployment CSP and service-worker checks remain outstanding; see [verification notes](../VERIFICATION.md).

## Sources checked on 17 November 2026

- [AA Briefcase](https://artificialanalysis.ai/evaluations/aa-briefcase)
- [AA data API access and attribution](https://artificialanalysis.ai/data-api/docs)
- [OpenRouter model catalogue](https://openrouter.ai/docs/guides/overview/models)
- [OpenRouter models API](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties)
- [OpenRouter Fusion configuration](https://openrouter.ai/docs/guides/routing/routers/fusion-router)
- [OpenRouter Fusion preset catalogue](https://openrouter.ai/openrouter/fusion?view=api)
