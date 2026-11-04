import { useEffect, useState } from 'react';

import {
  DEFAULT_LOCAL_SERVER, isLocalServer, normalizeLocalServer,
} from '../../shared/models';
import type {
  Language, LocalModels, ModelEntry, Provider,
} from '../../shared/types';
import { api } from '../api';
import type { T } from '../App';

export function SettingsModal(props: {
  t: T;
  language: Language;
  models: ModelEntry[];
  localServer: string;
  onClose: () => void;
  onSaved: (languageChanged: boolean) => void;
}) {
  const { t } = props;
  const [key, setKey] = useState('');
  const [language, setLanguage] = useState<Language>(props.language);
  const [models, setModels] = useState<ModelEntry[]>(props.models);
  const [newLabel, setNewLabel] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [newProvider, setNewProvider] = useState<Provider>('openrouter');
  const [localServer, setLocalServer] = useState(props.localServer);
  // What the last "find models" got back, until the address changes.
  const [found, setFound] = useState<LocalModels | null>(null);
  const [finding, setFinding] = useState(false);
  const [mcp, setMcp] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.getApiKey().then(setKey);
    // The `mcpServers` shape Claude, LM Studio and most other clients read.
    api.mcpConfig().then((config) => setMcp(JSON.stringify(
      { mcpServers: { strophae: config } }, null, 2)));
  }, []);

  const localOk = isLocalServer(normalizeLocalServer(localServer));
  const isAdded = (id: string) =>
    models.some((m) => m.provider === 'local' && m.slug === id);

  const addModel = () => {
    const label = newLabel.trim();
    const slug = newSlug.trim();
    if (!label || !slug) return;
    setModels((prev) => [
      // Re-adding an existing label updates its model string.
      ...prev.filter((m) => m.label !== label),
      newProvider === 'local'
        ? { label, slug, provider: 'local' }
        : { label, slug },
    ]);
    setNewLabel('');
    setNewSlug('');
  };

  /** A model the local server listed, under its own name — suffixed only
      when an OpenRouter entry already holds that label. */
  const addLocal = (id: string) => {
    if (isAdded(id)) return;
    setModels((prev) => {
      const label = prev.some((m) => m.label === id)
        ? `${id} (${t('provider_local').toLowerCase()})`
        : id;
      return [...prev, { label, slug: id, provider: 'local' }];
    });
  };

  async function findModels() {
    setFinding(true);
    const result = await api.localModels(localServer);
    setFinding(false);
    setFound(result);
    // Show the address as it was understood (/v1 added, slash dropped).
    setLocalServer(result.url);
  }

  async function save() {
    await api.setApiKey(key.trim());
    await api.setModels(models);
    if (normalizeLocalServer(localServer) !== props.localServer) {
      await api.setLocalServer(localServer);
    }
    const languageChanged = language !== props.language;
    if (languageChanged) await api.setLanguage(language);
    props.onSaved(languageChanged);
  }

  return (
    <div className="modal-backdrop" onClick={props.onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t('settings')}</h2>
        <label>{t('api_key_label')}</label>
        <input
          type="password"
          value={key}
          placeholder="sk-or-…"
          onChange={(e) => setKey(e.target.value)}
        />
        <div className="hint">{t('api_key_hint')}</div>
        <label>{t('language')}</label>
        <select value={language}
                onChange={(e) => setLanguage(e.target.value as Language)}>
          <option value="">{t('system_default')}</option>
          <option value="en">English</option>
          <option value="it">Italiano</option>
        </select>
        <label>{t('models_label')}</label>
        <div className="model-list">
          {models.map((m) => (
            <div key={m.label} className="model-row">
              <span className="model-name" title={m.label}>{m.label}</span>
              {m.provider === 'local' && (
                <span className="model-tag">{t('provider_local')}</span>
              )}
              <span className="model-slug" title={m.slug}>{m.slug}</span>
              <button
                className="ghost chip-x"
                title={t('remove_model')}
                disabled={models.length <= 1}
                onClick={() => setModels(
                  (prev) => prev.filter((x) => x.label !== m.label))}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <div className="model-add">
          <select
            className="provider"
            value={newProvider}
            onChange={(e) => setNewProvider(e.target.value as Provider)}
          >
            <option value="openrouter">{t('provider_openrouter')}</option>
            <option value="local">{t('provider_local')}</option>
          </select>
          <input
            type="text"
            value={newLabel}
            placeholder={t('model_label_placeholder')}
            onChange={(e) => setNewLabel(e.target.value)}
          />
          <input
            type="text"
            className="mono"
            value={newSlug}
            placeholder={t(newProvider === 'local'
              ? 'model_local_placeholder' : 'model_slug_placeholder')}
            onChange={(e) => setNewSlug(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addModel();
            }}
          />
          <button
            title={t('add_model')}
            disabled={!newLabel.trim() || !newSlug.trim()}
            onClick={addModel}
          >
            +
          </button>
        </div>
        <div className="hint">{t('models_hint')}</div>
        <label>{t('local_label')}</label>
        <div className="local-row">
          <input
            type="text"
            className="mono"
            value={localServer}
            placeholder={DEFAULT_LOCAL_SERVER}
            onChange={(e) => {
              setLocalServer(e.target.value);
              setFound(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && localOk) findModels();
            }}
          />
          <button disabled={!localOk || finding} onClick={findModels}>
            {t(finding ? 'finding_models' : 'find_models')}
          </button>
        </div>
        {found && !found.ok && (
          <div className="hint problem">
            {t(found.error, { url: found.url })}
          </div>
        )}
        {found?.ok && found.models.length === 0 && (
          <div className="hint problem">{t('local_none')}</div>
        )}
        {found?.ok && found.models.length > 0 && (
          <div className="model-list found-models">
            {found.models.map((id) => (
              <div key={id} className="model-row">
                <span className="model-name" title={id}>{id}</span>
                <button
                  className="ghost chip-x"
                  title={t('add_this_model')}
                  disabled={isAdded(id)}
                  onClick={() => addLocal(id)}
                >
                  {isAdded(id) ? '✓' : '+'}
                </button>
              </div>
            ))}
          </div>
        )}
        <div className={`hint${localOk ? '' : ' problem'}`}>
          {t(localOk ? 'local_hint' : 'local_url_invalid')}
        </div>
        <label>{t('mcp_label')}</label>
        <pre className="mcp-config">{mcp}</pre>
        <div className="mcp-row">
          <div className="hint">{t('mcp_hint')}</div>
          <button
            disabled={!mcp}
            onClick={async () => {
              await navigator.clipboard.writeText(mcp);
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            }}
          >
            {t(copied ? 'copied' : 'copy')}
          </button>
        </div>
        <div className="actions">
          <button onClick={props.onClose}>{t('cancel')}</button>
          <button className="accent" disabled={!localOk} onClick={save}>
            {t('save')}
          </button>
        </div>
      </div>
    </div>
  );
}
