# @auggieteo/dsh-synthetic-web-search

A [Synthetic Search](https://dev.synthetic.new/docs/synthetic/search)-backed `WebSearchProvider` and Settings card for the DeepSeek Harness `ctx.web` capability seam.

This is a **host-plane** plugin: it registers the `synthetic` provider into the Harness-owned `web` service. It does not provide `ctx.web` or a model-facing tool. Use it with the existing `@deepseek-ai/dsh-tool-web` row.

## Requirements

- DeepSeek Harness with the `web` profile.
- Node.js 22.12 or newer.
- A [Synthetic API key](https://dev.synthetic.new/docs/synthetic/search).

## Install

Install the package as a dependency of the profile that hosts `web` (normally `web`). Choose one route.

### npm registry

```bash
dsh plugin --profile web add @auggieteo/dsh-synthetic-web-search
```

### Public Git URL

After the public repository exists, install directly from Git:

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

Add this top-level `insert` block to `$DSH_HOME/profiles/web/cordis.patch.yml` (create the file with this YAML array if it does not exist):

```yaml
- insert:
    - id: web-search-synthetic
      name: '@auggieteo/dsh-synthetic-web-search'
      config:
        # Settings stores the key using this DSH credential reference.
        apiKeyEnv: SYNTHETIC_API_KEY
        # Optional; defaults to https://api.synthetic.new.
        # baseURL: https://api.synthetic.new
```

The row belongs in the **web host profile**, not an agent preset: `ctx.web` is process-wide and each provider must register once. The same example is in [`examples/synthetic.cordis.yml`](examples/synthetic.cordis.yml).

Restart the DSH web profile after changing its composition. Do not start a separate Vite server; it does not update an existing DSH GUI.

## Configure credentials and provider selection

Open **Settings → Plugins → Plugin configuration → Synthetic web search**, enter the API key, and select **Save**. DSH stores it in its credentials domain and does not return it to the browser after saving.

For headless use, the plugin also reads the launch environment reference (by default `SYNTHETIC_API_KEY`):

```bash
export SYNTHETIC_API_KEY='…'
```

When another usable search provider is installed, explicitly select Synthetic before launching DSH:

```bash
export DSH_WEB_SEARCH_PROVIDER=synthetic
dsh web
```

Provider selection is intentionally unambiguous. The existing `@deepseek-ai/dsh-tool-web` agent-preset row exposes `web_search` to the model.

### Configuration

| Key | Default | Meaning |
| --- | --- | --- |
| `apiKey` | (unset) | Literal API key for non-interactive composition. Prefer the Settings card or environment reference; this secret is redacted from Settings responses. |
| `apiKeyEnv` | `SYNTHETIC_API_KEY` | Credential reference used by the Settings card and launch environment. |
| `baseURL` | `https://api.synthetic.new` | Synthetic API origin; the provider appends `/v2/search`. |

## Uninstall

1. Remove the `web-search-synthetic` row from `$DSH_HOME/profiles/web/cordis.patch.yml`.
2. Remove the dependency:

   ```bash
   dsh plugin --profile web remove @auggieteo/dsh-synthetic-web-search
   ```

3. Restart the DSH web profile.
4. If no other configuration uses it, remove `SYNTHETIC_API_KEY` from the process environment and remove the stored credential through your normal DSH credentials management.

## Compatibility

The public package name is `@auggieteo/dsh-synthetic-web-search`, replacing the former local `@deepseek-ai/dsh-web-search-synthetic` reference. Only the package reference changes. The Cordis row id (`web-search-synthetic`), Settings namespace (`web-search-synthetic`), and default credential reference (`SYNTHETIC_API_KEY`) remain unchanged, so existing persisted plugin settings and credentials continue to apply after the row is updated.

## Development and verification

```bash
npm ci
npm run verify
```

`npm run verify` cleans generated output, type-checks, runs mocked provider tests, builds `lib/` from source (including the browser client bundle), and checks the npm package contents with `npm pack --dry-run`.

To test a local checkout without touching another profile, point a throwaway profile at its absolute path:

```bash
dsh plugin --profile synthetic-smoke add /absolute/path/to/dsh-synthetic-web-search
```

## Behavior

The provider sends the documented request:

```http
POST https://api.synthetic.new/v2/search
Authorization: Bearer $SYNTHETIC_API_KEY
Content-Type: application/json

{ "query": "…" }
```

It maps valid results into the Harness source vocabulary:

| Synthetic field | Harness field |
| --- | --- |
| `url` | `url` |
| `title` | `title` |
| `text` | `snippet` |
| `published` | `publishedAt` |

Malformed or non-URL entries are ignored. The provider does not create a generated answer (`content`) and returns `truncated: false`; the `ctx.web` seam applies the caller's `maxResults` cap. Network, redirect, HTTP, and response-shape failures surface as `WEB_PROVIDER_ERROR`; aborted requests surface as `WEB_ABORTED`.

Synthetic's documented API currently exposes only `query`, so `maxResults` is intentionally not sent upstream.
