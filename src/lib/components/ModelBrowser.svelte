<script module lang="ts">
  export type ModelBrowserView = 'suggested' | 'fast' | 'smartest' | 'free' | 'all';
</script>

<script lang="ts">
  import { untrack } from 'svelte';
  import { Check, RefreshCw, Search } from '@lucide/svelte';
  import { displayModelName, isRouterModel } from '$lib/domain/model-settings';
  import {
    isFreeModel,
    type Model,
    type ModelSort,
    type ModelRanking,
    type RankingLoader
  } from '$lib/ai/models';
  import recommendations from '$lib/config/model-recommendations.json';

  let {
    catalogue,
    selected,
    onselect,
    ononly,
    actionLabel = 'Use model',
    individualOnly = false,
    loading = false,
    loaded = false,
    status = '',
    refresh,
    loadRanking,
    view = $bindable('suggested'),
    search = $bindable('')
  }: {
    catalogue: Model[];
    selected: string[];
    onselect: (id: string) => void;
    ononly?: (id: string) => void;
    actionLabel?: string;
    individualOnly?: boolean;
    loading?: boolean;
    loaded?: boolean;
    status?: string;
    refresh: () => void;
    loadRanking?: RankingLoader;
    view?: ModelBrowserView;
    search?: string;
  } = $props();

  const uid = $props.id();
  const tabs = [
    ['suggested', 'Suggested'],
    ['fast', 'Fast'],
    ['smartest', 'Benchmark ranked'],
    ['free', 'Free'],
    ['all', 'Browse all']
  ] as const;
  let searchInput: HTMLInputElement;
  let speed = $state<ModelSort>('throughput-high-to-low');
  let extraResults = $state(0);
  let orders = $state<Partial<Record<ModelSort, ModelRanking>>>({});
  let failures = $state<Partial<Record<ModelSort, string>>>({});
  let pending = $state<ModelSort | null>(null);
  let generation = 0;

  const query = $derived(search.trim().toLowerCase());
  const sort = $derived(
    query ? null : view === 'smartest' ? 'intelligence-high-to-low' : view === 'fast' ? speed : null
  );
  const limit = $derived((!query && view === 'smartest' ? 10 : 20) + extraResults);
  const eligible = $derived(
    catalogue.filter(
      (model) =>
        !model.id.replace(/^~/, '').startsWith('openrouter/fusion') &&
        (!individualOnly || !isRouterModel(model.id))
    )
  );
  const byId = $derived(new Map(eligible.map((model) => [model.id, model])));
  const listed = $derived.by(() => {
    if (query) {
      const exact = eligible.find((model) => model.id.toLowerCase() === query);
      const terms = query.split(/\s+/);
      const matches = eligible.filter((model) => {
        const label = `${name(model)} ${model.name} ${model.id}`.toLowerCase();
        return model !== exact && terms.every((term) => label.includes(term));
      });
      return exact ? [exact, ...matches] : matches;
    }
    if (view === 'suggested') return recommendations.models.flatMap((id) => byId.get(id) ?? []);
    if (view === 'free') return eligible.filter(isFreeModel);
    if (sort) return (orders[sort]?.ids ?? []).flatMap((id) => byId.get(id) ?? []);
    return eligible;
  });

  $effect(() => {
    catalogue;
    untrack(() => {
      generation++;
      failures = {};
      pending = null;
      // Keep the previous valid order while the refreshed catalogue is revalidated.
      if (sort && loaded && loadRanking) void loadOrder(sort);
    });
  });
  $effect(() => {
    if (sort && loaded && loadRanking && !orders[sort] && !failures[sort] && pending === null)
      void loadOrder(sort);
  });

  export function focusSearch() {
    searchInput?.focus();
  }

  async function loadOrder(value: ModelSort) {
    if (!loadRanking) return;
    const token = generation;
    pending = value;
    try {
      const result = await loadRanking(value);
      if (token === generation) {
        orders = { ...orders, [value]: result };
        failures = { ...failures, [value]: undefined };
      }
    } catch {
      if (token === generation)
        failures = { ...failures, [value]: 'Could not refresh this ranking.' };
    } finally {
      if (token === generation) pending = null;
    }
  }

  function activate(value: ModelBrowserView) {
    view = value;
    extraResults = 0;
  }

  function tabKey(event: KeyboardEvent, index: number) {
    const target =
      event.key === 'ArrowRight'
        ? (index + 1) % tabs.length
        : event.key === 'ArrowLeft'
          ? (index + tabs.length - 1) % tabs.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? tabs.length - 1
              : -1;
    if (target < 0) return;
    event.preventDefault();
    activate(tabs[target][0]);
    document.getElementById(`${uid}-tab-${tabs[target][0]}`)?.focus();
  }

  function name(model: Model) {
    return displayModelName(model.id, model.name);
  }

  function price(model: Model) {
    const values = [model.pricing.prompt, model.pricing.completion];
    if (values.some((v) => !v.trim() || !Number.isFinite(Number(v)) || Number(v) < 0))
      return 'Price unknown';
    const request = model.pricing.request;
    return `$${(Number(values[0]) * 1e6).toFixed(2)} in / $${(Number(values[1]) * 1e6).toFixed(2)} out per million tokens${Number(request) > 0 ? ` + $${request}/request` : ''}`;
  }
</script>

<div class="picker-browser">
  <label class="picker-search">
    <span>Search all available models</span>
    <div>
      <Search size={17} aria-hidden="true" />
      <input
        type="search"
        bind:this={searchInput}
        bind:value={search}
        oninput={() => (extraResults = 0)}
        placeholder="Model name, developer, or exact ID"
      />
    </div>
  </label>
  {#if !query}
    <div class="picker-filter-tabs" role="tablist" aria-label="Browse models">
      {#each tabs as [value, label], i}
        <button
          id={`${uid}-tab-${value}`}
          type="button"
          role="tab"
          aria-selected={view === value}
          aria-controls={`${uid}-results`}
          tabindex={view === value ? 0 : -1}
          class:active={view === value}
          onclick={() => activate(value)}
          onkeydown={(event) => tabKey(event, i)}>{label}</button
        >
      {/each}
    </div>
  {/if}
  <div
    role={query ? undefined : 'tabpanel'}
    id={`${uid}-results`}
    aria-labelledby={query ? undefined : `${uid}-tab-${view}`}
  >
    {#if sort && view === 'fast'}
      <label class="picker-effort">
        Sort by
        <select bind:value={speed} onchange={() => (extraResults = 0)}>
          <option value="throughput-high-to-low">Output speed</option>
          <option value="latency-low-to-high">Time to first token</option>
        </select>
      </label>
    {/if}
    {#if !query && view !== 'all'}
      <details class="picker-details">
        <summary
          >About {view === 'smartest'
            ? 'this ranking'
            : tabs.find(([value]) => value === view)?.[1].toLowerCase()}</summary
        >
        {#if view === 'suggested'}
          <p>
            Maintained suggestions, reviewed {recommendations.reviewedAt}. Automatic updates await a
            permitted data feed.
            <a href={recommendations.sourceUrl} target="_blank" rel="noreferrer">AA Briefcase</a>.
            Benchmark performance is not a direct measure of foresight quality.
          </p>
        {:else if view === 'fast'}
          <p>
            OpenRouter orders models by recent performance and lists unmeasured models last. Speed
            varies with provider, load, context and thinking effort. Provider routing stays the
            same.
          </p>
        {:else if view === 'smartest'}
          <p>
            <a
              href="https://artificialanalysis.ai/evaluations/artificial-analysis-intelligence-index"
              target="_blank"
              rel="noreferrer">AA Intelligence Index</a
            >
            order via OpenRouter, limited to scored models. The order supplies neither scores nor benchmark
            version. Benchmark performance is not a direct measure of foresight quality.
          </p>
        {:else if view === 'free'}
          <p>
            No input, output or request charge in the catalogue. An OpenRouter key is still needed
            and usage limits may apply.
          </p>
        {/if}
      </details>
    {/if}
    {#if sort}
      <p class="small muted" role="status">
        {pending === sort
          ? 'Loading model order…'
          : orders[sort]
            ? `Order retrieved ${new Date(orders[sort]!.refreshedAt).toLocaleString()}`
            : 'Ranking unavailable. Search all available models or try Browse all.'}
      </p>
      {#if failures[sort]}
        <p class="small" role="status">
          {failures[sort]}
          <button
            type="button"
            class="text-button"
            disabled={pending !== null}
            onclick={() => loadOrder(sort!)}
          >
            Try again
          </button>
        </p>
      {/if}
    {/if}
    <div class="section-line picker-catalogue-status">
      <span class="small muted" role="status">
        {loading
          ? 'Finding available models…'
          : `${listed.length} ${listed.length === 1 ? 'model' : 'models'}${query ? ' in search results' : ''}`}
      </span>
      <button class="text-button small" type="button" disabled={loading} onclick={refresh}>
        <RefreshCw size={14} aria-hidden="true" /> Refresh catalogue
      </button>
    </div>
    {#if status}<p class="small muted" role="status">{status}</p>{/if}
    {#if !loading && !listed.length && (!sort || pending !== sort)}
      <div class="picker-empty">
        <strong>No models found</strong>
        <p>
          {query
            ? 'Try a different name or ID, or clear the search to browse.'
            : 'Search all available models or try another view.'}
        </p>
      </div>
    {/if}
    <div class="picker-results" aria-busy={loading || (sort !== null && pending === sort)}>
      {#each listed.slice(0, limit) as model (model.id)}
        {@const chosen = selected.includes(model.id)}
        <div class="picker-result">
          <div>
            <strong>{name(model)}</strong>
            <small
              >{isFreeModel(model) ? 'Free' : price(model)} · {loaded
                ? 'In catalogue'
                : 'Availability unconfirmed'}</small
            >
            <details class="picker-details">
              <summary>Model details<span class="sr-only"> for {name(model)}</span></summary>
              <div>
                <code>{model.id}</code>
                {#if model.id.startsWith('~')}<span>Tracks provider updates</span>{/if}
                {#if model.context_length}<span
                    >{model.context_length.toLocaleString()} token context</span
                  >{/if}
              </div>
            </details>
          </div>
          <div class="picker-result-actions">
            {#if chosen}
              <span class="picker-current small"
                ><Check size={15} aria-hidden="true" /> Selected</span
              >
            {:else}
              <button
                type="button"
                class="secondary small"
                aria-label={`${actionLabel} — ${name(model)}`}
                onclick={() => onselect(model.id)}>{actionLabel}</button
              >
            {/if}
            {#if ononly && !chosen}
              <button
                type="button"
                class="text-button small"
                aria-label={`Use ${name(model)} as the only model`}
                onclick={() => ononly?.(model.id)}>Use as only model</button
              >
            {/if}
          </div>
        </div>
      {/each}
    </div>
    {#if listed.length > limit}
      <button class="secondary picker-show-more" type="button" onclick={() => (extraResults += 20)}>
        Show more models ({listed.length - limit} remaining)
      </button>
    {/if}
  </div>
</div>
