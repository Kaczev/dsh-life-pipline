const React = require('react');
const h = React.createElement;
const RPC_ENDPOINT = 'dsh-lpipe-memory';
const PANEL_SLOT = 'lpipe.settings.panel';
const LOCALE_NS = 'lpipe.memory.settings';
const KINDS = ['wishes', 'settings'];
const LIMITS = { maxEntries: 32, maxTextLength: 500 };
const LABELS = {
  wishes: { enable: 'enableWishes', count: 'countWishes', empty: 'emptyWishes', add: 'addWishes', edit: 'editWishes', remove: 'removeWishes', removeAction: 'removeWishAction', confirm: 'confirmWish', configured: 'savedWishesConfig', saved: 'savedWishes', removed: 'removedWishes' },
  settings: { enable: 'enableSettings', count: 'countSettings', empty: 'emptySettings', add: 'addSettings', edit: 'editSettings', remove: 'removeSettings', removeAction: 'removeSettingAction', confirm: 'confirmSetting', configured: 'savedSettingsConfig', saved: 'savedSettings', removed: 'removedSettings' },
};

const STYLES = `
.lpipe-memory, .lpipe-memory-dialog {
  --memory-text: var(--dsw-alias-label-primary);
  --memory-muted: var(--dsw-alias-label-secondary);
  --memory-border: var(--dsw-alias-border-l1);
  --memory-strong: var(--dsw-alias-border-l2);
  --memory-surface: var(--dsw-alias-bg-layer-1);
  --memory-soft: var(--dsw-alias-bg-layer-2);
  --memory-accent: var(--dsw-alias-state-business-primary);
  --memory-on-accent: #fff;
  --memory-wash: color-mix(in srgb, var(--memory-accent) 12%, transparent);
  --memory-line: color-mix(in srgb, var(--memory-accent) 32%, transparent);
  --memory-danger: var(--dsw-alias-state-error-primary);
  color: var(--memory-text);
  font-size: 12px;
  line-height: 1.5;
}
.lpipe-memory, .lpipe-memory :where(*) { box-sizing: border-box; }
.lpipe-memory { width: 100%; }
.lpipe-memory [hidden] { display: none !important; }
.lpipe-memory .memory-head { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 4px 10px; margin-bottom: 10px; }
.lpipe-memory .memory-title { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 8px; font-size: 13px; margin: 0; font-weight: 650; }
.lpipe-memory .memory-badge { display: inline-flex; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--memory-line); background: var(--memory-wash); color: var(--memory-accent); font-size: 10.5px; font-weight: 600; }
.lpipe-memory :is(.memory-card, .lpipe-memory-dialog) { border: 1px solid var(--memory-border); border-radius: var(--dsw-radius-lg); background: var(--memory-surface); padding: 12px 14px 10px; }
.lpipe-memory .memory-tabs { display: flex; width: fit-content; max-width: 100%; flex-wrap: wrap; gap: 2px; padding: 2px; margin-bottom: 8px; background: var(--memory-soft); border: 1px solid var(--memory-border); border-radius: var(--dsw-radius-sm); }
.lpipe-memory :is(button,input,textarea) { font: inherit; color: inherit; }
.lpipe-memory button { appearance: none; cursor: pointer; background: transparent; border: 1px solid transparent; border-radius: var(--dsw-radius-sm); padding: 4px 8px; }
.lpipe-memory button:hover:not(:disabled) { background: var(--memory-wash); color: var(--memory-accent); }
.lpipe-memory button:disabled { cursor: not-allowed; color: var(--memory-muted); opacity: .65; }
.lpipe-memory :is(button,input,textarea):focus-visible { outline: 2px solid var(--memory-accent); outline-offset: 2px; }
.lpipe-memory [role=tab] { color: var(--memory-muted); padding: 3px 10px; }
.lpipe-memory [role=tab][aria-selected=true] { border-color: var(--memory-line); background: var(--memory-wash); color: var(--memory-accent); font-weight: 650; }
.lpipe-memory .memory-options { display: grid; gap: 9px; }
.lpipe-memory .memory-switch-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 10px; background: var(--memory-soft); border: 1px solid var(--memory-border); border-radius: var(--dsw-radius-sm); }
.lpipe-memory .memory-switch-label { font-weight: 650; }
.lpipe-memory .memory-scope { margin-bottom: 8px; }
.lpipe-memory .memory-scope .memory-switch-label { color: var(--memory-text); font-size: 11px; line-height: 1.4; }
.lpipe-memory .memory-scope .memory-switch-hint { color: var(--dsw-alias-label-tertiary); font-size: 10px; line-height: 1.45; }
.lpipe-memory .memory-scope .memory-switch::before { background: var(--dsw-alias-label-on-color); }
.lpipe-memory .memory-scope :is([role=status], [role=alert]):not(:empty) { margin-top: 4px; }
.lpipe-memory .memory-switch-hint { display: block; margin-top: 2px; }
.lpipe-memory .memory-switch { appearance: none; position: relative; width: 36px; height: 20px; margin: 0; border-radius: 999px; border: 1px solid var(--memory-strong); background: var(--memory-strong); cursor: pointer; flex: none; }
.lpipe-memory .memory-switch::before { content: ''; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: var(--memory-on-accent); }
.lpipe-memory .memory-switch:checked { background: var(--memory-accent); border-color: var(--memory-accent); }
.lpipe-memory .memory-switch:checked::before { transform: translateX(16px); }
.lpipe-memory .memory-switch:disabled { opacity: .55; cursor: not-allowed; }
.lpipe-memory .memory-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 160px), 1fr)); gap: 8px 10px; }
.lpipe-memory .memory-number-label { display: grid; align-content: start; gap: 4px; font-size: 11px; font-weight: 600; color: var(--memory-muted); }
.lpipe-memory :is(input[type=number],textarea) { width: 100%; min-width: 0; color: var(--memory-text); background: var(--memory-soft); border: 1px solid var(--memory-strong); border-radius: var(--dsw-radius-sm); padding: 5px 8px; }
.lpipe-memory textarea { display: block; min-height: 72px; resize: vertical; }
.lpipe-memory .memory-options-foot, .lpipe-memory .memory-list-head { display: flex; align-items: center; justify-content: space-between; gap: 6px 10px; flex-wrap: wrap; }
.lpipe-memory .memory-options-foot button { margin-inline-start: auto; }
.lpipe-memory .memory-list-head { margin-top: 10px; padding: 8px 0 5px; border-top: 1px solid var(--memory-border); }
.lpipe-memory button.memory-secondary, .lpipe-memory button.memory-primary:disabled { border-color: var(--memory-border); background: var(--memory-soft); }
.lpipe-memory button.memory-primary:not(:disabled) { background: var(--memory-accent); color: var(--memory-on-accent); font-weight: 650; }
.lpipe-memory button.memory-primary:hover:not(:disabled) { filter: brightness(.92); }
.lpipe-memory button.memory-danger { color: var(--memory-danger); border-color: color-mix(in srgb, var(--memory-danger) 32%, transparent); }
.lpipe-memory button.memory-danger:hover:not(:disabled) { color: var(--memory-danger); background: color-mix(in srgb, var(--memory-danger) 12%, transparent); }
.lpipe-memory :is(input,textarea)[aria-invalid=true] { border-color: var(--memory-danger); }
.lpipe-memory ul { list-style: none; margin: 0; padding: 0; }
.lpipe-memory li { display: flex; align-items: start; justify-content: space-between; gap: 6px 10px; padding: 4px 0; border-bottom: 1px solid var(--memory-border); }
.lpipe-memory li:last-child { border-bottom: 0; }
.lpipe-memory .memory-entry { min-width: 0; padding: 5px 0; overflow-wrap: anywhere; white-space: pre-wrap; }
.lpipe-memory .memory-actions { flex: none; display: flex; gap: 2px; }
.lpipe-memory .memory-note, .lpipe-memory .memory-error { margin: 0; font-size: 11px; overflow-wrap: anywhere; }
.lpipe-memory .memory-note { color: var(--memory-muted); font-variant-numeric: tabular-nums; }
.lpipe-memory .memory-error { color: var(--memory-danger); }
.lpipe-memory .memory-empty, .lpipe-memory .memory-list-status:not(:empty) { padding: 4px 0; }
.lpipe-memory .lpipe-memory-dialog { width: min(390px, calc(100% - 28px)); }
.lpipe-memory-dialog::backdrop { background: #0007; }
.lpipe-memory-dialog h4 { font-size: 14px; margin: 0 0 8px; }
.lpipe-memory-dialog p { margin: 0 0 8px; overflow-wrap: anywhere; }
.lpipe-memory-dialog textarea + .memory-note { margin-top: 4px; }
.lpipe-memory-dialog .memory-dialog-actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
`;

const normalize = text => text.replace(/\r\n?/g, '\n').trim();
const lengthOf = text => Array.from(normalize(text)).length;
const inRange = (value, max) => Number.isInteger(value) && value >= 1 && value <= max;
const configOf = ({ enabled, maxEntries, maxTextLength }) => ({ enabled, maxEntries, maxTextLength });
const draftsOf = state => Object.fromEntries(KINDS.map(kind => [kind, configOf(state[kind])]));
function rebaseDrafts(drafts, previous, next) {
  const rebased = draftsOf(next);
  for (const kind of KINDS) {
    for (const field of Object.keys(rebased[kind])) {
      if (drafts[kind][field] !== previous[kind][field]) rebased[kind][field] = drafts[kind][field];
    }
  }
  return rebased;
}
const equalConfig = (a, b) => a.enabled === b.enabled && a.maxEntries === b.maxEntries && a.maxTextLength === b.maxTextLength;
const problem = (key, params, field) => ({ key, params, field });

function checkOptions(entries, draft) {
  if (!inRange(draft.maxEntries, LIMITS.maxEntries)) return problem('entriesRange', { limit: LIMITS.maxEntries }, 'maxEntries');
  if (!inRange(draft.maxTextLength, LIMITS.maxTextLength)) return problem('textRange', { limit: LIMITS.maxTextLength }, 'maxTextLength');
  if (entries.length > draft.maxEntries) return problem('existingEntries', undefined, 'maxEntries');
  if (entries.some(entry => lengthOf(entry.text) > draft.maxTextLength)) return problem('existingText', undefined, 'maxTextLength');
  return null;
}

function entryRequest(kind, action, section, id, raw) {
  if (action === 'remove') return { kind, action, id };
  const text = normalize(raw);
  if (!text) return problem('requiredText', undefined, 'text');
  if (lengthOf(text) > section.maxTextLength) return problem('textLimit', { limit: section.maxTextLength }, 'text');
  if (action === 'add' && section.entries.length >= section.maxEntries) return problem('addLimit');
  return action === 'add' ? { kind, action, text } : { kind, action, id, text };
}

function configureRequest(kind, section, draft) {
  return checkOptions(section.entries, draft) ?? { kind, action: 'configure', config: configOf(draft) };
}

function stateOf(reply) {
  if (reply?.ok !== true) return null;
  const state = reply.state;
  if (typeof state?.allSessions !== 'boolean') return null;
  for (const kind of KINDS) {
    const group = state?.[kind];
    if (typeof group?.enabled !== 'boolean' || !inRange(group.maxEntries, LIMITS.maxEntries)
      || !inRange(group.maxTextLength, LIMITS.maxTextLength) || !Array.isArray(group.entries)
      || group.entries.length > group.maxEntries) return null;
    const seen = new Set();
    for (const entry of group.entries) {
      if (typeof entry?.id !== 'string' || !entry.id || seen.has(entry.id) || typeof entry?.text !== 'string'
        || !normalize(entry.text) || lengthOf(entry.text) > group.maxTextLength) return null;
      seen.add(entry.id);
    }
  }
  return state;
}

function replyProblem(reply) {
  return typeof reply?.message === 'string' && reply.message ? { message: reply.message, field: reply.field } : null;
}

function mutationProblem(reply) {
  if (reply?.ok !== false) return null;
  if (reply.code === 'commit_uncertain') return { uncertain: true, issue: problem('saveFailed') };
  const issue = replyProblem(reply);
  return issue ? { uncertain: false, issue } : null;
}

function textOf(t, error) {
  return error?.message || (error && t(error.key, error.params));
}

function createRpc(connection) {
  return async (method, payload, signal) => {
    const result = await connection.rpc.call('/api', RPC_ENDPOINT, { method, payload }, signal);
    if (result?.ok !== true) throw new Error('Memory transport rejected the request');
    return result.value;
  };
}

function MemoryPanel({ rpcCall, locale, t }) {
  // The binding keeps its identity across language changes; this subscription rerenders the panel.
  React.useSyncExternalStore(locale.subscribe, locale.getSnapshot);
  const uid = React.useId();
  const [kind, setKind] = React.useState('wishes');
  const [state, setState] = React.useState(null);
  const [drafts, setDrafts] = React.useState(null);
  const [loadIssue, setLoadIssue] = React.useState(null);
  const [reload, setReload] = React.useState(0);
  const [pending, setPending] = React.useState(null);
  const [notice, setNotice] = React.useState(null);
  const [scopeFeedback, setScopeFeedback] = React.useState(null);
  const [optionIssues, setOptionIssues] = React.useState({});
  const [editing, setEditing] = React.useState(null);
  const [body, setBody] = React.useState('');
  const [entryIssue, setEntryIssue] = React.useState(null);
  const [uncertain, setUncertain] = React.useState(false);
  const scopeRecovery = React.useRef(null);
  const mounted = React.useRef(false);
  const write = React.useRef(null);
  const tabs = React.useRef({});
  const addButtons = React.useRef({});
  const inputs = React.useRef({});
  const dialog = React.useRef(null);
  const field = React.useRef(null);
  const cancelButton = React.useRef(null);
  const returnFocus = React.useRef(null);
  const pendingOptionFocus = React.useRef(null);

  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      write.current?.abort();
      write.current = null;
    };
  }, []);

  React.useEffect(() => {
    const request = new AbortController();
    setLoadIssue(null);
    void (async () => {
      try {
        const reply = await rpcCall('memory.state', null, request.signal);
        if (request.signal.aborted) return;
        const data = stateOf(reply);
        if (!data) { setLoadIssue(replyProblem(reply) ?? problem('loadFailed')); return; }
        const recovery = scopeRecovery.current;
        setState(data);
        setDrafts(recovery ? rebaseDrafts(recovery.drafts, recovery.state, data) : draftsOf(data));
        scopeRecovery.current = null;
        setUncertain(false);
      } catch {
        if (!request.signal.aborted) setLoadIssue(problem('loadFailed'));
      }
    })();
    return () => request.abort();
  }, [rpcCall, reload]);

  const busy = pending !== null;
  React.useLayoutEffect(() => {
    if (editing && !dialog.current.open) {
      dialog.current.showModal();
      (editing.action === 'remove' ? cancelButton.current : field.current)?.focus();
    }
    if (!editing && dialog.current?.open) {
      dialog.current.close();
      returnFocus.current?.()?.focus();
      returnFocus.current = null;
    }
    if (!busy && pendingOptionFocus.current) {
      inputs.current[`${pendingOptionFocus.current}-enabled`]?.focus();
      pendingOptionFocus.current = null;
    }
  }, [editing, busy]);

  const locked = busy || Boolean(uncertain);
  const select = (key, focus = false) => {
    setKind(key);
    setNotice(null);
    if (focus) tabs.current[key]?.focus();
  };
  const open = (key, action, row, opener) => {
    if (locked) return;
    returnFocus.current = () => opener.isConnected ? opener : tabs.current[key];
    setBody(row?.text ?? '');
    setEntryIssue(null);
    setEditing({ kind: key, action, row });
  };
  const close = () => { if (!write.current) setEditing(null); };
  const retryLoad = () => {
    setEditing(null);
    if (uncertain === 'scope') scopeRecovery.current ??= { state, drafts };
    else setUncertain(false);
    setState(null);
    setDrafts(null);
    setNotice(null);
    setLoadIssue(null);
    setOptionIssues({});
    setScopeFeedback(null);
    setReload(n => n + 1);
  };

  async function setScope(allSessions) {
    if (write.current || uncertain || allSessions === state.allSessions) return;
    const request = new AbortController();
    write.current = request;
    setPending({ scope: true });
    setScopeFeedback(null);
    try {
      const reply = await rpcCall('memory.setScope', allSessions, request.signal);
      if (!mounted.current || request.signal.aborted) return;
      const failure = mutationProblem(reply);
      if (failure) {
        if (failure.uncertain) setUncertain('scope');
        else setScopeFeedback({ issue: failure.issue });
        return;
      }
      const next = stateOf(reply);
      if (!next || next.allSessions !== allSessions) throw new Error('Invalid memory scope');
      setState(next);
      setDrafts(previous => rebaseDrafts(previous, state, next));
    } catch {
      if (mounted.current && !request.signal.aborted) setUncertain('scope');
    } finally {
      if (write.current === request) write.current = null;
      if (mounted.current && !request.signal.aborted) setPending(null);
    }
  }

  async function mutate(payload) {
    if (write.current || uncertain) return;
    const { kind: key, action } = payload;
    const configure = action === 'configure';
    const showIssue = issue => configure ? setOptionIssues(previous => ({ ...previous, [key]: issue })) : setEntryIssue(issue);
    const request = new AbortController();
    write.current = request;
    setPending({ key, configure });
    setNotice(null);
    showIssue(null);
    try {
      const reply = await rpcCall('memory.mutate', payload, request.signal);
      if (!mounted.current || request.signal.aborted) return;
      const failure = mutationProblem(reply);
      if (failure) {
        if (failure.uncertain) setUncertain(true);
        else showIssue(failure.issue);
        return;
      }
      const next = stateOf(reply);
      if (!next) throw new Error('Invalid memory state');
      setState(next);
      setDrafts(previous => {
        const saved = draftsOf(next);
        return Object.fromEntries(KINDS.map(name => [name,
          (configure && name === key) || equalConfig(previous[name], configOf(state[name])) ? saved[name] : previous[name],
        ]));
      });
      if (configure) pendingOptionFocus.current = key;
      else {
        returnFocus.current = () => addButtons.current[key]?.disabled ? tabs.current[key] : addButtons.current[key];
        setEditing(null);
      }
      setNotice({ key, configure, ...problem(configure ? LABELS[key].configured : action === 'remove' ? LABELS[key].removed : LABELS[key].saved) });
    } catch {
      // The request may have committed. Reload before allowing a second add or write.
      if (!mounted.current || request.signal.aborted) return;
      setUncertain(true);

    } finally {
      if (write.current === request) write.current = null;
      if (mounted.current && !request.signal.aborted) setPending(null);
    }
  }

  const saveOptions = (event, key) => {
    event.preventDefault();
    if (locked || equalConfig(drafts[key], configOf(state[key]))) return;
    const payload = configureRequest(key, state[key], drafts[key]);
    if (payload.key) {
      setOptionIssues(previous => ({ ...previous, [key]: payload }));
      inputs.current[`${key}-${payload.field}`]?.focus();
    } else void mutate(payload);
  };
  const saveEntry = event => {
    event.preventDefault();
    if (locked || !editing) return;
    const payload = entryRequest(editing.kind, editing.action, state[editing.kind], editing.row?.id, body);
    if (payload.key) { setEntryIssue(payload); field.current?.focus(); }
    else void mutate(payload);
  };
  const updateDraft = (key, fieldName, value) => {
    setOptionIssues(previous => ({ ...previous, [key]: null }));
    setDrafts(previous => ({ ...previous, [key]: { ...previous[key], [fieldName]: value } }));
  };
  const tabId = key => `${uid}-${key}-tab`;
  const paneId = key => `${uid}-${key}-pane`;
  const button = (label, props) => h('button', { type: 'button', ...props }, label);
  const errorView = (error, id) => error ? h('p', { id, role: 'alert', className: 'memory-error' }, textOf(t, error)) : null;
  const tab = (key, i) => button(t(key), {
    key, id: tabId(key), ref: node => { tabs.current[key] = node; }, role: 'tab',
    'aria-controls': paneId(key), 'aria-selected': kind === key, tabIndex: kind === key ? 0 : -1,
    onClick: () => select(key), onKeyDown: event => {
      const next = { ArrowLeft: (i + KINDS.length - 1) % KINDS.length, ArrowRight: (i + 1) % KINDS.length, Home: 0, End: KINDS.length - 1 }[event.key];
      if (next === undefined) return;
      event.preventDefault(); select(KINDS[next], true);
    },
  });
  const showPanel = key => {
    const section = state[key], draft = drafts[key], labels = LABELS[key], issue = optionIssues[key];
    const issueId = `${uid}-${key}-error`;
    const dirty = !equalConfig(draft, configOf(section));
    const draftIssue = dirty ? checkOptions(section.entries, draft) : null;
    const optionIssue = issue ?? draftIssue;
    const feedback = notice?.key === key ? notice : null;
    const full = section.entries.length >= section.maxEntries;
    const inputError = name => optionIssue?.field === name ? { 'aria-invalid': true, 'aria-describedby': issueId } : {};
    const number = name => h('label', { key: name, className: 'memory-number-label' }, t(name), h('input', {
      ref: node => { inputs.current[`${key}-${name}`] = node; }, type: 'number', name, min: 1, max: LIMITS[name], step: 1, required: true,
      disabled: locked, value: Number.isNaN(draft[name]) ? '' : draft[name],
      onChange: event => updateDraft(key, name, event.currentTarget.valueAsNumber), ...inputError(name),
    }));
    return h('section', { key, id: paneId(key), role: 'tabpanel', 'aria-labelledby': tabId(key), hidden: kind !== key },
      h('form', { className: 'memory-options', 'aria-label': t(labels.enable), onSubmit: event => saveOptions(event, key), noValidate: true },
        h('label', { className: 'memory-switch-row' },
          h('span', null,
            h('span', { className: 'memory-switch-label' }, t(labels.enable)),
            h('span', { className: 'memory-note memory-switch-hint' }, t(`${key}Hint`))),
          h('input', {
            ref: node => { inputs.current[`${key}-enabled`] = node; }, type: 'checkbox', role: 'switch', className: 'memory-switch',
            'aria-label': t(labels.enable), name: 'enabled', checked: draft.enabled,
            disabled: locked, onChange: event => updateDraft(key, 'enabled', event.currentTarget.checked), ...inputError('enabled'),
          })),
        h('div', { className: 'memory-fields' }, Object.keys(LIMITS).map(number)),
        errorView(optionIssue, issueId),
        h('div', { className: 'memory-options-foot' },
          h('div', null,
            !section.enabled && h('p', { className: 'memory-note' }, t('disabled')),
            h('p', { className: 'memory-note', role: 'status' }, dirty ? t('unsaved') : feedback?.configure ? textOf(t, feedback) : null)),
          button(t(pending?.configure && pending.key === key ? 'saving' : 'saveOptions'), { type: 'submit', className: 'memory-primary', disabled: locked || !dirty || Boolean(draftIssue) }))),
      h('div', { className: 'memory-list-head' },
        h('span', { className: 'memory-note' }, t(labels.count, { count: section.entries.length, limit: section.maxEntries }), full && t('full')),
        button(t(labels.add), { ref: node => { addButtons.current[key] = node; }, className: 'memory-secondary', disabled: full || locked, onClick: event => open(key, 'add', null, event.currentTarget) })),
      h('p', { className: 'memory-note memory-list-status', role: 'status' }, feedback && !feedback.configure ? textOf(t, feedback) : null),
      h('ul', { 'aria-label': t(key) }, section.entries.map(row => h('li', { key: row.id },
        h('span', { className: 'memory-entry' }, row.text),
        h('span', { className: 'memory-actions' }, ['update', 'remove'].map(action => {
          const remove = action === 'remove', caption = t(remove ? labels.removeAction : 'edit');
          return button(caption, { key: action, disabled: locked,
            'aria-label': t('entryAction', { action: caption, text: row.text }), onClick: event => open(key, action, row, event.currentTarget) });
        }))))),
      !section.entries.length && h('p', { className: 'memory-note memory-empty' }, t(labels.empty)));
  };
  const renderDialog = () => {
    const labels = editing && LABELS[editing.kind];
    const removing = editing?.action === 'remove';
    const title = labels?.[editing.action === 'update' ? 'edit' : editing.action];
    const issueId = `${uid}-entry-error`, countId = `${uid}-entry-count`;
    return h('dialog', { ref: dialog, className: 'lpipe-memory-dialog', 'aria-labelledby': `${uid}-editor-title`,
      onCancel: event => { event.preventDefault(); close(); } },
    editing && h('form', { onSubmit: saveEntry, noValidate: true },
      h('h4', { id: `${uid}-editor-title` }, t(title)),
      removing ? h('p', null, t(labels.confirm, { text: editing.row.text })) : h(React.Fragment, null,
        h('label', { htmlFor: `${uid}-entry-text` }, t('body')),
        h('textarea', { id: `${uid}-entry-text`, ref: field, value: body, required: true, disabled: locked,
          'aria-invalid': entryIssue?.field === 'text' || undefined, 'aria-describedby': entryIssue ? `${countId} ${issueId}` : countId,
          onChange: event => { setBody(event.currentTarget.value); setEntryIssue(null); } }),
        h('p', { id: countId, className: 'memory-note' }, t('charCount', { count: lengthOf(body), limit: state[editing.kind].maxTextLength }))),
      errorView(uncertain ? problem('saveFailed') : entryIssue, issueId),
      h('div', { className: 'memory-dialog-actions' },
        button(t('cancel'), { ref: cancelButton, disabled: busy, onClick: close }),
        uncertain && button(t('reloadMemory'), { onClick: retryLoad }),
        button(t(busy ? 'saving' : removing ? labels.removeAction : 'save'), { type: 'submit', disabled: locked, className: removing ? 'memory-danger' : 'memory-primary' }))));
  };

  return h('section', { className: 'lpipe-memory', 'aria-labelledby': `${uid}-title` },
    h('style', null, STYLES),
    h('header', { className: 'memory-head' },
      h('h3', { id: `${uid}-title`, className: 'memory-title' }, 'Lpipe Memory', h('span', { className: 'memory-badge' }, '记忆管线')),
      h('p', { className: 'memory-note' }, t(state?.allSessions ? 'allSessions' : 'mainOnly'))),
    h('div', { className: 'memory-card' }, state && drafts ? h(React.Fragment, null,
      h('div', { className: 'memory-scope', 'aria-busy': Boolean(pending?.scope) },
        h('label', { className: 'memory-switch-row' },
          h('span', null,
            h('span', { id: `${uid}-scope-label`, className: 'memory-switch-label' }, t('allSessions')),
            h('span', { id: `${uid}-scope-hint`, className: 'memory-note memory-switch-hint' }, t('scopeHint'))),
          h('input', { type: 'checkbox', role: 'switch', className: 'memory-switch',
            'aria-labelledby': `${uid}-scope-label`, 'aria-describedby': `${uid}-scope-hint`,
            checked: state.allSessions, disabled: locked,
            onChange: event => void setScope(event.currentTarget.checked),
          })),
        h('p', { role: 'status', className: 'memory-note' }, pending?.scope ? t('saving') : null),
        errorView(scopeFeedback?.issue)),
      h('div', { role: 'tablist', className: 'memory-tabs', 'aria-label': t('types') }, KINDS.map(tab)),
      KINDS.map(showPanel),
      uncertain && !editing && h('div', null, h('p', { role: 'alert', className: 'memory-error' }, t('saveFailed')), button(t('reloadMemory'), { onClick: retryLoad })),
      renderDialog()) : loadIssue ? h('div', null, errorView(loadIssue), button(t('retry'), { onClick: retryLoad }))
      : h('p', { className: 'memory-note', role: 'status' }, t('loading'))));
}

function apply(ctx) {
  ctx.effect(() => ctx.locale.register(LOCALE_NS, MEMORY_LOCALES), 'dsh-lpipe-memory: panel locale');
  const t = ctx.locale.bind(LOCALE_NS);
  const locale = { subscribe: ctx.locale.subscribe.bind(ctx.locale), getSnapshot: ctx.locale.getSnapshot.bind(ctx.locale) };
  const rpcCall = createRpc(ctx.connection);
  ctx.slots.inject(PANEL_SLOT, () => ctx.slots.register({
    name: PANEL_SLOT, id: 'memory', order: 100, label: () => t('title'), inject: () => ({ rpcCall, locale, t }),
  }, MemoryPanel));
}

module.exports = {
  name: 'dsh-lpipe-memory-settings', inject: ['slots', 'connection', 'locale'], apply,
  __test__: { normalize, lengthOf, configureRequest, entryRequest, stateOf, mutationProblem },
};
