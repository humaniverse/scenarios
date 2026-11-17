<script lang="ts">
  import { untrack } from 'svelte';
  import { Check, Plus, RefreshCw, Search } from '@lucide/svelte';
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
    onmodels,
    multiple = true,
    max = 32,
    individualOnly = false,
    loading = false,
    loaded = false,
    status = '',
    refresh,
    loadRanking
  }: {
    catalogue: Model[];
    selected: string[];
    onmodels: (ids: string[]) => void;
    multiple?: boolean;
    max?: number;
    individualOnly?: boolean;
    loading?: boolean;
    loaded?: boolean;
    status?: string;
    refresh: () => void;
    loadRanking?: RankingLoader;
  } = $props();
  const uid = $props.id();
  const tabs = [
    ['suggested', 'Suggested'],
    ['fast', 'Fast'],
    ['smartest', 'Smartest'],
    ['free', 'Free'],
    ['all', 'Browse all']
  ] as const;
  type View = (typeof tabs)[number][0];
  let view = $state<View>('suggested');
  let search = $state('');
  let speed = $state<ModelSort>('throughput-high-to-low');
  let limit = $state(20);
  let orders = $state<Partial<Record<ModelSort, ModelRanking>>>({});
  let failures = $state<Partial<Record<ModelSort, string>>>({});
  let pending = $state<ModelSort | null>(null);
  let generation = 0;
  const sort = $derived(
    view === 'smartest' ? 'intelligence-high-to-low' : view === 'fast' ? speed : null
  );
  const available = $derived(
    catalogue.filter(
      (m) =>
        !m.id.replace(/^~/, '').startsWith('openrouter/fusion') &&
        (!individualOnly || !isRouterModel(m.id))
    )
  );
  const byId = $derived(new Map(available.map((m) => [m.id, m])));
  const listed = $derived(
    (view === 'suggested'
      ? recommendations.models.flatMap((id) => byId.get(id) ?? [])
      : view === 'free'
        ? available.filter(isFreeModel)
        : sort
          ? (orders[sort]?.ids ?? []).flatMap((id) => byId.get(id) ?? [])
          : available
    ).filter((m) => `${m.name} ${m.id}`.toLowerCase().includes(search.trim().toLowerCase()))
  );
  $effect(() => {
    catalogue;
    untrack(() => {
      generation++;
      failures = {};
      pending = null;
      // Retain the previous valid order while revalidating; IDs are always intersected with this catalogue.
      if (sort && loaded && loadRanking) void loadOrder(sort);
    });
  });
  $effect(() => {
    if (sort && loaded && loadRanking && !orders[sort] && !failures[sort] && pending === null)
      void loadOrder(sort);
  });
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
        failures = {
          ...failures,
          [value]:
            'Ranking refresh failed. Any last successful order is retained. Try again or use Browse all.'
        };
    } finally {
      if (token === generation) pending = null;
    }
  }
  function activate(value: View) {
    view = value;
    limit = value === 'smartest' ? 10 : 20;
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
  const name = (m: Model) => displayModelName(m.id, m.name);
  function price(m: Model) {
    const values = [m.pricing.prompt, m.pricing.completion];
    if (values.some((v) => !v.trim() || !Number.isFinite(Number(v)) || Number(v) < 0))
      return 'Price unknown';
    return `$${(Number(values[0]) * 1e6).toFixed(2)} in / $${(Number(values[1]) * 1e6).toFixed(2)} out per million tokens${Number(m.pricing.request) > 0 ? ` + $${m.pricing.request}/request` : ''}`;
  }
</script>

<div class="picker-browser">
  <div class="picker-filter-tabs" role="tablist" aria-label="Find models">
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
        onkeydown={(e) => tabKey(e, i)}>{label}</button
      >
    {/each}
  </div>
  <div role="tabpanel" id={`${uid}-results`} aria-labelledby={`${uid}-tab-${view}`}>
    {#if view === 'suggested'}
      <p class="small muted">
        Maintained suggestions · reviewed {recommendations.reviewedAt}. No AA Briefcase scores have
        been imported.
      </p>
      <p class="small muted">
        Automatic updates await a permitted data feed. <a
          href={recommendations.sourceUrl}
          target="_blank"
          rel="noreferrer">AA Briefcase</a
        >. Benchmark performance is not a direct measure of foresight quality.
      </p>
    {:else if view === 'fast'}
      <label class="picker-effort"
        >Sort by<select bind:value={speed}
          ><option value="throughput-high-to-low">Output speed</option><option
            value="latency-low-to-high">Time to first token</option
          ></select
        ></label
      >
      <p class="small muted">
        OpenRouter’s recent performance order; unmeasured models sort last. Numerical measurements
        are not supplied here. Speed varies with provider, load, context and thinking effort. This
        does not change provider routing.
      </p>
    {:else if view === 'smartest'}
      <p class="small muted">
        <a
          href="https://artificialanalysis.ai/evaluations/artificial-analysis-intelligence-index"
          target="_blank"
          rel="noreferrer">AA Intelligence Index</a
        > order via OpenRouter, filtered to scored models. Scores and benchmark version are not supplied
        by this ordering. Benchmark performance is not a direct measure of foresight quality.
      </p>
    {:else if view === 'free'}
      <p class="small muted">
        No input, output or request charge in the current catalogue. An OpenRouter key is still
        needed; usage limits may apply.
      </p>
    {/if}
    {#if sort}
      <p class="small muted" role="status">
        {pending === sort
          ? 'Loading model order…'
          : orders[sort]
            ? `Order retrieved ${new Date(orders[sort]!.refreshedAt).toLocaleString()}`
            : loaded
              ? 'Ranking not loaded.'
              : 'Load the model catalogue to check rankings.'}
      </p>
      {#if failures[sort]}<p class="notice review" role="status">
          {failures[sort]}
          <button
            type="button"
            class="text-button"
            disabled={pending !== null}
            onclick={() => loadOrder(sort!)}>Try ranking again</button
          >
        </p>{/if}
      {#if !loadRanking}<p class="small muted">
          Ranked discovery is unavailable here. Use Browse all.
        </p>{/if}
    {/if}
    <label class="picker-search"
      ><span>Find a model</span>
      <div>
        <Search size={17} aria-hidden="true" /><input
          type="search"
          bind:value={search}
          oninput={() => (limit = 20)}
          placeholder="Search name or developer…"
        />
      </div></label
    >
    <div class="section-line picker-catalogue-status">
      <span class="small muted" role="status"
        >{loading ? 'Finding available models…' : `${listed.length} models`}</span
      ><button class="text-button small" type="button" disabled={loading} onclick={refresh}
        ><RefreshCw size={14} /> Refresh catalogue</button
      >
    </div>
    {#if status}<p class="small muted" role="status">{status}</p>{/if}
    {#if !loading && !listed.length && !pending}<div class="picker-empty">
        <strong>No models found here</strong>
        <p>
          Try another search, refresh, or use Browse all. Your current selections are kept above.
        </p>
      </div>{/if}
    <div class="picker-results" aria-busy={loading || pending !== null}>
      {#each listed.slice(0, limit) as model (model.id)}
        {@const added = selected.includes(model.id)}
        <div class="picker-result">
          <div>
            <strong>{name(model)}</strong><small
              >{model.id}{model.id.startsWith('~') ? ' · tracks provider updates' : ''}</small
            ><small>{isFreeModel(model) ? 'Free · ' : ''}{price(model)}</small
            >{#if view === 'suggested'}<small
                >{model.id === recommendations.models[0]
                  ? 'Current starter model'
                  : 'Maintained alternative · compare price and developer'}</small
              >{/if}
          </div>
          <div class="picker-result-actions">
            {#if !added || selected.length > 1}<button
                type="button"
                class="secondary small"
                aria-label={`Use only ${name(model)}`}
                onclick={() => onmodels([model.id])}>{multiple ? 'Use only' : 'Use'}</button
              >{/if}
            {#if multiple}<button
                type="button"
                class="secondary small"
                class:is-added={added}
                aria-pressed={added}
                aria-label={`${added ? 'Remove' : 'Add'} ${name(model)}`}
                disabled={added ? selected.length <= 1 : selected.length >= max}
                onclick={() =>
                  onmodels(
                    added ? selected.filter((id) => id !== model.id) : [...selected, model.id]
                  )}
                >{#if added}<Check size={15} /> Selected{:else}<Plus size={15} /> Add{/if}</button
              >
            {:else if added}<span class="small"
                ><Check size={15} aria-hidden="true" /> Selected</span
              >{/if}
          </div>
        </div>
      {/each}
    </div>
    {#if listed.length > limit}<button
        class="secondary picker-show-more"
        type="button"
        onclick={() => (limit += 20)}>Show more models ({listed.length - limit} remaining)</button
      >{/if}
  </div>
</div>
