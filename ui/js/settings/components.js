/**
 * Helm Settings UI Component Primitives
 * Reusable declarative widgets for native desktop preference panes.
 */

import { h } from '../dom.js';
import { createIcon } from '../icons.js';

/**
 * Creates standard view header with title and subtitle.
 */
export function viewHeader(title, subtitle) {
  return h('div.settings-view-header', null,
    h('div.view-header-titles', null,
      h('h2.view-title', null, title),
      subtitle ? h('p.view-subtitle', null, subtitle) : null
    )
  );
}

/**
 * Creates a grouped container card with icon, title, description, and content.
 */
export function settingsCard(options, ...children) {
  const { title, desc, icon, className = '', id } = options || {};
  const headerKids = [];

  if (icon) {
    headerKids.push(h('span.card-header-icon', null, createIcon(icon, 16)));
  }

  const titleGroup = [];
  if (title) titleGroup.push(h('h3.card-title', null, title));
  if (desc) titleGroup.push(h('span.card-description', null, desc));

  if (titleGroup.length > 0) {
    headerKids.push(h('div.card-header-text', null, ...titleGroup));
  }

  const cardKids = [];
  if (headerKids.length > 0) {
    cardKids.push(h('div.settings-card-header', null, ...headerKids));
  }
  cardKids.push(...children);

  return h(`section.settings-card${className ? '.' + className : ''}`, id ? { id } : null, ...cardKids);
}

/**
 * Creates a single setting row with label, description, optional icon, and right accessory.
 */
export function settingsRow(options) {
  const { title, desc, icon, accessory, onClick, className = '' } = options || {};

  const mainKids = [];
  if (icon) {
    mainKids.push(h('span.settings-row-icon', null, createIcon(icon, 14)));
  }

  const labels = [];
  if (title) labels.push(h('span.settings-row-title', null, title));
  if (desc) labels.push(h('span.settings-row-desc', null, desc));

  mainKids.push(h('div.settings-row-labels', null, ...labels));

  const rowKids = [
    h('div.settings-row-main', null, ...mainKids)
  ];

  if (accessory) {
    rowKids.push(h('div.settings-row-accessory', null, accessory));
  }

  const props = {
    class: `settings-row ${className}`.trim(),
  };

  if (typeof onClick === 'function') {
    props.onclick = onClick;
    props.style = 'cursor: pointer;';
  }

  return h('div', props, ...rowKids);
}

/**
 * Creates a native toggle switch element.
 */
export function toggleSwitch(options = {}) {
  const { checked = false, onChange, disabled = false, id } = options;

  const input = h('input', {
    type: 'checkbox',
    checked: !!checked,
    disabled: !!disabled,
    id: id || null,
    onchange: (e) => {
      if (typeof onChange === 'function') {
        onChange(e.target.checked, e);
      }
    },
  });

  const label = h('label.switch', null,
    input,
    h('span.switch-slider')
  );

  return { element: label, input };
}

/**
 * Creates a clean desktop empty state message block.
 */
export function emptyState(title, desc, iconName = 'search') {
  return h('div.settings-empty-state', null,
    h('div.empty-state-icon', null, createIcon(iconName, 24)),
    h('div.empty-state-title', null, title),
    desc ? h('div.empty-state-desc', null, desc) : null
  );
}
