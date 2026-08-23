# @deepseek-ai/dsh-web-search-synthetic

A [Synthetic Search](https://dev.synthetic.new/docs/synthetic/search)-backed `WebSearchProvider` for the DeepSeek Harness `ctx.web` capability seam.

This is a **host-plane implementation plugin**: it registers the `synthetic` provider into the Harness-owned `web` service. It does not provide `ctx.web` itself and does not add a model-facing tool; use it with the existing `@deepseek-ai/dsh-tool-web` row.

## Install

Install the package in the profile that hosts `web` (normally the `web` profile):

```bash
dsh plugin --profile web add @deepseek-ai/dsh-web-search-synthetic
```

Add the host-plane row from [`examples/synthetic.cordis.yml`](examples/synthetic.cordis.yml) to that profile's composition or supply it as a `--patch`. Do **not** add it to an agent preset: `ctx.web` is process-wide and provider registration must happen once on the host plane.

Select Synthetic and start DSH with the patch (or restart after adding the row permanently):

```bash
export DSH_WEB_SEARCH_PROVIDER=synthetic

dsh web --patch /absolute/path/to/dsh-synthetic-web-search/examples/synthetic.cordis.yml
```

Then open **Settings > Plugins > Plugin configuration > Synthetic web search**. Enter the API key and select **Save**. The key is stored through DSH's credentials domain and never returns to the browser after saving.

`SYNTHETIC_API_KEY` remains a launch-environment fallback for headless use. `DSH_WEB_SEARCH_PROVIDER=synthetic` is required whenever another usable search provider is installed; the web seam deliberately rejects ambiguous provider selection. The existing `tool-web` agent-preset row then exposes `web_search` to the model.

### Local development

From this package directory:

```bash
npm install
npm run verify
dsh plugin --profile web add /absolute/path/to/dsh-synthetic-web-search
```

Restart the existing DSH web profile after changing its host composition. Starting another Vite server does not update an already-running DSH GUI.

## Configuration

| Key | Default | Meaning |
| --- | --- | --- |
| `apiKey` | (unset) | Literal API key for non-interactive composition. This secret is redacted from Settings responses. |
| `apiKeyEnv` | `SYNTHETIC_API_KEY` | Credential reference used by the Settings card and the launch environment. |
| `baseURL` | `https://api.synthetic.new` | Synthetic API origin. The provider appends `/v2/search`. |

```yaml
- id: web-search-synthetic
  name: '@deepseek-ai/dsh-web-search-synthetic'
  config:
    # Settings stores a key under this credential reference by default.
    apiKeyEnv: SYNTHETIC_API_KEY
    baseURL: https://api.synthetic.new
```

## Behavior

The provider sends the documented request:

```http
POST https://api.synthetic.new/v2/search
Authorization: Bearer $SYNTHETIC_API_KEY
Content-Type: application/json

{ "query": "…" }
```

It maps each valid result into the Harness source vocabulary:

| Synthetic field | Harness field |
| --- | --- |
| `url` | `url` |
| `title` | `title` |
| `text` | `snippet` |
| `published` | `publishedAt` |

Malformed or non-URL entries are ignored. The provider does not invent a generated answer (`content`) and returns `truncated: false`; the `ctx.web` seam applies the caller's `maxResults` cap. Network, redirect, HTTP, and response-shape failures surface as `WEB_PROVIDER_ERROR`; aborted requests surface as `WEB_ABORTED`.

Synthetic's documented API currently exposes only `query`, so `maxResults` is intentionally not sent upstream. This avoids relying on undocumented controls while retaining Harness-side result limiting.

## Verification

`npm run verify` performs type checking, mocked provider tests, builds the publishable `lib/` files, and validates the package contents with `npm pack --dry-run`.

API details are based on the [Synthetic Search documentation](https://dev.synthetic.new/docs/synthetic/search).
