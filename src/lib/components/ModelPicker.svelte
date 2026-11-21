<script lang="ts">
  import { tick } from 'svelte';
  import { Plus, X } from '@lucide/svelte';
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
  import ModelBrowser, { type ModelBrowserView } from './ModelBrowser.svelte';

  let {
    catalogue,
    selected,
    writer,
    mode = 'individual',
    efforts = {},
    fusion = defaultFusion(),
    multiple = true,
    loading = false,
    loaded = false,
    status = '',
    onmodels,
    onwriter,
    onmode,
    oneffort,
    onfusion,
    refresh,
    loadRanking,
    browseView = $bindable('suggested'),
    browseSearch = $bindable('')
  }: {
    catalogue: Model[];
    selected: string[];
    writer?: string;
    mode?: ModelMode;
    efforts?: Record<string, EffortPreference>;
    fusion?: FusionConfiguration;
    multiple?: boolean;
    loading?: boolean;
    loaded?: boolean;
    status?: string;
    onmodels: (ids: string[]) => void;
    onwriter?: (id: string) => void;
    onmode: (mode: ModelMode) => void;
    oneffort: (id: string, effort: EffortPreference) => void;
    onfusion?: (config: FusionConfiguration) => void;
    refresh: () => void;
    loadRanking?: RankingLoader;
    browseView?: ModelBrowserView;
    browseSearch?: string;
  } = $props();

  type Intent = { kind: 'add' | 'analyst' | 'writer' } | { kind: 'replace'; id: string };
  const uid = $props.id();
  let intent = $state<Intent | null>(null);
  let browser = $state<ReturnType<typeof ModelBrowser>>();
  let heading = $state<HTMLHeadingElement>();
  let opener: HTMLButtonElement | undefined;
  const byId = $derived(new Map(catalogue.map((model) => [model.id, model])));
  const name = (id: string) => displayModelName(id, byId.get(id)?.name);
  const members = $derived(mode === 'fusion' ? fusion.models : selected);
  const max = $derived(mode === 'fusion' ? 8 : 32);
  const canAdd = $derived((mode === 'fusion' || multiple) && members.length < max);
  const selectionGroup = $derived(intent?.kind === 'add' || intent?.kind === 'replace');
  const chosenForIntent = $derived(
    intent?.kind === 'writer'
      ? writer
        ? [writer]
        : []
      : intent?.kind === 'analyst'
        ? fusion.analyst
          ? [fusion.analyst]
          : []
        : members
  );
  const actionLabel = $derived(
    intent?.kind === 'add'
      ? mode === 'fusion'
        ? 'Add member'
        : 'Add model'
      : !selectionGroup || (mode === 'individual' && !multiple)
        ? 'Use model'
        : 'Replace model'
  );
  const issues = $derived(
    loaded
      ? configurationIssues(
          { mode, models: selected, writer: writer ?? selected[0] ?? '', efforts, fusion },
          catalogue,
          !!writer
        )
      : []
  );

  function updateFusion(next: Partial<FusionConfiguration>) {
    onfusion?.({ ...fusion, models: [...fusion.models], ...next });
  }

  function updateMembers(ids: string[]) {
    if (mode === 'fusion') updateFusion({ models: ids });
    else onmodels(ids);
  }

  async function openBrowser(next: Intent, trigger: HTMLButtonElement) {
    intent = next;
    opener = trigger;
    await tick();
    browser?.focusSearch();
  }

  const replaceButtonId = (id: string) => `${uid}-replace-${id}`;

  async function closeBrowser(focusId?: string) {
    intent = null;
    await tick();
    const newButton = focusId ? document.getElementById(replaceButtonId(focusId)) : null;
    (newButton ?? (opener?.isConnected ? opener : heading))?.focus();
  }

  function choose(id: string) {
    const replacing = intent?.kind === 'replace';
    if (intent?.kind === 'writer') onwriter?.(id);
    else if (intent?.kind === 'analyst') updateFusion({ analyst: id });
    else if (intent?.kind === 'add') updateMembers([...members, id]);
    else if (intent?.kind === 'replace') {
      const target = intent.id;
      updateMembers(members.map((member) => (member === target ? id : member)));
    }
    void closeBrowser(replacing ? id : undefined);
  }

  function onlyModel(id: string) {
    updateMembers([id]);
    void closeBrowser(id);
  }

  async function remove(id: string) {
    updateMembers(members.filter((member) => member !== id));
    intent = null;
    await tick();
    heading?.focus();
  }

  function changeMode(next: ModelMode) {
    intent = null;
    onmode(next);
  }
</script>

<div class="model-picker">
  {#if mode === 'individual' || fusion.type === 'custom'}
    <h4 class="picker-selection-heading" tabindex="-1" bind:this={heading}>
      {mode === 'fusion'
        ? `Panel members (${members.length} of 8)`
        : multiple
          ? 'Selected models'
          : 'Selected model'}
    </h4>
    <ul class="picker-current-list">
      {#each members as id, i (id)}
        <li>
          <span class="model-mark" aria-hidden="true">{['●', '■', '▲', '◆'][i % 4]}</span>
          <div class="picker-current-model">
            <strong>{name(id)}</strong>
            {#if loaded && !byId.has(id)}<small class="picker-unavailable">Unavailable · {id}</small
              >{/if}
          </div>
          <div class="picker-current-actions">
            <button
              id={replaceButtonId(id)}
              type="button"
              class="secondary small"
              aria-label={`Replace ${name(id)}`}
              onclick={(event) => openBrowser({ kind: 'replace', id }, event.currentTarget)}
              >Replace</button
            >
            {#if members.length > 1}
              <button
                type="button"
                class="icon-button"
                aria-label={`Remove ${name(id)}`}
                onclick={() => remove(id)}><X size={16} aria-hidden="true" /></button
              >
            {/if}
          </div>
        </li>
      {/each}
    </ul>
    {#if canAdd || !members.length}
      <button
        type="button"
        class="text-button picker-add-model"
        onclick={(event) => openBrowser({ kind: 'add' }, event.currentTarget)}
      >
        <Plus size={16} aria-hidden="true" />
        {mode === 'fusion'
          ? 'Add panel member'
          : members.length
            ? 'Add another model'
            : 'Add model'}
      </button>
    {/if}
  {:else}
    <h4 class="picker-selection-heading" tabindex="-1" bind:this={heading}>Fusion panel</h4>
    <p>{fusionPresets.find((preset) => preset.id === fusion.preset)?.name}</p>
  {/if}
  {#if mode === 'fusion'}
    <p class="small muted">
      Fusion combines its panel into one contribution and may use web research.
    </p>
  {/if}

  {#if issues.length}
    <div class="notice review" role="status">
      <strong>Review this selection</strong>
      <ul>
        {#each issues as issue}<li>{issue}</li>{/each}
      </ul>
    </div>
  {/if}

  <details class="picker-settings">
    <summary>Model settings</summary>
    <fieldset class="model-mode-options">
      <legend>Contribution mode</legend>
      <label class:chosen={mode === 'individual'}>
        <input
          type="radio"
          name={`${uid}-mode`}
          checked={mode === 'individual'}
          onchange={() => changeMode('individual')}
        />
        <span
          ><strong>Independent models</strong><small>
            {multiple
              ? 'Each selected model contributes separately.'
              : 'One model contributes at a time.'}
          </small></span
        >
      </label>
      <label class:chosen={mode === 'fusion'}>
        <input
          type="radio"
          name={`${uid}-mode`}
          checked={mode === 'fusion'}
          onchange={() => changeMode('fusion')}
        />
        <span
          ><strong>Fusion</strong><small
            >A panel and analyst produce one combined contribution.</small
          ></span
        >
      </label>
    </fieldset>
    {#if mode === 'fusion'}
      <section class="fusion-controls" aria-label="Fusion panel configuration">
        <label
          >Panel configuration
          <select
            value={fusion.type}
            onchange={(event) => {
              intent = null;
              updateFusion({ type: event.currentTarget.value as FusionConfiguration['type'] });
            }}
          >
            <option value="preset">OpenRouter preset</option>
            <option value="custom">Custom panel</option>
          </select>
        </label>
        {#if fusion.type === 'preset'}
          <label
            >Preset
            <select
              value={fusion.preset}
              onchange={(event) =>
                updateFusion({
                  preset: event.currentTarget.value as FusionConfiguration['preset']
                })}
            >
              {#each fusionPresets as preset}<option value={preset.id}>{preset.name}</option>{/each}
            </select>
          </label>
          <p class="small muted">OpenRouter manages preset membership and may update it.</p>
        {/if}
        <label
          >Shared Fusion thinking effort
          <select
            value={fusion.effort}
            onchange={(event) =>
              updateFusion({ effort: event.currentTarget.value as FusionConfiguration['effort'] })}
          >
            <option value="provider-default">Provider default</option>
            {#each effortSchema.options as effort}<option value={effort}
                >{effortLabels[effort]}</option
              >{/each}
          </select>
        </label>
        <div class="picker-analyst">
          <p>
            <strong>Analyst model</strong> · {fusion.analyst
              ? name(fusion.analyst)
              : 'Provider-selected'}
          </p>
          <p class="small muted">The analyst compares panel responses before the final answer.</p>
          <button
            type="button"
            class="secondary small"
            onclick={(event) => openBrowser({ kind: 'analyst' }, event.currentTarget)}
            >Choose analyst model</button
          >
          {#if fusion.analyst}
            <button
              type="button"
              class="text-button small"
              onclick={() => {
                intent = null;
                updateFusion({ analyst: undefined });
              }}>Use provider-selected analyst</button
            >
          {/if}
        </div>
        {#if fusion.type === 'custom' || fusion.analyst}
          <details class="picker-details">
            <summary>Fusion model IDs</summary>
            <div>
              {#if fusion.type === 'custom'}
                {#each fusion.models as id}<code>{id}</code>{/each}
              {/if}
              {#if fusion.analyst}<span>Analyst <code>{fusion.analyst}</code></span>{/if}
            </div>
          </details>
        {/if}
        <p class="small">
          <a
            href="https://openrouter.ai/docs/guides/routing/routers/fusion-router"
            target="_blank"
            rel="noreferrer">How Fusion works</a
          >
        </p>
      </section>
    {:else}
      {#each selected as id (id)}
        {@const model = byId.get(id)}
        {@const choices = supportedEfforts(model)}
        {@const preference = efforts[id] ?? effectiveEffort(model) ?? 'provider-default'}
        <div class="picker-effort-model">
          <label class="picker-effort"
            >Thinking effort for {name(id)}
            <select
              value={preference}
              onchange={(event) => oneffort(id, event.currentTarget.value as EffortPreference)}
            >
              <option value="provider-default">Provider default</option>
              {#if preference !== 'provider-default' && !choices.includes(preference)}
                <option value={preference} disabled>{effortLabels[preference]} · unsupported</option
                >
              {/if}
              {#each choices as effort}<option value={effort}>{effortLabels[effort]}</option>{/each}
            </select>
          </label>
          <small class="muted">{id}{id.startsWith('~') ? ' · tracks provider updates' : ''}</small>
        </div>
      {/each}
    {/if}
  </details>

  {#if writer && onwriter}
    <section class="stage-writing-model" aria-label="Default writing model">
      <div class="section-line">
        <div>
          <h4>Default writing model</h4>
          <p>{name(writer)}</p>
        </div>
        <button
          type="button"
          class="secondary small"
          aria-expanded={intent?.kind === 'writer'}
          onclick={(event) => openBrowser({ kind: 'writer' }, event.currentTarget)}
        >
          Change writing model
        </button>
      </div>
    </section>
  {/if}

  {#if intent}
    <section class="picker-chooser" aria-labelledby={`${uid}-chooser-title`}>
      <div class="section-line">
        <h4 id={`${uid}-chooser-title`}>
          {intent.kind === 'writer'
            ? 'Choose the default writing model'
            : intent.kind === 'replace'
              ? `Replace ${name(intent.id)}`
              : intent.kind === 'analyst'
                ? 'Choose an analyst model'
                : mode === 'fusion'
                  ? 'Add a panel member'
                  : 'Add a model'}
        </h4>
        <button type="button" class="text-button small" onclick={() => closeBrowser()}
          >Close model search</button
        >
      </div>
      <ModelBrowser
        bind:this={browser}
        bind:view={browseView}
        bind:search={browseSearch}
        {catalogue}
        selected={chosenForIntent}
        {actionLabel}
        onselect={choose}
        ononly={selectionGroup && (mode === 'fusion' || multiple) ? onlyModel : undefined}
        individualOnly={mode === 'fusion' && intent.kind !== 'writer'}
        {loading}
        {loaded}
        {status}
        {refresh}
        {loadRanking}
      />
    </section>
  {/if}
</div>
