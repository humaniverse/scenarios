<script lang="ts">
  import { Download, Upload, BookOpen, X } from '@lucide/svelte';
  import { stages, type Project, type Change } from '$lib/domain/project';
  import {
    aiModelStages,
    resolveModelConfiguration,
    type ModelConfiguration
  } from '$lib/domain/model-settings';
  import {
    MAX_CONFIGURATION_BYTES,
    parseConfiguration,
    exportConfiguration,
    configurationForTarget,
    applyPortableConfiguration,
    type PortableConfiguration
  } from '$lib/domain/model-configurations';
  import { configurationLibrary } from '$lib/domain/configuration-library';
  import { configurationIssues, configurationSummary } from '$lib/ai/model-configuration';
  import { type Model, type RankingLoader } from '$lib/ai/models';
  import { download } from '$lib/export/files';
  import ModelPicker from './ModelPicker.svelte';
  let {
    p,
    commit,
    catalogue,
    loaded,
    loading,
    status,
    refresh,
    loadRanking,
    scope = 'default',
    targets = []
  }: {
    p: Project;
    commit: Change;
    catalogue: Model[];
    loaded: boolean;
    loading: boolean;
    status: string;
    refresh: () => void;
    loadRanking?: RankingLoader;
    scope?: string;
    targets?: string[];
  } = $props();
  let showLibrary = $state(false);
  let preview = $state<PortableConfiguration | null>(null);
  let chosen = $state<string[]>([]);
  let writer = $state('');
  let error = $state('');
  let editScope = $state<string | null>(null);
  const label = (key: string) =>
    key === 'default' ? 'Whole-analysis defaults' : stages[Number(key)];
  const possible = $derived(
    preview?.kind === 'stage-setup'
      ? ['default', ...Object.keys(preview.stages)]
      : ['default', ...aiModelStages.map(String)]
  );
  const needsWriter = $derived(
    preview?.kind === 'panel' &&
      preview.configuration.mode === 'individual' &&
      preview.configuration.models.length > 1 &&
      chosen.includes('6')
  );
  const issues = $derived.by(() => {
    if (!preview) return [];
    const list: string[] = [];
    // Resolve a candidate exercise to catch inheritance and writing consequences as well as explicit targets.
    try {
      const candidate = JSON.parse(JSON.stringify(p)) as Project;
      applyPortableConfiguration(candidate, preview, chosen, writer || undefined);
      for (const stage of aiModelStages) {
        const key = String(stage);
        if (!chosen.includes(key) && !chosen.includes('default')) continue;
        for (const issue of configurationIssues(
          resolveModelConfiguration(candidate, key),
          catalogue,
          stage !== 6
        ))
          list.push(`${label(key)}: ${issue}`);
      }
      if (chosen.includes('default'))
        for (const issue of configurationIssues(
          resolveModelConfiguration(candidate),
          catalogue,
          true
        ))
          list.push(`Defaults: ${issue}`);
    } catch (e) {
      list.push(e instanceof Error ? e.message : 'Invalid configuration.');
    }
    return [...new Set(list)];
  });
  const previewConfig = $derived(
    preview && editScope ? configurationForTarget(preview, editScope) : undefined
  );
  const inheritedChanges = $derived.by(() => {
    if (!preview || !chosen.includes('default')) return [];
    try {
      const candidate = JSON.parse(JSON.stringify(p)) as Project;
      applyPortableConfiguration(candidate, preview, chosen, writer || undefined);
      return aiModelStages
        .map(String)
        .filter((scope) => !chosen.includes(scope))
        .flatMap((scope) => {
          const before = resolveModelConfiguration(p, scope),
            after = resolveModelConfiguration(candidate, scope);
          return JSON.stringify(before) === JSON.stringify(after) ? [] : [{ scope, before, after }];
        });
    } catch {
      return [];
    }
  });
  function open(file: PortableConfiguration) {
    preview = parseConfiguration(JSON.stringify(file));
    chosen =
      file.kind === 'stage-setup'
        ? ['default', ...Object.keys(file.stages)]
        : targets.length
          ? [...targets]
          : [scope === 'bulk' ? 'default' : scope];
    writer = '';
    error = '';
    editScope = null;
  }
  async function importFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > MAX_CONFIGURATION_BYTES)
        throw new Error('Configuration files must be 256 KiB or smaller.');
      open(parseConfiguration(await file.text()));
    } catch (e) {
      error = e instanceof Error ? e.message : 'Could not read configuration.';
    }
    input.value = '';
  }
  function edit(fn: (c: ModelConfiguration) => void) {
    if (!preview || !editScope) return;
    const next = parseConfiguration(JSON.stringify(preview));
    const c = configurationForTarget(next, editScope);
    if (c && c !== 'inherit') {
      fn(c);
      preview = next;
    }
  }
  function apply() {
    if (!preview || !loaded || !chosen.length || issues.length) return;
    const file = parseConfiguration(JSON.stringify(preview));
    const selected = [...chosen];
    commit(
      (p) => applyPortableConfiguration(p, file, selected, writer || undefined),
      `Applied ${file.name} to ${selected.map(label).join(', ')}.`
    );
    preview = null;
  }
  function exportFile(kind: 'panel' | 'stage-setup') {
    try {
      const file = exportConfiguration(p, kind, scope === 'bulk' ? 'default' : scope);
      download(JSON.stringify(file, null, 2), `${kind}.configuration.json`, 'application/json');
    } catch {
      error =
        'This saved selection cannot be exported yet. Check its model identifiers and settings.';
    }
  }
</script>

<section class="model-configurations" aria-label="Reusable model configurations">
  <div class="configuration-toolbar">
    <button
      class="secondary small"
      type="button"
      aria-expanded={showLibrary}
      onclick={() => (showLibrary = !showLibrary)}
      ><BookOpen size={16} /> Browse configurations</button
    >
    <label class="secondary small configuration-upload"
      ><Upload size={16} /> Import JSON<input
        type="file"
        accept=".json,application/json"
        onchange={importFile}
      /></label
    >
    <button class="text-button small" type="button" onclick={() => exportFile('panel')}
      ><Download size={15} /> Export current panel</button
    ><button class="text-button small" type="button" onclick={() => exportFile('stage-setup')}
      ><Download size={15} /> Export stage setup</button
    >
  </div>
  {#if error}<p class="notice review" role="alert">{error}</p>{/if}
  {#if showLibrary}<div class="configuration-library">
      {#each configurationLibrary as file}<article>
          <strong>{file.name}</strong>
          <p class="small muted">{file.description}</p>
          <p class="small muted">
            Revision {file.revision} · reviewed {file.reviewedAt} · {file.kind === 'panel'
              ? 'Panel'
              : 'Stage setup'}
          </p>
          <button class="secondary small" type="button" onclick={() => open(file)}
            >Preview configuration</button
          >
        </article>{/each}
    </div>{/if}
  {#if preview}<section class="configuration-preview" aria-label="Configuration import preview">
      <div class="section-line">
        <h4>Preview: {preview.name}</h4>
        <button
          class="icon-button"
          type="button"
          aria-label="Close configuration preview"
          onclick={() => (preview = null)}><X size={17} /></button
        >
      </div>
      <p>{preview.description}</p>
      <p class="small muted">
        {preview.id} · revision {preview.revision}{preview.reviewedAt
          ? ` · reviewed ${preview.reviewedAt}`
          : ''}{preview.author ? ` · ${preview.author}` : ''}
      </p>
      {#if preview.sourceUrl}<p class="small">
          <a href={preview.sourceUrl} target="_blank" rel="noreferrer">Configuration source</a>
        </p>{/if}
      <p class="small">
        Choose exactly what to change. Updating defaults also changes any fields still inherited by
        other stages. Analytical content and spending are preserved.
      </p>
      <div class="configuration-preview-targets">
        {#each possible as target}{@const c = configurationForTarget(preview, target)}
          <div>
            <label
              ><input
                type="checkbox"
                checked={chosen.includes(target)}
                onchange={(e) =>
                  (chosen = e.currentTarget.checked
                    ? [...chosen, target]
                    : chosen.filter((v) => v !== target))}
              />{label(target)}</label
            >
            <p class="small">
              <span class="muted">Now:</span>
              {configurationSummary(resolveModelConfiguration(p, target))}<br /><span class="muted"
                >After:</span
              >
              {c === 'inherit'
                ? 'Follow the resulting whole-analysis defaults'
                : c
                  ? configurationSummary(c)
                  : 'Keep current settings'}
            </p>
            {#if target === 'default' && c && c !== 'inherit'}<p class="small">
                Default writer: {p.writer} → {c.writer}
              </p>{/if}
            {#if c && c !== 'inherit'}<button
                type="button"
                class="text-button small"
                onclick={() => (editScope = editScope === target ? null : target)}
                >Edit or repair this selection</button
              >{/if}
          </div>{/each}
      </div>
      {#if inheritedChanges.length}<h4>Also affected through defaults</h4>
        {#each inheritedChanges as item}<p class="small">
            <strong>{label(item.scope)}</strong><br />Now: {configurationSummary(item.before)}<br
            />After: {configurationSummary(item.after)}
          </p>{/each}{/if}
      {#if needsWriter && preview.kind === 'panel'}<label
          >Writing model for this panel<select bind:value={writer}
            ><option value="">Choose one writing model…</option
            >{#each preview.configuration.models as id}<option value={id}>{id}</option
              >{/each}</select
          ></label
        >{/if}
      {#if previewConfig && previewConfig !== 'inherit'}<div class="configuration-repair">
          <h4>Edit imported settings · {editScope ? label(editScope) : ''}</h4>
          <ModelPicker
            {catalogue}
            selected={previewConfig.models}
            mode={previewConfig.mode}
            efforts={previewConfig.efforts}
            fusion={previewConfig.fusion}
            multiple={preview.kind === 'panel' || editScope !== '6'}
            {loading}
            {loaded}
            {status}
            {refresh}
            {loadRanking}
            onmodels={(ids) =>
              edit((c) => {
                c.models = ids;
                if (editScope === '6' || !ids.includes(c.writer)) c.writer = ids[0];
              })}
            onmode={(mode) => edit((c) => (c.mode = mode))}
            oneffort={(id, effort) => edit((c) => (c.efforts[id] = effort))}
            onfusion={(fusion) => edit((c) => (c.fusion = fusion))}
          />
          <label
            >Default writer<select
              value={previewConfig.writer}
              onchange={(e) => edit((c) => (c.writer = e.currentTarget.value))}
              ><option value={previewConfig.writer}>{previewConfig.writer}</option
              >{#each catalogue.filter((m) => !m.id.startsWith('openrouter/fusion') && m.id !== previewConfig.writer) as model}<option
                  value={model.id}>{model.name}</option
                >{/each}</select
            ></label
          >
        </div>{/if}
      {#if !loaded}<p class="notice review">
          Connect and refresh the catalogue to validate this import before applying it. Preview and
          export remain available.
        </p>{/if}
      {#if issues.length}<div class="notice review" role="status">
          <strong>Resolve these issues or deselect the affected stages</strong>
          <ul>
            {#each issues as issue}<li>{issue}</li>{/each}
          </ul>
        </div>{/if}
      <div class="dialog-actions">
        <button class="secondary" type="button" onclick={() => (preview = null)}
          >Cancel import</button
        ><button
          class="primary"
          type="button"
          disabled={!loaded || loading || !chosen.length || issues.length > 0}
          onclick={apply}>Apply to selected targets</button
        >
      </div>
    </section>{/if}
</section>
