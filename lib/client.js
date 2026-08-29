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

function createClientPlugin(require) {
    const module = { exports: {} }
    const exports = module.exports
    const React = require('react')

    const SETTINGS_NAMESPACE = 'web-search-synthetic'
    const DEFAULT_API_KEY_ENV = 'SYNTHETIC_API_KEY'
    const DEFAULT_BASE_URL = 'https://api.synthetic.new'
    const inject = ['slots', 'settingsScope', 'connection']

    function useScope(scope) {
      const [snapshot, setSnapshot] = React.useState(() => scope.getSnapshot())
      React.useEffect(() => scope.subscribe(() => setSnapshot(scope.getSnapshot())), [scope])
      return snapshot
    }

    function createCard(scope, api) {
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
          api.credentials.describe({ refs: [reference] }).then((response) => {
            if (!active || !response.result.ok) return
            const credential = response.result.value.credentials[reference]
            setCredentialState({
              configured: credential?.configured === true,
              writable: credential?.writable !== false,
            })
          }).catch(() => {})
          return () => { active = false }
        }, [api, reference])

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
              await api.credentials.set({ ref: reference, value: apiKey.trim() })
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
        const body = open ? React.createElement('div', { className: 'YyYd_a_body' },
          React.createElement('label', { className: 'At1oFq_field' },
            React.createElement('span', { className: 'At1oFq_head' },
              React.createElement('span', { className: 'At1oFq_label' }, 'API key'),
              React.createElement('span', { className: credentialState.configured ? 'At1oFq_badge' : 'At1oFq_badgeMuted' }, credentialState.configured ? 'Configured' : 'Not configured'),
            ),
            React.createElement('input', {
              className: 'At1oFq_input',
              type: 'password',
              value: apiKey,
              disabled: saving || !credentialState.writable,
              placeholder: credentialState.configured ? 'Enter a replacement key' : 'Enter a Synthetic API key',
              onChange: (event) => setApiKey(event.target.value),
            }),
            React.createElement('p', { className: 'At1oFq_hint' }, credentialState.configured ? 'A key is stored in DSH credentials.' : `No key is configured for ${reference}.`),
          ),
          React.createElement('label', { className: 'At1oFq_field' },
            React.createElement('span', { className: 'At1oFq_head' },
              React.createElement('span', { className: 'At1oFq_label' }, 'API base URL'),
            ),
            React.createElement('input', {
              className: 'At1oFq_input',
              type: 'url',
              value: baseURL,
              disabled: saving || !snapshot.writable,
              placeholder: DEFAULT_BASE_URL,
              onChange: (event) => setBaseURL(event.target.value),
            }),
            React.createElement('p', { className: 'At1oFq_hint' }, 'Leave blank to use https://api.synthetic.new.'),
          ),
          React.createElement('div', { className: 'YyYd_a_footer' },
            status.length > 0 ? React.createElement('p', { className: 'YyYd_a_failed', role: 'status' }, status) : null,
            React.createElement('button', {
              type: 'button',
              className: 'YyYd_a_discard',
              onClick: discard,
              disabled: !dirty || saving,
            }, 'Discard'),
            React.createElement('button', {
              type: 'button',
              className: 'YyYd_a_save',
              onClick: save,
              disabled: !dirty || saving || !snapshot.writable,
            }, saving ? 'Saving…' : 'Save'),
          ),
        ) : null
        return React.createElement('li', {
          className: open ? 'YyYd_a_card YyYd_a_cardOpen' : 'YyYd_a_card',
        },
        React.createElement('button', {
          type: 'button',
          className: 'YyYd_a_header',
          'aria-expanded': open,
          'aria-label': `${open ? 'Collapse' : 'Expand'}: Synthetic web search`,
          onClick: () => setOpen(!open),
        },
        React.createElement('span', { className: 'YyYd_a_headText' },
          React.createElement('span', { className: 'YyYd_a_name' }, 'Synthetic web search'),
          React.createElement('span', { className: 'YyYd_a_description' }, 'The Synthetic search provider.'),
        ),
        React.createElement('span', { className: open ? 'YyYd_a_chevron YyYd_a_chevronOpen' : 'YyYd_a_chevron', 'aria-hidden': true }, '⌄'),
        ),
        body)
      }
    }

    function apply(ctx) {
      const scope = ctx.settingsScope.bind({ namespace: SETTINGS_NAMESPACE })
      const api = ctx.connection.api
      const Card = createCard(scope, api)
      ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
        name: 'settings.plugin.item',
        key: SETTINGS_NAMESPACE,
      }, Card))
    }

    exports.inject = inject
    exports.apply = apply
    return module.exports
}
