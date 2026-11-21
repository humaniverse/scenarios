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
    fusionPlugin,
    type ModelConfiguration,
    type ModelMode,
    type EffortPreference,
    type FusionConfiguration,
    type ModelPreferences
  } from '$lib/domain/model-settings';
  import { configurationIssues, configurationSummary } from '$lib/ai/model-configuration';
  import type { Model, RankingLoader } from '$lib/ai/models';
  import ModelPicker from './ModelPicker.svelte';
  import type { ModelBrowserView } from './ModelBrowser.svelte';
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

  const uid = $props.id();
  const stageScopes = aiModelStages.map(String);
  const scopes = ['default', ...stageScopes];
  let editing = $state('default');
  let selecting = $state(false);
  let targets = $state<string[]>([]);
  let bulk = $state<ModelConfiguration | null>(null);
  let bulkWriter = $state('');
  let previous = $state<ModelPreferences | null>(null);
  let feedback = $state('');
  let heading = $state<HTMLHeadingElement>();
  let bulkHeading = $state<HTMLHeadingElement>();
  let multipleButton = $state<HTMLButtonElement>();
  let browseView = $state<ModelBrowserView>('suggested');
  let browseSearch = $state('');

  const title = (scope: string) =>
    scope === 'default' ? 'Default models for all stages' : stages[Number(scope)];
  const modelLookup = $derived(new Map(catalogue.map((model) => [model.id, model.name])));
  const name = (id: string) => displayModelName(id, modelLookup.get(id));
  const active = $derived(bulk ?? resolveModelConfiguration(p, editing || 'default'));
  const needsWriter = $derived(
    !!bulk && targets.includes('6') && active.mode === 'individual' && active.models.length > 1
  );
  const proposed = $derived(
    bulk && {
      ...bulk,
      writer: needsWriter ? bulkWriter : bulk.models.length === 1 ? bulk.models[0] : bulk.writer
    }
  );
  const preview = $derived.by(() => {
    if (!proposed) return { rows: [], issues: [] };
    const candidate = snapshot();
    const issues: string[] = [];
    const rows = targets.map((scope) => {
      if (scope === '6' && needsWriter && !bulkWriter) {
        issues.push('Choose one writing model before applying.');
        return { scope, summary: 'Choose a writing model' };
      }
      assignConfiguration(candidate, scope, proposed);
      const config = resolveModelConfiguration(candidate, scope);
      if (loaded) issues.push(...configurationIssues(config, catalogue, scope !== '6'));
      return { scope, summary: configurationSummary(config, name) };
    });
    return { rows, issues: [...new Set(issues)] };
  });

  $effect.pre(() => {
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

  function effectiveSelection(project: ModelPreferences, scope: string) {
    const config = resolveModelConfiguration(project, scope);
    return JSON.stringify(
      config.mode === 'fusion'
        ? fusionPlugin(config.fusion)
        : {
            models: config.models,
            writer: config.writer,
            efforts: [...config.models, config.writer].map((id) => config.efforts[id])
          }
    );
  }

  const commit: Change = (fn, message = 'Model settings updated.') => {
    previous = snapshot();
    const before = stageScopes.map((scope) => effectiveSelection(p, scope));
    const defaultsBefore = effectiveSelection(p, 'default');
    const writerBefore = p.writer;
    change((project) => {
      fn(project);
      const affected = stageScopes.filter(
        (scope, i) => effectiveSelection(project, scope) !== before[i]
      );
      feedback =
        writerBefore === project.writer && defaultsBefore === effectiveSelection(project, 'default')
          ? message
          : affected.length
            ? `${message} Updated settings for ${affected.map(title).join(', ')}.`
            : `${message} All stages keep their current selections.`;
    }, message);
  };

  async function undo() {
    if (!previous) return;
    const saved = JSON.parse(JSON.stringify(previous)) as ModelPreferences;
    change((project) => {
      project.models = saved.models;
      project.writer = saved.writer;
      project.overrides = saved.overrides;
      project.modelMode = saved.modelMode;
      project.modelModeOverrides = saved.modelModeOverrides;
      project.reasoningEfforts = saved.reasoningEfforts ?? {};
      project.stageReasoningEfforts = saved.stageReasoningEfforts ?? {};
      project.stageEffortInheritance = saved.stageEffortInheritance ?? {};
      project.fusion = saved.fusion;
      project.fusionOverrides = saved.fusionOverrides ?? {};
      project.configurationProvenance = saved.configurationProvenance ?? {};
    }, 'Undid the last model-settings change.');
    previous = null;
    feedback = 'Undid the last model-settings change.';
    await tick();
    if (selecting) bulkHeading?.focus();
    else if (editing) heading?.focus();
    else multipleButton?.focus();
  }

  async function edit(scope: string) {
    editing = scope;
    await tick();
    heading?.focus();
  }

  function selectRow(event: MouseEvent, scope: string) {
    if ((event.target as Element).closest('button, input, label')) return;
    if (!selecting) {
      void edit(scope);
    } else if (!bulk && scope !== 'default') {
      targets = targets.includes(scope)
        ? targets.filter((target) => target !== scope)
        : [...targets, scope];
    }
  }

  async function closeEditor() {
    const scope = editing;
    editing = '';
    await tick();
    document.getElementById(`${uid}-stage-${scope}`)?.focus();
  }

  function models(ids: string[]) {
    if (!ids.length) return;
    if (bulk) {
      if (!ids.includes(bulkWriter)) bulkWriter = '';
      bulk = { ...bulk, models: ids };
      return;
    }
    const scope = editing;
    commit(
      (project) => {
        if (scope === 'default') project.models = [...ids];
        else project.overrides[scope] = [...ids];
      },
      scope === 'default'
        ? 'Exercise default models updated.'
        : `Models updated for ${title(scope)}.`
    );
  }

  function mode(value: ModelMode) {
    if (bulk) {
      bulk = { ...bulk, mode: value };
      return;
    }
    const scope = editing;
    commit(
      (project) => {
        if (scope === 'default') project.modelMode = value;
        else project.modelModeOverrides[scope] = value;
      },
      scope === 'default'
        ? 'Default contribution mode updated.'
        : `Contribution mode updated for ${title(scope)}.`
    );
  }

  function effort(id: string, value: EffortPreference) {
    if (bulk) {
      bulk = { ...bulk, efforts: { ...bulk.efforts, [id]: value } };
      return;
    }
    const scope = editing;
    commit(
      (project) => {
        if (scope === 'default') project.reasoningEfforts[id] = value;
        else (project.stageReasoningEfforts[scope] ??= {})[id] = value;
      },
      `Thinking effort updated for ${name(id)}.`
    );
  }

  function fusion(value: FusionConfiguration) {
    if (bulk) {
      bulk = { ...bulk, fusion: copyFusion(value) };
      return;
    }
    const scope = editing;
    commit(
      (project) => {
        if (scope === 'default') project.fusion = copyFusion(value);
        else project.fusionOverrides[scope] = copyFusion(value);
      },
      scope === 'default'
        ? 'Default Fusion settings updated.'
        : `Fusion settings updated for ${title(scope)}.`
    );
  }

  async function selectStages() {
    selecting = true;
    await tick();
    bulkHeading?.focus();
  }

  async function beginBulk() {
    if (!targets.length) return;
    bulk = resolveModelConfiguration(p, editing || 'default');
    bulkWriter = '';
    await tick();
    heading?.focus();
  }

  async function endBulk(nextScope = editing) {
    selecting = false;
    bulk = null;
    targets = [];
    editing = nextScope;
    await tick();
    if (editing) heading?.focus();
    else multipleButton?.focus();
  }

  function applyBulk() {
    if (!proposed || !targets.length || preview.issues.length || !loaded || loading) return;
    const config = JSON.parse(JSON.stringify(proposed)) as ModelConfiguration;
    const selected = [...targets];
    commit(
      (project) => {
        for (const scope of selected) assignConfiguration(project, scope, config);
      },
      `Updated models for ${selected.map(title).join(', ')}.`
    );
    void endBulk(selected[0]);
  }

  function resetSelected() {
    const selected = [...targets];
    commit(
      (project) => selected.forEach((scope) => resetStageModels(project, scope)),
      'Selected stages now follow defaults.'
    );
    void endBulk(selected[0]);
  }

  function reset(scope: string) {
    commit((project) => resetStageModels(project, scope), `${title(scope)} now follows defaults.`);
    void edit(scope);
  }

  function changeWriter(id: string) {
    commit((project) => (project.writer = id), 'Default writing model updated.');
  }
</script>

{#snippet editor()}
  <section id={`${uid}-editor`} class="stage-model-editor" aria-labelledby={`${uid}-editor-title`}>
    <div class="section-line">
      <h3 tabindex="-1" id={`${uid}-editor-title`} bind:this={heading}>
        {bulk ? 'Edit selected stages' : title(editing)}
      </h3>
      {#if !bulk}
        <button
          type="button"
          class="text-button small close-stage-model-editor"
          onclick={closeEditor}>Close editor</button
        >
      {/if}
    </div>
    {#if bulk}
      <p class="small muted">
        Started from {title(editing || 'default')}. Review the proposed assignments before applying.
      </p>
    {:else if editing === 'default'}
      <p class="small muted">
        Changes save automatically and apply wherever a stage follows these defaults.
      </p>
    {:else}
      <p class="small muted">
        {hasStageModels(p, editing) ? 'Customized for this stage.' : 'Follows exercise defaults.'}
        Changes save automatically for this stage.
      </p>
    {/if}
    <ModelPicker
      {catalogue}
      selected={active.models}
      writer={!bulk && editing === 'default' ? p.writer : undefined}
      mode={active.mode}
      efforts={active.efforts}
      fusion={active.fusion}
      multiple={!!bulk || editing !== '6'}
      {loading}
      {loaded}
      {status}
      {refresh}
      {loadRanking}
      bind:browseView
      bind:browseSearch
      onmodels={models}
      onwriter={changeWriter}
      onmode={mode}
      oneffort={effort}
      onfusion={fusion}
    />
    {#if bulk}
      {#if needsWriter}
        <label class="stage-writing-model"
          >Writing model for the selected stages
          <select bind:value={bulkWriter}>
            <option value="">Choose one writing model…</option>
            {#each active.models as id}<option value={id}>{name(id)}</option>{/each}
          </select>
        </label>
      {/if}
      <div class="bulk-model-preview">
        <h4>Proposed assignments</h4>
        <dl>
          {#each preview.rows as row (row.scope)}
            <div>
              <dt>{title(row.scope)}</dt>
              <dd>{row.summary}</dd>
            </div>
          {/each}
        </dl>
      </div>
      {#if preview.issues.length}
        <div class="notice review" role="status">
          <ul>
            {#each preview.issues as issue}<li>{issue}</li>{/each}
          </ul>
        </div>
      {/if}
      {#if !loaded}<p class="small muted">
          Load the model catalogue to check these assignments before applying.
        </p>{/if}
      <div class="dialog-actions">
        <button type="button" class="secondary" onclick={() => endBulk()}>Cancel bulk edit</button>
        <button
          type="button"
          class="primary"
          disabled={!loaded || loading || !targets.length || !!preview.issues.length}
          onclick={applyBulk}>Apply to selected stages</button
        >
      </div>
    {/if}
  </section>
{/snippet}

<section class="stage-model-workspace" aria-label="Models by analysis stage">
  <div class="section-line stage-model-toolbar">
    <h3>Models by stage</h3>
    <div>
      {#if !selecting}
        <button
          type="button"
          class="secondary small"
          bind:this={multipleButton}
          onclick={selectStages}>Edit multiple stages</button
        >
      {/if}
      {#if previous}
        <button type="button" class="text-button small" onclick={undo}>
          <Undo2 size={15} aria-hidden="true" /> Undo settings change
        </button>
      {/if}
    </div>
  </div>
  <p class="small stage-model-feedback" role="status">{feedback}</p>
  {#if selecting && !bulk}
    <div class="configuration-toolbar">
      <h4 tabindex="-1" bind:this={bulkHeading}>Choose stages to edit</h4>
      <label class="inline-checkbox">
        <input
          type="checkbox"
          checked={targets.length === stageScopes.length}
          onchange={(event) => (targets = event.currentTarget.checked ? [...stageScopes] : [])}
        />
        Select all stages
      </label>
    </div>
  {/if}
  <div class="stage-model-grid">
    {#each scopes as scope, i (scope)}
      {@const config = resolveModelConfiguration(p, scope)}
      {@const customized = scope !== 'default' && hasStageModels(p, scope)}
      {@const activeRow = !selecting && editing === scope}
      {@const errors = loaded ? configurationIssues(config, catalogue, scope === 'default') : []}
      <div
        class="stage-model-row"
        class:editing={activeRow}
        class:selectable={!selecting || (!bulk && scope !== 'default')}
        style:--stage-row={i + 1}
        role="presentation"
        onclick={(event) => selectRow(event, scope)}
      >
        {#if selecting && !bulk && scope !== 'default'}
          <input
            type="checkbox"
            aria-label={`Select ${title(scope)}`}
            checked={targets.includes(scope)}
            onchange={(event) =>
              (targets = event.currentTarget.checked
                ? [...targets, scope]
                : targets.filter((target) => target !== scope))}
          />
        {/if}
        <div class="stage-model-summary">
          <strong>{title(scope)}</strong>
          <span class="small stage-model-source muted">
            {scope === 'default'
              ? 'Shared settings'
              : customized
                ? 'Customized'
                : 'Follows defaults'}
          </span>
          <p>{configurationSummary(config, name)}</p>
          {#if scope === 'default' && config.mode === 'individual'}
            <p class="small muted">Writing uses {name(p.writer)}</p>
          {/if}
          {#if errors.length}
            <p class="small picker-unavailable">
              {errors[0]}{errors.length > 1 ? ` (+${errors.length - 1} more)` : ''}
            </p>
          {/if}
          {#if p.configurationProvenance[scope]}
            <p class="small muted">
              Based on {p.configurationProvenance[scope].name}, revision {p.configurationProvenance[
                scope
              ].revision}
            </p>
          {/if}
        </div>
        {#if !selecting}
          <div class="stage-model-row-actions">
            <button
              id={`${uid}-stage-${scope}`}
              type="button"
              class="secondary small"
              aria-label={`Edit models for ${title(scope)}`}
              aria-expanded={activeRow}
              aria-controls={activeRow ? `${uid}-editor` : undefined}
              onclick={() => edit(scope)}>Edit</button
            >
            {#if customized}
              <button
                type="button"
                class="text-button small"
                onclick={() => reset(scope)}
                aria-label={`Use defaults for ${title(scope)}`}>Use defaults</button
              >
            {/if}
          </div>
        {/if}
      </div>
      {#if activeRow}{@render editor()}{/if}
    {/each}
    {#if selecting && !bulk}
      <div class="configuration-toolbar bulk-model-actions">
        <button class="secondary small" type="button" onclick={() => endBulk()}>Cancel</button>
        <button
          class="text-button small"
          type="button"
          disabled={!targets.length}
          onclick={resetSelected}>Use defaults for selected stages</button
        >
        <button class="primary small" type="button" disabled={!targets.length} onclick={beginBulk}>
          Configure {targets.length ? targets.length : 'selected'}
          {targets.length === 1 ? 'stage' : 'stages'}
        </button>
      </div>
    {/if}
    {#if bulk}{@render editor()}{/if}
  </div>
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
  scope={bulk ? 'bulk' : editing || 'default'}
  {targets}
/>
