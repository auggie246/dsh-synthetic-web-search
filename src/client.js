const CLIENT_PACKAGE_IDS = [
  '@auggieteo/dsh-synthetic-web-search',
  '@deepseek-ai/dsh-web-search-synthetic',
]

for (const id of CLIENT_PACKAGE_IDS) {
  window.__ModuleLoader__.load({
    id,
    factory: createClientPlugin,
  })
}

const SETTINGS_NAMESPACE = 'web-search-synthetic'
const DEFAULT_API_KEY_ENV = 'SYNTHETIC_API_KEY'
const DEFAULT_BASE_URL = 'https://api.synthetic.new'
const STYLE_TAG_ID = 'synthetic-web-search-card'

/**
 * Card styles owned by this plugin. The upstream Settings Plugins surfaces
 * hash their CSS-module class names from file contents, and 0.1.2-rc.1
 * restyles those files, so the previously mirrored hashed names no longer
 * match. Shipping our own stylesheet keeps the card styled on both harness
 * versions. `--dsw-alias-label-error` is referenced with a fallback because
 * no shipped theme declares it; `--dsw-static-red-400` matches the palette.
 */
const CARD_CSS = [
  '.synws-card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;list-style:none;transition:border-color .16s,background .16s}',
  '.synws-card:hover{border-color:var(--dsw-alias-label-dimmed)}',
  '.synws-cardOpen{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}',
  '.synws-header{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:transparent;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}',
  '.synws-header:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
  '.synws-headText{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}',
  '.synws-name{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}',
  '.synws-description{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}',
  '.synws-chevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}',
  '.synws-chevronOpen{transform:rotate(180deg)}',
  '.synws-body{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding-bottom:8px}',
  '.synws-footer{border-top:1px solid var(--dsw-alias-border-l2);justify-content:flex-end;align-items:center;gap:8px;padding:12px 0 4px;display:flex}',
  '.synws-failed{min-width:0;color:var(--dsw-alias-label-error,var(--dsw-static-red-400,rgb(242,90,90)));flex:1;margin:0;font-size:12px;line-height:1.5}',
  '.synws-discard,.synws-save{appearance:none;font:inherit;cursor:pointer;border:1px solid transparent;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5}',
  '.synws-discard{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:transparent}',
  '.synws-discard:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed)}',
  '.synws-save{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}',
  '.synws-discard:disabled,.synws-save:disabled{opacity:.4;cursor:default}',
  '.synws-discard:focus-visible,.synws-save:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
  '.synws-field{flex-direction:column;gap:6px;padding:12px 0;display:flex}',
  '.synws-field+.synws-field{border-top:1px solid var(--dsw-alias-border-l2)}',
  '.synws-head{align-items:center;gap:8px;display:flex}',
  '.synws-label{min-width:0;color:var(--dsw-alias-label-primary);flex:1;font-size:13px;font-weight:500;line-height:1.5}',
  '.synws-badge{white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}',
  '.synws-badgeMuted{white-space:nowrap;color:var(--dsw-alias-label-tertiary);border-radius:999px;padding:1px 8px;font-size:11px;line-height:17px}',
  '.synws-input{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);height:34px;font:inherit;color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 12px;font-size:13px;line-height:1.5}',
  '.synws-input:focus-visible{border-color:var(--dsw-alias-brand-primary);outline:none}',
  '.synws-input:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}',
  '.synws-hint{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:1.5}',
].join('\n')

function createClientPlugin(require) {
    const module = { exports: {} }
    const exports = module.exports
    const React = require('react')
    const inject = ['slots', 'settingsScope', 'connection']

    /** Inject the card stylesheet once; the module system claims factory-injected tags. */
    function injectCardStyle() {
      if (typeof document === 'undefined' || document.head === null) return
      if (document.querySelector('style[data-plugin-style="' + STYLE_TAG_ID + '"]') !== null) return
      const tag = document.createElement('style')
      tag.dataset.pluginStyle = STYLE_TAG_ID
      tag.textContent = CARD_CSS
      document.head.appendChild(tag)
    }

    /**
     * Resolve the credentials wire face of the running harness. 0.1.2-rc.1
     * moved the typed API client from `ctx.connection.api` to the `ctx.remote`
     * service: positional arguments and an `{ ok, value }` envelope. The
     * 0.1.1-rc.2 face keeps `ctx.connection.api` with `{ refs }` payloads, an
     * `{ result }` envelope, and the views nested under `credentials`. Each
     * call re-resolves, so service arrival order never matters.
     */
    function credentialsWire(ctx) {
      const remote = typeof ctx.get === 'function' ? ctx.get('remote') : undefined
      if (remote && remote.credentials) {
        return {
          kind: 'remote',
          async describe(reference) {
            const response = await remote.credentials.describe([reference])
            if (!response || response.ok !== true) return undefined
            return response.value ? response.value[reference] : undefined
          },
          async set(reference, value) {
            const response = await remote.credentials.set(reference, value)
            if (response && response.ok === false) throw new Error('credentials.set rejected')
          },
        }
      }

      const connection = ctx.connection
      const api = connection && connection.api ? connection.api : undefined
      if (api && api.credentials) {
        return {
          kind: 'connection-api',
          async describe(reference) {
            const response = await api.credentials.describe({ refs: [reference] })
            const result = response && response.result ? response.result : undefined
            if (!result || result.ok !== true) return undefined
            const value = result.value
            return value && value.credentials ? value.credentials[reference] : undefined
          },
          async set(reference, value) {
            const response = await api.credentials.set({ ref: reference, value })
            const result = response && response.result ? response.result : undefined
            if (result && result.ok === false) throw new Error('credentials.set rejected')
          },
        }
      }

      return undefined
    }

    function useScope(scope) {
      const [snapshot, setSnapshot] = React.useState(() => scope.getSnapshot())
      React.useEffect(() => scope.subscribe(() => setSnapshot(scope.getSnapshot())), [scope])
      return snapshot
    }

    function createCard(ctx, scope) {
      return function SyntheticSettingsCard() {
        const snapshot = useScope(scope)
        const configured = snapshot.value || {}
        const reference = configured.apiKeyEnv || DEFAULT_API_KEY_ENV
        const [apiKey, setApiKey] = React.useState('')
        const [baseURL, setBaseURL] = React.useState('')
        const [credentialState, setCredentialState] = React.useState({ configured: false, writable: true })
        const [status, setStatus] = React.useState('')
        const [saving, setSaving] = React.useState(false)
        const [open, setOpen] = React.useState(false)

        React.useEffect(() => {
          setBaseURL(configured.baseURL || '')
        }, [configured.baseURL])

        React.useEffect(() => {
          let active = true
          const wire = credentialsWire(ctx)
          if (wire === undefined) return
          wire.describe(reference).then((credential) => {
            if (!active || credential === undefined) return
            setCredentialState({
              configured: credential.configured === true,
              writable: credential.writable !== false,
            })
          }).catch(() => {})
          return () => { active = false }
        }, [reference])

        if (snapshot.status === 'unavailable') return null
        if (snapshot.status === 'loading') return React.createElement('p', null, 'Loading Synthetic search settings…')

        const save = async () => {
          setSaving(true)
          setStatus('')
          try {
            const nextBaseURL = baseURL.trim()
            if (nextBaseURL.length === 0) await scope.unset('baseURL')
            else await scope.set('baseURL', nextBaseURL)

            if (apiKey.trim().length > 0) {
              const wire = credentialsWire(ctx)
              if (wire === undefined) throw new Error('no credentials wire face')
              await wire.set(reference, apiKey.trim())
              setApiKey('')
              setCredentialState((current) => ({ ...current, configured: true }))
            }
            setStatus('Saved.')
          } catch {
            setStatus('Could not save the Synthetic configuration. Check the URL and credential permissions.')
          } finally {
            setSaving(false)
          }
        }

        const baseValue = configured.baseURL || ''
        const dirty = apiKey.trim().length > 0 || baseURL !== baseValue
        const discard = () => {
          setApiKey('')
          setBaseURL(baseValue)
          setStatus('')
        }
        const body = open ? React.createElement('div', { className: 'synws_body' },
          React.createElement('label', { className: 'synws_field' },
            React.createElement('span', { className: 'synws_head' },
              React.createElement('span', { className: 'synws_label' }, 'API key'),
              React.createElement('span', { className: credentialState.configured ? 'synws_badge' : 'synws_badgeMuted' }, credentialState.configured ? 'Configured' : 'Not configured'),
            ),
            React.createElement('input', {
              className: 'synws_input',
              type: 'password',
              value: apiKey,
              disabled: saving || !credentialState.writable,
              placeholder: credentialState.configured ? 'Enter a replacement key' : 'Enter a Synthetic API key',
              onChange: (event) => setApiKey(event.target.value),
            }),
            React.createElement('p', { className: 'synws_hint' }, credentialState.configured ? 'A key is stored in DSH credentials.' : `No key is configured for ${reference}.`),
          ),
          React.createElement('label', { className: 'synws_field' },
            React.createElement('span', { className: 'synws_head' },
              React.createElement('span', { className: 'synws_label' }, 'API base URL'),
            ),
            React.createElement('input', {
              className: 'synws_input',
              type: 'url',
              value: baseURL,
              disabled: saving || !snapshot.writable,
              placeholder: DEFAULT_BASE_URL,
              onChange: (event) => setBaseURL(event.target.value),
            }),
            React.createElement('p', { className: 'synws_hint' }, 'Leave blank to use https://api.synthetic.new.'),
          ),
          React.createElement('div', { className: 'synws_footer' },
            status.length > 0 ? React.createElement('p', { className: 'synws_failed', role: 'status' }, status) : null,
            React.createElement('button', {
              type: 'button',
              className: 'synws_discard',
              onClick: discard,
              disabled: !dirty || saving,
            }, 'Discard'),
            React.createElement('button', {
              type: 'button',
              className: 'synws_save',
              onClick: save,
              disabled: !dirty || saving || !snapshot.writable,
            }, saving ? 'Saving…' : 'Save'),
          ),
        ) : null
        return React.createElement('li', {
          className: open ? 'synws_card synws_cardOpen' : 'synws_card',
        },
        React.createElement('button', {
          type: 'button',
          className: 'synws_header',
          'aria-expanded': open,
          'aria-label': `${open ? 'Collapse' : 'Expand'}: Synthetic web search`,
          onClick: () => setOpen(!open),
        },
        React.createElement('span', { className: 'synws_headText' },
          React.createElement('span', { className: 'synws_name' }, 'Synthetic web search'),
          React.createElement('span', { className: 'synws_description' }, 'The Synthetic search provider.'),
        ),
        React.createElement('span', { className: open ? 'synws_chevron synws_chevronOpen' : 'synws_chevron', 'aria-hidden': true }, '⌄'),
        ),
        body)
      }
    }

    function apply(ctx) {
      injectCardStyle()
      const scope = ctx.settingsScope.bind({ namespace: SETTINGS_NAMESPACE })
      const Card = createCard(ctx, scope)
      ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
        name: 'settings.plugin.item',
        key: SETTINGS_NAMESPACE,
      }, Card))
    }

    exports.inject = inject
    exports.apply = apply
    /** Internal: the version-adaptive credentials face, exported for tests. */
    exports.credentialsWire = credentialsWire
    return module.exports
}
