<script lang="ts">
  import { X, Layers } from '@lucide/svelte';
  import {
    displayModelName,
    effortLabels,
    effortSchema,
    defaultFusion,
    fusionPresets,
    type ModelMode,
    type EffortPreference,
    type FusionConfiguration
  } from '$lib/domain/model-settings';
  import {
    effectiveEffort,
    supportedEfforts,
    type Model,
    type RankingLoader
  } from '$lib/ai/models';
  import { configurationIssues } from '$lib/ai/model-configuration';
  import ModelBrowser from './ModelBrowser.svelte';
  let {
    catalogue,
    selected,
    mode = 'individual',
    efforts = {},
    fusion = defaultFusion(),
    multiple = true,
    loading = false,
    loaded = false,
    status = '',
    onmodels,
    onmode,
    oneffort,
    onfusion,
    refresh,
    loadRanking
  }: {
    catalogue: Model[];
    selected: string[];
    mode?: ModelMode;
    efforts?: Record<string, EffortPreference>;
    fusion?: FusionConfiguration;
    multiple?: boolean;
    loading?: boolean;
    loaded?: boolean;
    status?: string;
    onmodels: (ids: string[]) => void;
    onmode: (mode: ModelMode) => void;
    oneffort: (id: string, effort: EffortPreference) => void;
    onfusion?: (config: FusionConfiguration) => void;
    refresh: () => void;
    loadRanking?: RankingLoader;
  } = $props();
  const uid = $props.id();
  const byId = $derived(new Map(catalogue.map((m) => [m.id, m])));
  const name = (id: string) => displayModelName(id, byId.get(id)?.name);
  const issues = $derived(
    loaded
      ? configurationIssues(
          {
            mode,
            models: selected.length ? selected : ['~anthropic/claude-sonnet-latest'],
            writer: selected[0] ?? '~anthropic/claude-sonnet-latest',
            efforts,
            fusion
          },
          catalogue
        )
      : []
  );
  function updateFusion(next: Partial<FusionConfiguration>) {
    onfusion?.({ ...fusion, models: [...fusion.models], ...next });
  }
</script>

<div class="model-picker">
  <fieldset class="model-mode-options">
    <legend>How should this selection contribute?</legend>
    <label class:chosen={mode === 'individual'}
      ><input
        type="radio"
        name={`${uid}-mode`}
        checked={mode === 'individual'}
        onchange={() => onmode('individual')}
      /><span
        ><strong>Independent models</strong><small
          >{multiple
            ? 'One model or several separately attributed perspectives.'
            : 'One model for each writing proposal.'}</small
        ></span
      ></label
    >
    <label class:chosen={mode === 'fusion'}
      ><input
        type="radio"
        name={`${uid}-mode`}
        checked={mode === 'fusion'}
        onchange={() => onmode('fusion')}
      /><span
        ><strong>Fusion</strong><small>A panel and analyst return one combined contribution.</small
        ></span
      ></label
    >
  </fieldset>
  {#if mode === 'fusion'}
    <section class="fusion-controls" aria-label="Fusion panel configuration">
      <p class="small">
        <Layers size={17} aria-hidden="true" /> Fusion may use web research. Costs vary and count towards
        the exercise budget.
      </p>
      <label
        >Panel configuration<select
          value={fusion.type}
          onchange={(e) =>
            updateFusion({ type: e.currentTarget.value as FusionConfiguration['type'] })}
          ><option value="preset">OpenRouter preset</option><option value="custom"
            >Custom panel</option
          ></select
        ></label
      >
      {#if fusion.type === 'preset'}
        <label
          >Preset<select
            value={fusion.preset}
            onchange={(e) =>
              updateFusion({ preset: e.currentTarget.value as FusionConfiguration['preset'] })}
            >{#each fusionPresets as preset}<option value={preset.id}>{preset.name}</option
              >{/each}</select
          ></label
        >
        <p class="small muted">
          Membership is managed by OpenRouter and can change. We do not present an old member list
          as the current preset.
        </p>
      {:else}
        <h4>Panel members · {fusion.models.length} of 8</h4>
        <div class="configuration-chips">
          {#each fusion.models as id}<span
              ><span><strong>{name(id)}</strong><small>{id}</small></span><button
                class="icon-button"
                type="button"
                aria-label={`Remove ${name(id)} from Fusion`}
                disabled={fusion.models.length <= 1}
                onclick={() => updateFusion({ models: fusion.models.filter((m) => m !== id) })}
                ><X size={15} /></button
              ></span
            >{/each}
        </div>
        {#if fusion.models.length === 1}<p class="small muted">
            This is a one-member panel, not multiple independent perspectives.
          </p>{/if}
        <ModelBrowser
          {catalogue}
          selected={fusion.models}
          onmodels={(models) => updateFusion({ models })}
          max={8}
          individualOnly
          {loading}
          {loaded}
          {status}
          {refresh}
          {loadRanking}
        />
      {/if}
      <label
        >Shared Fusion thinking effort<select
          value={fusion.effort}
          onchange={(e) =>
            updateFusion({ effort: e.currentTarget.value as FusionConfiguration['effort'] })}
          ><option value="provider-default">Provider default</option
          >{#each effortSchema.options as effort}<option value={effort}
              >{effortLabels[effort]}</option
            >{/each}</select
        ></label
      >
      <p class="small muted">
        This setting is shared by panel and analyst calls. It is not a separate setting for each
        member.
      </p>
      <details class="picker-details">
        <summary
          >Analyst model · {fusion.analyst ? name(fusion.analyst) : 'Provider-selected'}</summary
        >
        <p>The analyst compares panel responses before the final answer is written.</p>
        {#if fusion.analyst}<p>{fusion.analyst}</p>{/if}
        {#if fusion.analyst}<button
            class="secondary small"
            type="button"
            onclick={() => updateFusion({ analyst: undefined })}
            >Use provider-selected analyst</button
          >{/if}
        <ModelBrowser
          {catalogue}
          selected={fusion.analyst ? [fusion.analyst] : []}
          onmodels={(ids) => updateFusion({ analyst: ids[0] })}
          multiple={false}
          individualOnly
          {loading}
          {loaded}
          {status}
          {refresh}
          {loadRanking}
        />
      </details>
      <p class="small">
        <a
          href="https://openrouter.ai/docs/guides/routing/routers/fusion-router"
          target="_blank"
          rel="noreferrer">How Fusion works</a
        > · Preset catalogue checked 17 November 2026.
      </p>
    </section>
  {:else}
    <div class="section-line picker-selection-heading">
      <h4>{multiple ? 'Selected models' : 'Selected model'}</h4>
      <span class="small muted">{selected.length} selected</span>
    </div>
    <p class="small muted">
      Use only replaces the selection; Add requests another independent contribution.
    </p>
    <div class="picker-selected">
      {#each selected as id, i (id)}
        {@const model = byId.get(id)}
        {@const choices = supportedEfforts(model)}
        {@const preference = efforts[id] ?? effectiveEffort(model) ?? 'provider-default'}
        <div class="picker-selected-model">
          <div class="picker-model-heading">
            <span class="model-mark" aria-hidden="true">{['●', '■', '▲', '◆'][i % 4]}</span>
            <div>
              <strong>{name(id)}</strong><small
                >{id}{id.startsWith('~') ? ' · tracks provider updates' : ''}</small
              >
            </div>
            {#if multiple}<button
                class="icon-button"
                type="button"
                disabled={selected.length <= 1}
                aria-label={`Remove ${name(id)}`}
                onclick={() => onmodels(selected.filter((m) => m !== id))}><X size={16} /></button
              >{/if}
          </div>
          <label class="picker-effort"
            >Thinking effort<select
              aria-label={`Thinking effort for ${name(id)}`}
              value={preference}
              onchange={(e) => oneffort(id, e.currentTarget.value as EffortPreference)}
            >
              <option value="provider-default">Provider default</option>
              {#if preference !== 'provider-default' && !choices.includes(preference)}<option
                  value={preference}
                  disabled>{effortLabels[preference]} · unsupported</option
                >{/if}
              {#each choices as effort}<option value={effort}>{effortLabels[effort]}</option>{/each}
            </select></label
          >
          {#if model?.context_length}<p class="small muted">
              {model.context_length.toLocaleString()} token context
            </p>{/if}
        </div>
      {/each}
    </div>
    <ModelBrowser
      {catalogue}
      {selected}
      {multiple}
      {loading}
      {loaded}
      {status}
      {refresh}
      {loadRanking}
      {onmodels}
    />
  {/if}
  {#if issues.length}<div class="notice review" role="status">
      <strong>Review this selection</strong>
      <ul>
        {#each issues as issue}<li>{issue}</li>{/each}
      </ul>
    </div>{/if}
</div>
