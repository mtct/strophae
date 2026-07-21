import { useState } from 'react';

import type { MessageKey } from '../../shared/i18n';
import { conversationGroups, relTime, type GroupId } from '../../shared/time';
import type { Conversation } from '../../shared/types';
import type { T } from '../App';
import { accent } from '../theme';

const GROUP_KEYS: Record<GroupId, MessageKey> = {
  today: 'group_today',
  yesterday: 'group_yesterday',
  week: 'group_week',
  earlier: 'group_earlier',
};

export function Sidebar(props: {
  t: T;
  conversations: Conversation[];
  activeId: number | null;
  onNewSession: () => void;
  onOpen: (id: number) => void;
  onDelete: (id: number) => void;
  onSettings: () => void;
}) {
  const { t } = props;
  const [menuFor, setMenuFor] = useState<number | null>(null);

  return (
    <nav className="sidebar">
      <div className="brand">strophae</div>
      <button className="accent" onClick={props.onNewSession}>
        +  {t('new_session')}
      </button>
      <div className="history">
        {conversationGroups(props.conversations).map((group) => (
          <div key={group.id}>
            <div className="group-label">{t(GROUP_KEYS[group.id])}</div>
            {group.items.map((conv) => {
              const rel = relTime(conv.updatedAt);
              return (
                <div key={conv.id} className="menu-anchor">
                  <button
                    className={`conv-entry${
                      conv.id === props.activeId ? ' active' : ''}`}
                    onClick={() => props.onOpen(conv.id)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setMenuFor(menuFor === conv.id ? null : conv.id);
                    }}
                  >
                    <div className="conv-title">{conv.title}</div>
                    <div className="conv-meta">
                      <span className="conv-dots">
                        {conv.agents.slice(0, 5).map((a) => (
                          <span key={a.id}
                                style={{ background: accent(a.hue) }} />
                        ))}
                      </span>
                      {t(rel.key as MessageKey,
                        rel.n === undefined ? undefined : { n: rel.n })}
                    </div>
                  </button>
                  {menuFor === conv.id && (
                    <div className="menu" onMouseLeave={() => setMenuFor(null)}>
                      <button onClick={() => {
                        setMenuFor(null);
                        props.onDelete(conv.id);
                      }}>
                        {t('delete_session')}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <button onClick={props.onSettings}>{t('settings')}</button>
    </nav>
  );
}
