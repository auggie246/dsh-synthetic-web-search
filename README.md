# @auggieteo/dsh-synthetic-web-search

A [Synthetic Search](https://dev.synthetic.new/docs/synthetic/search)-backed `WebSearchProvider` and Settings card for the DeepSeek Harness `ctx.web` capability seam.

This is a **host-plane** plugin: it registers the `synthetic` provider into the Harness-owned `web` service. It does not provide `ctx.web` or a model-facing tool. Use it with the existing `@deepseek-ai/dsh-tool-web` row.

## Requirements

- DeepSeek Harness 0.1.1-rc.2 or 0.1.2-rc.1 with the `web` profile.
- Node.js 22.12 or newer.
- A [Synthetic API key](https://dev.synthetic.new/docs/synthetic/search).

## Install

Install the package as a profile layer in the profile that hosts `web` (normally `web`). The layer activates the provider row automatically. Choose one route.

### npm registry

```bash
dsh plugin --profile web add @auggieteo/dsh-synthetic-web-search
```

### Public Git URL

Install directly from the public Git repository:

```bash
dsh plugin --profile web add git+https://github.com/auggie246/dsh-synthetic-web-search.git
```

#### pnpm `prepare` allowlist for Git installs

A Git install builds this package from source with its `prepare` script. DSH forwards the install to pnpm, and pnpm may block that script. If it does, the command prints the package/build key that pnpm requires. Copy that **exact printed key** into `$DSH_HOME/profiles/web/pnpm-workspace.yaml`, for example:

```yaml
allowBuilds:
  # Replace this with the exact key pnpm printed for this install.
  <exact-key-printed-by-pnpm>: true
```

Then rerun the same `dsh plugin --profile web add git+https://…` command. Do not guess or substitute a package name: pnpm requires the exact key it printed.

### Activate the provider

The install command adds this package to `dsh.profile.bundles`. Its bundled `cordis.patch.yml` inserts the `synthetic-web-search` row **and selects `synthetic` as the `web` search provider**, replacing DSH's shipped `deepseek-official` selection. No `DSH_WEB_SEARCH_PROVIDER` environment variable is needed.

The row belongs in the **web host profile**, not an agent preset: `ctx.web` is process-wide and each provider must register once. [`examples/synthetic.cordis.yml`](examples/synthetic.cordis.yml) shows the provider row; add the following selection override when mounting it manually:

```yaml
- id: web
  config:
    searchProvider: synthetic
```

Restart the DSH web profile after installation. Do not start a separate Vite server; it does not update an existing DSH GUI.

## Configure credentials

Open **Settings → Plugins → Plugin configuration → Synthetic web search**, enter the API key, and select **Save**. DSH stores it in its credentials domain and does not return it to the browser after saving.

For headless use, the plugin also reads the launch environment reference (by default `SYNTHETIC_API_KEY`):

```bash
export SYNTHETIC_API_KEY='…'
```

Provider selection is intentionally unambiguous: installation pins `web.config.searchProvider` to `synthetic`. To use another provider later, apply a higher-precedence profile or `--patch` override with that provider's id. The existing `@deepseek-ai/dsh-tool-web` agent-preset row exposes `web_search` to the model.

### Configuration

| Key | Default | Meaning |
| --- | --- | --- |
| `apiKey` | (unset) | Literal API key for non-interactive composition. Prefer the Settings card or environment reference; this secret is redacted from Settings responses. |
| `apiKeyEnv` | `SYNTHETIC_API_KEY` | Credential reference used by the Settings card and launch environment. |
| `baseURL` | `https://api.synthetic.new` | Synthetic API origin; the provider appends `/v2/search`. |

## Uninstall

1. Remove the profile layer:

   ```bash
   dsh plugin --profile web remove @auggieteo/dsh-synthetic-web-search
   ```

2. Restart the DSH web profile.
3. If no other configuration uses it, remove `SYNTHETIC_API_KEY` from the process environment and remove the stored credential through your normal DSH credentials management.

## Compatibility

0.2.5 supports DeepSeek Harness **0.1.1-rc.2 and 0.1.2-rc.1** with runtime detection — one build, no per-version install. The plugin reads the settings seam's module shape at load time, so the same `lib/` activates on either version:

- **Settings section.** 0.1.1-rc.2 wires optional settings through the free `installSettingsSection`/`settingsNamespace` pair; 0.1.2-rc.1 moved that wiring to the `SettingsProvider.installSection` method and validates the namespace as a plain string. The plugin imports the module by namespace and calls whichever shape it finds; both paths share identical semantics (composition entry as base layer and fallback).
- **Settings card wire face.** 0.1.2-rc.1 moved the typed API client from `ctx.connection.api` to the `ctx.remote` service (positional arguments, `{ ok, value }` envelope). The card resolves the credentials face per call: `ctx.remote.credentials` first, then the legacy `ctx.connection.api` face with its `{ refs }` payloads and `{ result }` envelope.
- **Card styles.** The upstream Settings Plugins cards hash their CSS-module class names from file contents, and 0.1.2-rc.1 restyles those files. The card therefore ships its own stylesheet (`synws-*` classes) instead of mirroring upstream hashed names, so it stays styled on both versions and follows its own release cadence.

Everything else the plugin touches — the `ctx.web` seam and `registerSearchProvider`, `WebError` codes, `credentialRef`/credential resolution, the launch environment reference, invariants, schemastery `role()`s, the `dsh.bundle.patch` profile-layer mechanism with its `- insert:` op, the `dsh.client` manifest block, `window.__ModuleLoader__`, the `settingsScope` bind/snapshot contract, the `settings.plugin.item` slot — is unchanged between the two versions and needs no adaptation.

The public package name is `@auggieteo/dsh-synthetic-web-search`, replacing the former local `@deepseek-ai/dsh-web-search-synthetic` reference. The browser client registers both package ids, so legacy profile rows continue to load during migration. The bundle row id (`synthetic-web-search`) matches the id existing manual profile rows already use, so the plugin mounts once. The Settings namespace (`web-search-synthetic`) and default credential reference (`SYNTHETIC_API_KEY`) remain unchanged, so existing persisted plugin settings and credentials continue to apply after the row is updated.

0.2.1 shipped a bundle row with id `web-search-synthetic`. If you installed 0.2.1 as a bundle and kept a manual `- insert:` block, the plugin mounted twice. Upgrade to 0.2.2 or newer, which aligns the bundle row id with the manual row id, then keep only one mount.

## Development and verification

```bash
npm ci
npm run verify
```

`npm run verify` cleans generated output, type-checks, runs mocked provider tests, builds `lib/` from source (including the browser client bundle), and checks the npm package contents with `npm pack --dry-run`.

Releases are automated. Publish a GitHub release tagged `v<version>`, where `<version>` matches `package.json`. The publish workflow installs with `npm ci`, checks the tag, tests, builds, and publishes to npm. A prerelease publishes under the npm dist-tag `next`. A stable release publishes under `latest`.

To test a local checkout without touching another profile, point a throwaway profile at its absolute path:

```bash
dsh plugin --profile synthetic-smoke add /absolute/path/to/dsh-synthetic-web-search
```

## Behavior

The provider sends the documented request:

```http
POST https://api.synthetic.new/v2/search
Authorization: Bearer $SYNTHETIC_API_KEY
Accept: application/json
Content-Type: application/json
User-Agent: deepseek-harness-synthetic/0.1.0

{ "query": "…" }
```

It maps valid results into the Harness source vocabulary:

| Synthetic field | Harness field |
| --- | --- |
| `url` | `url` |
| `title` | `title` |
| `text` | `snippet` |
| `published` | `publishedAt` |

Malformed or non-URL entries are ignored. The provider does not create a generated answer (`content`) and returns `truncated: false`; the `ctx.web` seam applies the caller's `maxResults` cap. Network, redirect, HTTP, and response-shape failures surface as `WEB_PROVIDER_ERROR`; a missing API key surfaces as `WEB_PROVIDER_CREDENTIAL_MISSING`; aborted requests surface as `WEB_ABORTED`.

Synthetic's documented API currently exposes only `query`, so `maxResults` is intentionally not sent upstream.
