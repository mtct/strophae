// Shared attachment widgets: the chip strip (compose prompts, chat
// composer and sent messages), the picker button driving att:pick and
// the inline viewer for stored image attachments.

import { useEffect, useState } from 'react';

import type { Attachment } from '../../shared/types';
import { api } from '../api';
import type { T } from '../App';

function icon(att: Attachment): string {
  if (att.kind === 'image') return '🖼';
  if (att.kind === 'audio') return '🔊';
  return '📄';
}

export function AttachmentChips(props: {
  t: T;
  attachments: Attachment[];
  onRemove?: (att: Attachment) => void;
}) {
  if (props.attachments.length === 0) return null;
  return (
    <div className="chips">
      {props.attachments.map((att) => (
        <span key={att.id} className="chip" title={att.name}>
          <span aria-hidden>{icon(att)}</span>
          <span className="chip-name">{att.name}</span>
          {props.onRemove && (
            <button
              className="chip-x"
              title={props.t('remove_attachment')}
              onClick={() => props.onRemove!(att)}
            >
              ✕
            </button>
          )}
        </span>
      ))}
    </div>
  );
}

/** An image attachment shown inline (model-generated pictures). */
export function StoredImage(props: { att: Attachment }) {
  const [url, setUrl] = useState('');

  useEffect(() => {
    let alive = true;
    setUrl('');
    api.attachmentData(props.att)
      .then((data) => alive && setUrl(data))
      .catch(() => { /* file swept — leave blank */ });
    return () => {
      alive = false;
    };
  }, [props.att.id]);

  if (!url) return null;
  return <img className="gen-img" src={url} alt={props.att.name} />;
}

/** A model-generated audio reply shown inline as a playable clip. */
export function StoredAudio(props: { att: Attachment }) {
  const [url, setUrl] = useState('');

  useEffect(() => {
    let alive = true;
    setUrl('');
    api.attachmentData(props.att)
      .then((data) => alive && setUrl(data))
      .catch(() => { /* file swept — leave blank */ });
    return () => {
      alive = false;
    };
  }, [props.att.id]);

  if (!url) return null;
  return (
    <audio className="gen-audio" controls src={url}>
      {props.att.name}
    </audio>
  );
}

export function AttachButton(props: {
  t: T;
  compact?: boolean; // icon-only (chat composer)
  onPicked: (atts: Attachment[]) => void | Promise<void>;
  onToast: (msg: string) => void;
}) {
  const pick = async () => {
    const { attachments, errors } = await api.pickAttachments();
    if (errors.length) {
      props.onToast(
        props.t('attachment_failed', { name: errors.join(', ') }));
    }
    if (attachments.length) await props.onPicked(attachments);
  };
  return (
    <button
      className="ghost attach-btn"
      title={props.t('attach_files')}
      onClick={pick}
    >
      📎{props.compact ? '' : ` ${props.t('attach_files')}`}
    </button>
  );
}
