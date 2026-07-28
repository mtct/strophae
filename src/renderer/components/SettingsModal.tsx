import { useEffect, useState } from 'react';

import type { Language, ModelEntry } from '../../shared/types';
import { api } from '../api';
import type { T } from '../App';

export function SettingsModal(props: {
  t: T;
  language: Language;
  models: ModelEntry[];
  onClose: () => void;
  onSaved: (languageChanged: boolean) => void;
}) {
  const { t } = props;
  const [key, setKey] = useState('');
  const [language, setLanguage] = useState<Language>(props.language);
  const [models, setModels] = useState<ModelEntry[]>(props.models);
  const [newLabel, setNewLabel] = useState('');
  const [newSlug, setNewSlug] = useState('');

  useEffect(() => {
    api.getApiKey().then(setKey);
  }, []);

  const addModel = () => {
    const label = newLabel.trim();
    const slug = newSlug.trim();
    if (!label || !slug) return;
    setModels((prev) => [
      // Re-adding an existing label updates its OpenRouter string.
      ...prev.filter((m) => m.label !== label),
      { label, slug },
    ]);
    setNewLabel('');
    setNewSlug('');
  };

  async function save() {
    await api.setApiKey(key.trim());
    await api.setModels(models);
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
            placeholder={t('model_slug_placeholder')}
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
        <div className="actions">
          <button onClick={props.onClose}>{t('cancel')}</button>
          <button className="accent" onClick={save}>{t('save')}</button>
        </div>
      </div>
    </div>
  );
}
