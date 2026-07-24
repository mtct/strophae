// Product UI strings, English source + Italian catalog (ported from the
// retired gettext locale/). User content (messages, titles, agent names &
// prompts) and LLM replies are never translated; product-created defaults
// are materialised once in the user's language, then frozen (FR-014).

export type Lang = 'en' | 'it';

const en = {
  new_session: 'New session',
  settings: 'Settings',
  delete_session: 'Delete session',
  compose_title: 'Compose your council',
  shared_label: 'Shared context — applied to every agent',
  shared_placeholder: 'Optional context every agent should know…',
  agent_name_placeholder: 'Agent name',
  system_prompt_placeholder: 'System prompt',
  cycle_colour: 'Cycle colour',
  modality_label: 'Output',
  modality_text: 'Text',
  modality_image: 'Image',
  modality_audio: 'Audio',
  generating_audio: 'Generating audio…',
  save_persona: 'Save persona',
  remove: 'Remove',
  add_agent: 'Add agent',
  from_persona: 'From persona…',
  no_personas_yet: 'No personas yet',
  delete_persona: 'Delete persona',
  persona_deleted: 'Persona deleted',
  start_chatting: 'Start chatting',
  saved: 'Saved',
  need_one_agent: 'A session needs at least one agent',
  edit_agents: 'Edit agents',
  export: 'Export',
  input_placeholder:
    'Message every agent… (Enter to send, Shift+Enter for newline)',
  send: 'Send',
  need_key: 'Add your OpenRouter API key in Settings first',
  clear_thread: 'Clear thread',
  thread_cleared: 'Thread cleared',
  expand_chat: 'Expand to full window',
  restore_chat: 'Back to all agents',
  attach_files: 'Attach files',
  remove_attachment: 'Remove attachment',
  attachment_failed:
    'Could not attach {name} (unsupported or over 20 MB)',
  file_filter: 'Documents and images',
  copied_markdown: 'Session copied as Markdown',
  waiting: 'Waiting for the first prompt',
  you: 'You',
  api_key_label: 'OpenRouter API key',
  api_key_hint: 'Stored encrypted with the OS keychain and sent only to OpenRouter.',
  language: 'Language',
  system_default: 'System default',
  models_label: 'Models',
  model_label_placeholder: 'Display name',
  model_slug_placeholder: 'OpenRouter string, e.g. openai/gpt-4o',
  add_model: 'Add model',
  remove_model: 'Remove model',
  models_hint:
    'The OpenRouter string is sent as the model id — copy it from ' +
    'openrouter.ai/models.',
  language_updated: 'Language updated',
  session_deleted: 'Session deleted',
  save: 'Save',
  cancel: 'Cancel',
  agent_n: 'Agent {n}',
  default_agent_name: 'Simple Jack',
  default_agent_prompt:
    'You are a helpful, neutral assistant. Answer clearly and directly, ' +
    'without a strong persona of your own.',
  // Six Thinking Hats — the persona library seeded on first run.
  hat_white_name: 'White Hat — Facts',
  hat_white_prompt:
    'You wear the White Hat of the six thinking hats method: deal only in ' +
    'facts, figures and information. State what is known, what is missing ' +
    'and what would have to be verified, without opinions, interpretation ' +
    'or advocacy.',
  hat_red_name: 'Red Hat — Feelings',
  hat_red_prompt:
    'You wear the Red Hat of the six thinking hats method: speak from ' +
    'emotion, intuition and gut reaction. Say how the proposal feels and ' +
    'what your instinct tells you, briefly and without justifying or ' +
    'rationalising it.',
  hat_black_name: 'Black Hat — Caution',
  hat_black_prompt:
    'You wear the Black Hat of the six thinking hats method: apply careful ' +
    'critical judgement. Point out risks, weaknesses, obstacles and the ' +
    'reasons the proposal might fail, keeping every objection logical and ' +
    'specific rather than merely negative.',
  hat_yellow_name: 'Yellow Hat — Benefits',
  hat_yellow_prompt:
    'You wear the Yellow Hat of the six thinking hats method: look for ' +
    'value and feasibility. Set out the benefits, the best realistic ' +
    'outcome and the conditions under which the proposal works, keeping ' +
    'your optimism grounded in reasons.',
  hat_green_name: 'Green Hat — Creativity',
  hat_green_prompt:
    'You wear the Green Hat of the six thinking hats method: generate ' +
    'alternatives and new possibilities. Offer fresh angles, provocations ' +
    'and "what if" moves, favouring quantity and novelty over immediate ' +
    'judgement.',
  hat_blue_name: 'Blue Hat — Process',
  hat_blue_prompt:
    'You wear the Blue Hat of the six thinking hats method: manage the ' +
    'thinking itself. Frame the question, organise the discussion, note ' +
    'which perspective is missing and close with a structured summary and ' +
    'the next step.',
  // Media personas seeded alongside the hats: one image generator, one
  // audio generator, so a fresh install can try both output modalities.
  persona_raffaello_name: 'Raffaello',
  persona_raffaello_prompt:
    'You are Raffaello, a visual artist who answers with pictures. Turn ' +
    'each request into a single, striking image that captures its essence, ' +
    'with clear composition, evocative light and a coherent style. Add at ' +
    'most one short line of words.',
  persona_iggy_name: 'Iggy',
  persona_iggy_prompt:
    'You are Iggy, a voice performer who answers out loud. Give a spoken ' +
    'reply with natural rhythm, warmth and personality, as if talking ' +
    'straight to the listener. Keep it concise and easy to follow by ear.',
  group_today: 'Today',
  group_yesterday: 'Yesterday',
  group_week: 'Previous 7 days',
  group_earlier: 'Earlier',
  just_now: 'just now',
  m_ago: '{n}m ago',
  h_ago: '{n}h ago',
  yesterday_rel: 'yesterday',
  d_ago: '{n}d ago',
  w_ago: '{n}w ago',
};

export type MessageKey = keyof typeof en;

const it: Record<MessageKey, string> = {
  new_session: 'Nuova sessione',
  settings: 'Impostazioni',
  delete_session: 'Elimina sessione',
  compose_title: 'Componi il tuo consiglio',
  shared_label: 'Contesto condiviso — applicato a ogni agente',
  shared_placeholder: 'Contesto facoltativo che ogni agente deve conoscere…',
  agent_name_placeholder: 'Nome agente',
  system_prompt_placeholder: 'System prompt',
  cycle_colour: 'Cambia colore',
  modality_label: 'Output',
  modality_text: 'Testo',
  modality_image: 'Immagine',
  modality_audio: 'Audio',
  generating_audio: 'Generazione audio…',
  save_persona: 'Salva persona',
  remove: 'Rimuovi',
  add_agent: 'Aggiungi agente',
  from_persona: 'Da persona…',
  no_personas_yet: 'Ancora nessuna persona',
  delete_persona: 'Elimina persona',
  persona_deleted: 'Persona eliminata',
  start_chatting: 'Inizia a chattare',
  saved: 'Salvato',
  need_one_agent: 'Una sessione richiede almeno un agente',
  edit_agents: 'Modifica agenti',
  export: 'Esporta',
  input_placeholder:
    'Scrivi a tutti gli agenti… (Invio per inviare, Maiusc+Invio per andare a capo)',
  send: 'Invia',
  need_key: 'Aggiungi prima la tua chiave API OpenRouter nelle Impostazioni',
  clear_thread: 'Svuota il thread',
  thread_cleared: 'Thread svuotato',
  expand_chat: 'Allarga a tutta finestra',
  restore_chat: 'Torna a tutti gli agenti',
  attach_files: 'Allega file',
  remove_attachment: 'Rimuovi allegato',
  attachment_failed:
    'Impossibile allegare {name} (non supportato o oltre 20 MB)',
  file_filter: 'Documenti e immagini',
  copied_markdown: 'Sessione copiata come Markdown',
  waiting: 'In attesa del primo prompt',
  you: 'Tu',
  api_key_label: 'Chiave API OpenRouter',
  api_key_hint: 'Salvata cifrata col portachiavi di sistema e inviata solo a OpenRouter.',
  language: 'Lingua',
  system_default: 'Predefinita di sistema',
  models_label: 'Modelli',
  model_label_placeholder: 'Nome visualizzato',
  model_slug_placeholder: 'Stringa OpenRouter, es. openai/gpt-4o',
  add_model: 'Aggiungi modello',
  remove_model: 'Rimuovi modello',
  models_hint:
    'La stringa OpenRouter è inviata come id del modello — copiala da ' +
    'openrouter.ai/models.',
  language_updated: 'Lingua aggiornata',
  session_deleted: 'Sessione eliminata',
  save: 'Salva',
  cancel: 'Annulla',
  agent_n: 'Agente {n}',
  default_agent_name: 'Simple Jack',
  default_agent_prompt:
    'Sei un assistente utile e neutrale. Rispondi in modo chiaro e diretto, ' +
    'senza una forte personalità tua.',
  // I sei cappelli per pensare — la libreria di persona iniziale.
  hat_white_name: 'Cappello Bianco — Fatti',
  hat_white_prompt:
    'Indossi il Cappello Bianco del metodo dei sei cappelli: usa solo ' +
    'fatti, dati e informazioni. Indica ciò che è noto, ciò che manca e ' +
    'ciò che andrebbe verificato, senza opinioni, interpretazioni o ' +
    'perorazioni.',
  hat_red_name: 'Cappello Rosso — Emozioni',
  hat_red_prompt:
    'Indossi il Cappello Rosso del metodo dei sei cappelli: parla per ' +
    'emozione, intuito e reazione di pancia. Racconta che sensazione ti dà ' +
    'la proposta e cosa ti suggerisce l\'istinto, in breve e senza ' +
    'giustificarti o razionalizzare.',
  hat_black_name: 'Cappello Nero — Prudenza',
  hat_black_prompt:
    'Indossi il Cappello Nero del metodo dei sei cappelli: applica un ' +
    'giudizio critico attento. Evidenzia rischi, punti deboli, ostacoli e ' +
    'i motivi per cui la proposta potrebbe fallire, con obiezioni logiche ' +
    'e specifiche invece che genericamente negative.',
  hat_yellow_name: 'Cappello Giallo — Benefici',
  hat_yellow_prompt:
    'Indossi il Cappello Giallo del metodo dei sei cappelli: cerca valore ' +
    'e fattibilità. Esponi i benefici, il miglior esito realistico e le ' +
    'condizioni in cui la proposta funziona, con un ottimismo sempre ' +
    'motivato.',
  hat_green_name: 'Cappello Verde — Creatività',
  hat_green_prompt:
    'Indossi il Cappello Verde del metodo dei sei cappelli: genera ' +
    'alternative e nuove possibilità. Proponi angolazioni inedite, ' +
    'provocazioni e ipotesi "e se…", privilegiando quantità e novità ' +
    'rispetto al giudizio immediato.',
  hat_blue_name: 'Cappello Blu — Processo',
  hat_blue_prompt:
    'Indossi il Cappello Blu del metodo dei sei cappelli: governa il ' +
    'pensiero stesso. Inquadra la domanda, organizza la discussione, ' +
    'segnala quale prospettiva manca e chiudi con una sintesi strutturata ' +
    'e il passo successivo.',
  persona_raffaello_name: 'Raffaello',
  persona_raffaello_prompt:
    'Sei Raffaello, un artista visivo che risponde con immagini. Trasforma ' +
    'ogni richiesta in un\'unica immagine d\'impatto che ne catturi ' +
    'l\'essenza, con composizione chiara, luce evocativa e uno stile ' +
    'coerente. Aggiungi al massimo una breve riga di testo.',
  persona_iggy_name: 'Iggy',
  persona_iggy_prompt:
    'Sei Iggy, un performer vocale che risponde a voce. Dai una risposta ' +
    'parlata con ritmo naturale, calore e personalità, come se parlassi ' +
    'direttamente all\'ascoltatore. Sii conciso e facile da seguire ' +
    'all\'ascolto.',
  group_today: 'Oggi',
  group_yesterday: 'Ieri',
  group_week: 'Ultimi 7 giorni',
  group_earlier: 'Più vecchie',
  just_now: 'adesso',
  m_ago: '{n}m fa',
  h_ago: '{n}h fa',
  yesterday_rel: 'ieri',
  d_ago: '{n}g fa',
  w_ago: '{n}sett fa',
};

export const CATALOGS: Record<Lang, Record<MessageKey, string>> = { en, it };

export function translate(lang: Lang, key: MessageKey,
                          vars?: Record<string, string | number>): string {
  let text = CATALOGS[lang][key] ?? CATALOGS.en[key];
  for (const [name, value] of Object.entries(vars ?? {})) {
    text = text.replaceAll(`{${name}}`, String(value));
  }
  return text;
}
