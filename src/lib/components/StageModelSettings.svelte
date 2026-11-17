<script lang="ts">
  import { tick } from 'svelte';
  import { Undo2 } from '@lucide/svelte';
  import { stages, type Project, type Change } from '$lib/domain/project';
  import {
    aiModelStages,
    hasStageModels,
    resetStageModels,
    resolveModelConfiguration,
    assignConfiguration,
    displayModelName,
    copyFusion,
    type ModelConfiguration,
    type ModelMode,
    type EffortPreference,
    type FusionConfiguration,
    type ModelPreferences
  } from '$lib/domain/model-settings';
  import { configurationIssues, configurationSummary } from '$lib/ai/model-configuration';
  import type { Model, RankingLoader } from '$lib/ai/models';
  import ModelPicker from './ModelPicker.svelte';
  import ModelConfigurations from './ModelConfigurations.svelte';
  let {
    p,
    change,
    catalogue,
    loading,
    loaded,
    status,
    refresh,
    loadRanking,
    initialScope = 'default'
  }: {
    p: Project;
    change: Change;
    catalogue: Model[];
    loading: boolean;
    loaded: boolean;
    status: string;
    refresh: () => void;
    loadRanking?: RankingLoader;
    initialScope?: string;
  } = $props();
  let editing = $state('default');
  let targets = $state<string[]>([]);
  let bulk = $state<ModelConfiguration | null>(null);
  let bulkWriter = $state('');
  let previous = $state<ModelPreferences | null>(null);
  let heading = $state<HTMLHeadingElement>();
  const scopes = ['default', ...aiModelStages.map(String)];
  const title = (scope: string) =>
    scope === 'default'
      ? 'Whole-analysis defaults'
      : scope === 'bulk'
        ? 'Selected stages'
        : stages[Number(scope)];
  const name = (id: string) => displayModelName(id, catalogue.find((m) => m.id === id)?.name);
  const active = $derived(
    editing === 'bulk' && bulk ? bulk : resolveModelConfiguration(p, editing)
  );
  const needsWriter = $derived(
    editing === 'bulk' &&
      targets.includes('6') &&
      active.mode === 'individual' &&
      active.models.length > 1
  );
  const defaultAffected = $derived(
    aiModelStages
      .filter((stage) => {
        const key = String(stage);
        return (
          !Object.hasOwn(p.modelModeOverrides, key) ||
          (resolveModelConfiguration(p, key).mode === 'fusion'
            ? !Object.hasOwn(p.fusionOverrides, key)
            : !Object.hasOwn(p.overrides, key))
        );
      })
      .map((stage) => stages[stage])
  );
  const bulkIssues = $derived.by(() => {
    if (!bulk || editing !== 'bulk') return [];
    if (needsWriter && !bulkWriter) return ['Choose one writing model before applying this panel.'];
    const candidate = JSON.parse(JSON.stringify(p)) as Project;
    const config = {
      ...bulk,
      writer: needsWriter ? bulkWriter : bulk.models.length === 1 ? bulk.models[0] : bulk.writer
    };
    const errors: string[] = [];
    for (const scope of targets) {
      assignConfiguration(candidate, scope, config);
      errors.push(
        ...configurationIssues(
          resolveModelConfiguration(candidate, scope),
          catalogue,
          scope !== '6'
        )
      );
    }
    return [...new Set(errors)];
  });
  $effect(() => {
    editing = initialScope;
  });
  function snapshot(): ModelPreferences {
    return JSON.parse(
      JSON.stringify({
        models: p.models,
        writer: p.writer,
        overrides: p.overrides,
        modelMode: p.modelMode,
        modelModeOverrides: p.modelModeOverrides,
        reasoningEfforts: p.reasoningEfforts,
        stageReasoningEfforts: p.stageReasoningEfforts,
        stageEffortInheritance: p.stageEffortInheritance,
        fusion: p.fusion,
        fusionOverrides: p.fusionOverrides,
        configurationProvenance: p.configurationProvenance
      })
    );
  }
  const commit: Change = (fn, message) => {
    previous = snapshot();
    change(fn, message ?? 'Model settings updated.');
  };
  function undo() {
    if (!previous) return;
    const saved = JSON.parse(JSON.stringify(previous)) as ModelPreferences;
    change((p) => {
      p.models = saved.models;
      p.writer = saved.writer;
      p.overrides = saved.overrides;
      p.modelMode = saved.modelMode;
      p.modelModeOverrides = saved.modelModeOverrides;
      p.reasoningEfforts = saved.reasoningEfforts ?? {};
      p.stageReasoningEfforts = saved.stageReasoningEfforts ?? {};
      p.stageEffortInheritance = saved.stageEffortInheritance ?? {};
      p.fusion = saved.fusion;
      p.fusionOverrides = saved.fusionOverrides ?? {};
      p.configurationProvenance = saved.configurationProvenance ?? {};
    }, 'Undid the last model-settings change.');
    previous = null;
  }
  async function edit(scope: string) {
    editing = scope;
    await tick();
    heading?.focus({ preventScroll: true });
  }
  function models(ids: string[]) {
    if (!ids.length) return;
    if (editing === 'bulk' && bulk) {
      bulk = { ...bulk, models: ids };
      bulkWriter = '';
      return;
    }
    const scope = editing;
    commit((p) => {
      if (scope === 'default') p.models = [...ids];
      else p.overrides[scope] = [...ids];
    });
  }
  function mode(value: ModelMode) {
    if (editing === 'bulk' && bulk) {
      bulk = { ...bulk, mode: value };
      return;
    }
    const scope = editing;
    commit((p) => {
      if (scope === 'default') p.modelMode = value;
      else p.modelModeOverrides[scope] = value;
    });
  }
  function effort(id: string, value: EffortPreference) {
    if (editing === 'bulk' && bulk) {
      bulk = { ...bulk, efforts: { ...bulk.efforts, [id]: value } };
      return;
    }
    const scope = editing;
    commit((p) => {
      if (scope === 'default') p.reasoningEfforts[id] = value;
      else (p.stageReasoningEfforts[scope] ??= {})[id] = value;
    });
  }
  function fusion(value: FusionConfiguration) {
    if (editing === 'bulk' && bulk) {
      bulk = { ...bulk, fusion: copyFusion(value) };
      return;
    }
    const scope = editing;
    commit((p) => {
      if (scope === 'default') p.fusion = copyFusion(value);
      else p.fusionOverrides[scope] = copyFusion(value);
    });
  }
  function beginBulk() {
    bulk = resolveModelConfiguration(p, editing === 'bulk' ? 'default' : editing);
    bulkWriter = '';
    editing = 'bulk';
  }
  function applyBulk() {
    if (!bulk || !targets.length || bulkIssues.length || !loaded) return;
    const config = JSON.parse(
      JSON.stringify({
        ...bulk,
        writer: needsWriter ? bulkWriter : bulk.models.length === 1 ? bulk.models[0] : bulk.writer
      })
    ) as ModelConfiguration;
    const selected = [...targets];
    commit(
      (p) => {
        for (const scope of selected) assignConfiguration(p, scope, config);
      },
      `Updated models for ${selected.map(title).join(', ')}.`
    );
    editing = selected[0];
    bulk = null;
    targets = [];
  }
</script>

<section class="stage-model-overview" aria-label="Models by analysis stage">
  <div class="section-line">
    <div>
      <h3>Models for your analysis</h3>
      <p class="small muted">
        Edit a row directly, or select several stages and configure them together. Changes save
        automatically; they never run models.
      </p>
    </div>
    {#if previous}<button type="button" class="secondary small" onclick={undo}
        ><Undo2 size={15} /> Undo settings change</button
      >{/if}
  </div>
  <div class="stage-model-table">
    {#each scopes as scope}
      {@const config = resolveModelConfiguration(p, scope)}
      {@const errors = loaded ? configurationIssues(config, catalogue, scope === 'default') : []}
      <div class="stage-model-row" class:editing={editing === scope}>
        {#if scope !== 'default'}<input
            type="checkbox"
            aria-label={`Select ${title(scope)} for bulk assignment`}
            checked={targets.includes(scope)}
            onchange={(e) =>
              (targets = e.currentTarget.checked
                ? [...targets, scope]
                : targets.filter((s) => s !== scope))}
          />{:else}<span aria-hidden="true"></span>{/if}
        <div>
          <strong>{title(scope)}</strong><span
            class="stage-model-source"
            class:customized={scope !== 'default' && hasStageModels(p, scope)}
            >{scope === 'default'
              ? 'Shared settings'
              : hasStageModels(p, scope)
                ? 'Custom settings · other fields may inherit'
                : 'Follows defaults'}</span
          >
          <p>{configurationSummary(config, name)}</p>
          {#if scope === 'default' && config.mode === 'individual'}<p class="small muted">
              Default writing model: {name(p.writer)}
            </p>{/if}
          {#if errors.length}<p class="small picker-unavailable">
              {errors[0]}{errors.length > 1 ? ` (+${errors.length - 1} more)` : ''}
            </p>{/if}
          {#if p.configurationProvenance[scope]}<p class="small muted">
              Based on {p.configurationProvenance[scope].name}, revision {p.configurationProvenance[
                scope
              ].revision}
            </p>{/if}
        </div>
        <div class="stage-model-row-actions">
          <button
            type="button"
            class="secondary small"
            aria-label={`Edit models for ${title(scope)}`}
            aria-expanded={editing === scope}
            onclick={() => edit(scope)}>Edit</button
          >
          {#if scope !== 'default' && hasStageModels(p, scope)}<button
              type="button"
              class="text-button small"
              onclick={() =>
                commit((p) => resetStageModels(p, scope), `${title(scope)} now follows defaults.`)}
              >Use defaults</button
            >{/if}
        </div>
      </div>
    {/each}
  </div>
  <div class="configuration-toolbar">
    <label class="inline-checkbox"
      ><input
        type="checkbox"
        checked={targets.length === aiModelStages.length}
        onchange={(e) => (targets = e.currentTarget.checked ? aiModelStages.map(String) : [])}
      /> Select all stages</label
    >
    <button class="secondary small" type="button" disabled={!targets.length} onclick={beginBulk}
      >Configure {targets.length || 'selected'} stages together</button
    >
    <button
      class="text-button small"
      type="button"
      disabled={!targets.length}
      onclick={() => {
        const selected = [...targets];
        commit(
          (p) => selected.forEach((s) => resetStageModels(p, s)),
          'Selected stages now follow defaults.'
        );
      }}>Use defaults for selected stages</button
    >
  </div>
</section>
<section class="stage-model-editor" aria-label={`Edit ${title(editing)}`}>
  <h3 tabindex="-1" bind:this={heading}>{title(editing)}</h3>
  {#if editing === 'default'}<p class="small muted">
      Updates can affect inherited fields in: {defaultAffected.join(', ') || 'no stages'}. Custom
      fields stay as saved.
    </p>
    <label
      >Default writing model<select
        value={p.writer}
        onchange={(e) => {
          const id = e.currentTarget.value;
          commit((p) => (p.writer = id));
        }}
        ><option value={p.writer}>{name(p.writer)}</option
        >{#each catalogue.filter((m) => !m.id.startsWith('openrouter/fusion') && m.id !== p.writer) as model}<option
            value={model.id}>{name(model.id)}</option
          >{/each}</select
      ></label
    >
  {:else if editing === 'bulk'}<p class="small">
      Targets: {targets.map(title).join(', ') || 'Select at least one stage above.'} Changes in this editor
      are applied together when you choose Apply.
    </p>
  {:else}<p class="small muted">
      Editing creates only the necessary stage override. Use defaults above to restore all inherited
      settings.
    </p>{/if}
  <ModelPicker
    {catalogue}
    selected={active.models}
    mode={active.mode}
    efforts={active.efforts}
    fusion={active.fusion}
    multiple={editing !== '6'}
    {loading}
    {loaded}
    {status}
    {refresh}
    {loadRanking}
    onmodels={models}
    onmode={mode}
    oneffort={effort}
    onfusion={fusion}
  />
  {#if needsWriter}<label
      >Writing model for the selected stages<select bind:value={bulkWriter}
        ><option value="">Choose one writing model…</option>{#each active.models as id}<option
            value={id}>{name(id)}</option
          >{/each}</select
      ></label
    >{/if}
  {#if editing === 'bulk'}
    {#if bulkIssues.length}<div class="notice review" role="status">
        <ul>
          {#each bulkIssues as issue}<li>{issue}</li>{/each}
        </ul>
      </div>{/if}
    <div class="dialog-actions">
      <button
        class="secondary"
        type="button"
        onclick={() => {
          editing = 'default';
          bulk = null;
        }}>Cancel bulk edit</button
      ><button
        class="primary"
        type="button"
        disabled={!loaded || loading || !targets.length || bulkIssues.length > 0}
        onclick={applyBulk}>Apply to selected stages</button
      >
    </div>
  {/if}
</section>
<ModelConfigurations
  {p}
  {catalogue}
  {loading}
  {loaded}
  {status}
  {refresh}
  {loadRanking}
  {commit}
  scope={editing}
  {targets}
/>
