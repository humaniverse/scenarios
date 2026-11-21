# Reusable model configurations

These files are bundled with Scenario Designer. Users can preview, repair and apply them without a GitHub account. They are illustrative starting points, not benchmark-validated recommendations.

To contribute:

1. Copy a `.configuration.json` file or export a panel/stage setup from the app.
2. Give it a stable ID, meaningful name, description and review date. Increment `revision` whenever its settings change.
3. Use exact OpenRouter IDs or clearly described moving aliases. Check availability through the app before recommending a setup. Include explicit cost assumptions when relevant; do not call an example best for foresight.
4. Add the filename to `manifest.json`. The manifest determines display order; IDs must be unique.
5. Run `npm test -- src/lib/domain/model-configurations.test.ts`, `npm run check` and `npm run build`.
6. Submit the JSON and manifest changes through normal repository review.

Format version 1 has `format: "scenario-designer-models"` and `kind: "panel"` or `"stage-setup"`. See the examples and `src/lib/domain/model-configurations.ts` for the strict schema. Stage setup entries use stage IDs 1, 2, 4, 5 and 6; `"inherit"` restores exercise defaults, and omitted entries keep current settings. Writing uses one model per proposal.

Include model settings only. No keys, budgets, prompts, analytical content, executable code or custom network endpoints. Import is limited to 256 KiB. HTTP(S) source links are optional.

An applied configuration is a copy, with its original ID/revision recorded as provenance. Publishing another revision never overwrites users' saved choices. Provider aliases and preset membership can still evolve independently.

Supported Fusion presets were checked against the official catalogue on 17 November 2026: provider-default Quality, explicit `general-high`, `general-budget`, and `general-fast`. Custom panels support 1–8 distinct individual models. A provider-default shared effort is useful when members advertise different effort options.
