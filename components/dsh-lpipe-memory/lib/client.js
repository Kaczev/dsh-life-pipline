window.__ModuleLoader__.load({
  id: "dsh-lpipe-memory",
  factory: (require) => {
    const module = { exports: {} };
    const MEMORY_LOCALES = {"en":{"title":"Memory Pipeline","allSessions":"Apply to all top-level conversations","mainOnly":"Lpipe main session only","scopeHint":"Choose which lists to share. With sharing off, all lists are limited to the Lpipe main session. Subagents are always excluded.","wishesScope":"Share the wish list","settingsScope":"Share the settings list","recollectionsScope":"Share the recollection list","recollections":"Recollections","enableRecollections":"Enable recollections","recollectionsHint":"Each scene holds recollections and thoughts. Sharing a scene shares both.","maxScenes":"Maximum scenes","maxSceneEntries":"Recollections per scene","maxDescriptionLength":"Characters per scene description","countScenes":"{count} / {limit} scenes","countRecollections":"{count} / {limit} recollections","emptyScenes":"No scenes yet.","emptyRecollections":"No recollections in this scene.","browseScene":"Browse scene","sceneName":"Scene name","entryName":"Entry ID","sceneDescription":"Scene description","addScene":"Add scene","editScene":"Edit scene","removeScene":"Delete scene","addRecollection":"Add recollection","editRecollection":"Edit recollection","removeRecollection":"Delete recollection","confirmScene":"Delete the empty scene “{text}”?","confirmRecollection":"Delete recollection “{text}”?","invalidName":"Use lowercase English words separated by hyphens, up to 32 characters.","duplicateName":"That name is already in use.","nonemptyScene":"Remove the recollections before deleting this scene.","missingScene":"Scene not found.","missingRecord":"Item not found.","existingScenes":"Remove scenes before lowering this limit.","existingDescription":"Shorten the description of {scene} first.","existingSceneEntries":"The scene {scene} has too many recollections for this limit.","existingSceneText":"A recollection in {scene} exceeds this length.","savedRecollectionsConfig":"Recollection options saved.","savedScene":"Scene saved.","removedScene":"Scene deleted.","savedRecollection":"Entry saved.","removedRecollection":"Entry deleted.","listScopeHint":"Other top-level conversations can use this list when sharing is on. Turn it off to keep the list in the Lpipe main session.","scopeOffHint":"Turn on sharing above to share this list.","wishesHint":"Things you want to do, without deadlines or reminders.","settingsHint":"Information eligible conversations can use by default.","saveOptions":"Save options","unsaved":"Save to apply your changes.","types":"Memory type","wishes":"Wishes","settings":"Settings","enableWishes":"Enable wishes","enableSettings":"Enable settings","disabled":"Off · You can still manage entries","maxEntries":"Maximum entries","maxTextLength":"Characters per entry","save":"Save","saving":"Saving…","loading":"Loading memory…","loadFailed":"Could not load memory. Try again.","saveFailed":"Could not confirm the save. Reload memory before making another change.","reloadMemory":"Reload memory","retry":"Retry","countWishes":"{count} / {limit} wishes","countSettings":"{count} / {limit} settings","full":" · Full","emptyWishes":"No wishes yet.","emptySettings":"No settings yet.","addWishes":"Add wish","addSettings":"Add setting","edit":"Edit","editWishes":"Edit wish","editSettings":"Edit setting","removeWishes":"Remove wish","removeSettings":"Delete setting","removeWishAction":"Remove","removeSettingAction":"Delete","entryAction":"{action}: {text}","confirmWish":"Remove “{text}”?","confirmSetting":"Delete “{text}”?","body":"Text","charCount":"{count} / {limit} characters","cancel":"Cancel","savedWishesConfig":"Wish options saved.","savedSettingsConfig":"Setting options saved.","savedWishes":"Wish saved.","savedSettings":"Setting saved.","removedWishes":"Wish removed.","removedSettings":"Setting deleted.","requiredText":"Enter text.","textLimit":"Use at most {limit} characters.","addLimit":"The list is full. Remove an entry first.","entriesRange":"Enter a whole number from 1 to {limit}.","textRange":"Enter a whole number from 1 to {limit}.","existingEntries":"Remove entries before lowering the limit this far.","existingText":"Shorten or remove entries that exceed the new character limit.","enableReview":"Enable review","reviewHint":"Wake the main conversation for review at the scheduled time. If busy, wait until it is idle.","reviewTime":"Daily review time (local)","maxThoughts":"Thoughts per scene","existingThoughts":"The scene {scene} has too many thoughts for this limit.","thoughts":"Thoughts","thought":"Thought","recollection":"Recollection","addThought":"Add thought","emptyThoughts":"No thoughts in this scene.","countThoughts":"{count} / {limit} thoughts","entryKind":"Entry type","addSceneEntry":"Add scene entry","editSceneEntry":"Edit scene entry","removeSceneEntry":"Delete scene entry","confirmSceneEntry":"Delete entry “{text}”?"},"zh":{"title":"记忆管线","allSessions":"所有顶层对话生效","mainOnly":"仅 Lpipe 主会话","scopeHint":"选择要共享的清单。关闭总开关后，所有清单都仅限 Lpipe 主会话。子代理始终不参与共享。","wishesScope":"共享欲望清单","settingsScope":"共享设定清单","recollectionsScope":"共享回忆清单","recollections":"回忆","enableRecollections":"启用回忆","recollectionsHint":"同一情景中的回忆和想法分别保存，共享时两者一同共享。","maxScenes":"最多情景数","maxSceneEntries":"每个情景最多回忆数","maxDescriptionLength":"情景简介最多字数","countScenes":"{count} / {limit} 个情景","countRecollections":"{count} / {limit} 条回忆","emptyScenes":"还没有情景。","emptyRecollections":"这个情景还没有回忆。","browseScene":"浏览情景","sceneName":"情景短名","entryName":"条目短名","sceneDescription":"情景简介","addScene":"添加情景","editScene":"编辑情景","removeScene":"删除情景","addRecollection":"添加回忆","editRecollection":"编辑回忆","removeRecollection":"删除回忆","confirmScene":"确定删除空情景「{text}」？","confirmRecollection":"确定删除回忆「{text}」？","invalidName":"请用小写英文单词命名，以连字符分隔，不超过 32 个字符。","duplicateName":"这个短名已被使用。","nonemptyScene":"请先移除情景中的回忆，再删除情景。","missingScene":"找不到这个情景。","missingRecord":"找不到这个条目。","existingScenes":"现有情景多于拟设上限，请先删除多出的情景。","existingDescription":"请先缩短情景「{scene}」的简介。","existingSceneEntries":"情景「{scene}」中的回忆条数超过拟设上限。","existingSceneText":"情景「{scene}」中有回忆超过拟设字数。","savedRecollectionsConfig":"已保存回忆选项。","savedScene":"已保存情景。","removedScene":"已删除情景。","savedRecollection":"已保存条目。","removedRecollection":"已删除条目。","listScopeHint":"开启后，其他顶层对话也可使用此清单。关闭后仅限 Lpipe 主会话。","scopeOffHint":"开启上方总开关后可共享此清单。","wishesHint":"想做的事，不是待办，也不会定时提醒。","settingsHint":"生效范围内的对话可以默认采用的信息。","saveOptions":"保存选项","unsaved":"有未保存的修改，保存后生效。","types":"记忆类型","wishes":"欲望","settings":"设定","enableWishes":"启用欲望","enableSettings":"启用设定","disabled":"已关闭 · 仍可管理条目","maxEntries":"最多条数","maxTextLength":"单条字数","save":"保存","saving":"保存中…","loading":"正在读取记忆…","loadFailed":"无法读取记忆，请重试。","saveFailed":"无法确认是否已保存。请先重新读取记忆，再继续修改。","reloadMemory":"重新读取记忆","retry":"重试","countWishes":"{count} / {limit} 条欲望","countSettings":"{count} / {limit} 条设定","full":" · 已满","emptyWishes":"还没有欲望。","emptySettings":"还没有设定。","addWishes":"添加欲望","addSettings":"添加设定","edit":"编辑","editWishes":"编辑欲望","editSettings":"编辑设定","removeWishes":"移除欲望","removeSettings":"删除设定","removeWishAction":"移除","removeSettingAction":"删除","entryAction":"{action}：{text}","confirmWish":"确定移除「{text}」？","confirmSetting":"确定删除「{text}」？","body":"正文","charCount":"{count} / {limit} 字","cancel":"取消","savedWishesConfig":"已保存欲望选项。","savedSettingsConfig":"已保存设定选项。","savedWishes":"已保存欲望。","savedSettings":"已保存设定。","removedWishes":"已移除欲望。","removedSettings":"已删除设定。","requiredText":"请输入正文。","textLimit":"正文最多 {limit} 字。","addLimit":"已达条数上限，请先删除一条。","entriesRange":"请输入 1 到 {limit} 之间的整数。","textRange":"请输入 1 到 {limit} 之间的整数。","existingEntries":"现有条目多于拟设上限，请先删除多出的条目。","existingText":"有条目超过拟设字数，请先缩短或删除。","enableReview":"开启回顾","reviewHint":"到点后唤醒主会话回顾记忆；若主会话正忙，则等到空闲再回顾。","reviewTime":"每日回顾时间（本机时间）","maxThoughts":"每个情景最多想法数","existingThoughts":"情景「{scene}」的想法数量超过拟设上限。","thoughts":"想法","thought":"想法","recollection":"回忆","addThought":"添加想法","emptyThoughts":"这个情景还没有想法。","countThoughts":"{count} / {limit} 条想法","entryKind":"条目类型","addSceneEntry":"添加情景条目","editSceneEntry":"编辑情景条目","removeSceneEntry":"删除情景条目","confirmSceneEntry":"确定删除条目「{text}」？"}};
const React = require('react');
const h = React.createElement;
const RPC_ENDPOINT = 'dsh-lpipe-memory';
const PANEL_SLOT = 'lpipe.settings.panel';
const LOCALE_NS = 'lpipe.memory.settings';
const KINDS = ['wishes', 'settings', 'recollections'];
const R = 'recollections';
const SCENE_LIMITS = { maxScenes: 32, maxEntries: 32, maxThoughts: 32, maxDescriptionLength: 500, maxTextLength: 500 };
const entryTypes = ['recollection', 'thought'];
const timeValid = value => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
const capacity = (group, kind) => kind === 'thought' ? group.maxThoughts : group.maxEntries;
const validName = name => typeof name === 'string' && name.length <= 32 && /^[a-z]+(?:-[a-z]+)*$/.test(name);
const recordLabels = { add: 'addRecollection', edit: 'editRecollection', remove: 'removeRecollection', removeAction: 'removeSettingAction', confirm: 'confirmRecollection', enable: 'enableRecollections', configured: 'savedRecollectionsConfig', saved: 'savedRecollection', removed: 'removedRecollection' };
const sceneLabels = { add: 'addScene', edit: 'editScene', remove: 'removeScene', removeAction: 'removeSettingAction', confirm: 'confirmScene', saved: 'savedScene', removed: 'removedScene' };
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
  --memory-accent: color-mix(in srgb, #779568 54%, var(--dsw-alias-label-primary));
  --memory-fill: #526e4a;
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
.lpipe-memory .memory-switch-label { font-size: 11px; line-height: 1.4; font-weight: 650; }
.lpipe-memory .memory-scope { margin-bottom: 8px; }
.lpipe-memory .memory-options > .memory-scope { margin-bottom: 0; }
.lpipe-memory .memory-scope .memory-switch-label { color: var(--memory-text); }
.lpipe-memory .memory-scope .memory-switch-hint { color: var(--dsw-alias-label-tertiary); }
.lpipe-memory .memory-scope .memory-switch::before { background: var(--dsw-alias-label-on-color); }
.lpipe-memory .memory-scope :is([role=status], [role=alert]):not(:empty) { margin-top: 4px; }
.lpipe-memory .memory-switch-hint { display: block; margin-top: 2px; }
.lpipe-memory .memory-switch { appearance: none; position: relative; width: 36px; height: 20px; margin: 0; border-radius: 999px; border: 1px solid var(--memory-strong); background: var(--memory-strong); cursor: pointer; flex: none; }
.lpipe-memory .memory-switch::before { content: ''; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: var(--memory-on-accent); }
.lpipe-memory .memory-switch:checked { background: var(--memory-fill); border-color: var(--memory-accent); }
.lpipe-memory .memory-switch:checked::before { transform: translateX(16px); }
.lpipe-memory .memory-switch:disabled { opacity: .55; cursor: not-allowed; }
.lpipe-memory .memory-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 160px), 1fr)); gap: 8px 10px; }
.lpipe-memory .memory-recollection-fields { grid-template-columns: repeat(auto-fit, minmax(min(100%, max(160px, calc(50% - 5px))), 1fr)); }
.lpipe-memory .memory-review-card { margin-bottom: 8px; }
.lpipe-memory .memory-review-row { flex-wrap: wrap; }
.lpipe-memory .memory-review-caption { flex: 1 1 130px; }
.lpipe-memory .memory-review-controls { display: flex; align-items: center; gap: 12px; margin-inline-start: auto; }
.lpipe-memory .memory-review-card > :is([role=status],[role=alert]) { flex-basis: 100%; }
.lpipe-memory .memory-review-time { display: flex; align-items: center; gap: 8px; }
.lpipe-memory .memory-review-time input { width: auto; }
.lpipe-memory .memory-recollection-fields > :first-child { grid-column: 1 / -1; }
.lpipe-memory .memory-number-label { display: grid; align-content: start; gap: 4px; font-size: 11px; font-weight: 600; color: var(--memory-muted); }
.lpipe-memory :is(input[type=number],input[type=time],input[type=text],select,textarea) { width: 100%; min-width: 0; color: var(--memory-text); background: var(--memory-soft); border: 1px solid var(--memory-strong); border-radius: var(--dsw-radius-sm); padding: 5px 8px; }
.lpipe-memory textarea { display: block; min-height: 72px; resize: vertical; }
.lpipe-memory .memory-options-foot, .lpipe-memory .memory-list-head { display: flex; align-items: center; justify-content: space-between; gap: 6px 10px; flex-wrap: wrap; }
.lpipe-memory .memory-options-foot button { margin-inline-start: auto; }
.lpipe-memory .memory-list-head { margin-top: 10px; padding: 8px 0 5px; border-top: 1px solid var(--memory-border); }
.lpipe-memory button.memory-secondary, .lpipe-memory button.memory-primary:disabled { border-color: var(--memory-border); background: var(--memory-soft); }
.lpipe-memory button.memory-primary:not(:disabled) { background: var(--memory-fill); color: var(--memory-on-accent); font-weight: 650; }
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
.lpipe-memory .memory-switch-hint { font-size: 10px; line-height: 1.45; }
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
const configOf = ({ enabled, maxEntries, maxTextLength, maxScenes, maxDescriptionLength, maxThoughts }) => ({ enabled, maxEntries, maxTextLength, ...(maxScenes === undefined ? {} : { maxScenes, maxDescriptionLength, maxThoughts }) });
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
const equalConfig = (a, b) => Object.keys(b).every(field => a[field] === b[field]);
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

function sceneOptions(section, draft) {
  for (const [field, max] of Object.entries(SCENE_LIMITS)) {
    if (!inRange(draft[field], max)) return problem('entriesRange', { limit: max }, field);
  }
  if (section.scenes.length > draft.maxScenes) return problem('existingScenes', undefined, 'maxScenes');
  for (const row of section.scenes) {
    if (lengthOf(row.description) > draft.maxDescriptionLength) return problem('existingDescription', { scene: row.scene }, 'maxDescriptionLength');
    if (row.entries.filter(e => e.kind === 'thought').length > draft.maxThoughts) return problem('existingThoughts', { scene: row.scene }, 'maxThoughts');
    if (row.entries.filter(e => e.kind === 'recollection').length > draft.maxEntries) return problem('existingSceneEntries', { scene: row.scene }, 'maxEntries');
    if (row.entries.some(entry => lengthOf(entry.text) > draft.maxTextLength)) return problem('existingSceneText', { scene: row.scene }, 'maxTextLength');
  }
  return null;
}
function configureRequest(kind, section, draft) {
  const issue = kind === R ? sceneOptions(section, draft) : checkOptions(section.entries, draft);
  return issue ?? { kind, action: 'configure', config: configOf(draft) };
}
function recollectionRequest(section, editing, name, raw) {
  const { target, action, scene, entryKind = 'recollection' } = editing;
  const isScene = target === 'scene';
  const parent = section.scenes.find(row => row.scene === scene);
  const rows = isScene ? section.scenes : parent?.entries;
  if (!rows) return problem('missingScene');
  const field = isScene ? 'scene' : 'id';
  if (!validName(name)) return problem('invalidName', undefined, field);
  const match = rows.find(row => row[field] === name);
  if (action === 'add' && match) return problem('duplicateName', undefined, field);
  if ((isScene && action === 'add' && rows.length >= section.maxScenes) || (!isScene && action !== 'remove' && rows.filter(e => e !== match && e.kind === entryKind).length >= capacity(section, entryKind))) return problem('addLimit');
  if (action !== 'add' && !match) return problem('missingRecord');
  const payload = { kind: R, scene: isScene ? name : scene, ...(isScene ? {} : { id: name }) };
  if (action === 'remove') return isScene && match.entries.length ? problem('nonemptyScene') : { ...payload, action: isScene ? 'removeScene' : 'removeEntry' };
  const text = normalize(raw), textField = isScene ? 'description' : 'text';
  const limit = isScene ? section.maxDescriptionLength : section.maxTextLength;
  if (!text) return problem('requiredText', undefined, textField);
  if (lengthOf(text) > limit) return problem('textLimit', { limit }, textField);
  return { ...payload, action: isScene ? (action === 'add' ? 'createScene' : 'updateScene') : (action === 'add' ? 'addEntry' : 'updateEntry'), [textField]: text, ...(isScene ? {} : { entryKind }) };
}

function stateOf(reply) {
  if (reply?.ok !== true) return null;
  const state = reply.state;
  if (typeof state?.allSessions !== 'boolean' || typeof state.review?.enabled !== 'boolean' || !timeValid(state.review.time)) return null;
  for (const kind of KINDS) {
    if (typeof state.sharedLists?.[kind] !== 'boolean') return null;
    const group = state[kind];
    if (kind === R) {
      if (typeof group?.enabled !== 'boolean' || !Array.isArray(group.scenes) || Object.entries(SCENE_LIMITS).some(([field, max]) => !inRange(group[field], max)) || group.scenes.length > group.maxScenes) return null;
      const names = new Set();
      for (const row of group.scenes) {
        if (!validName(row?.scene) || names.has(row.scene) || typeof row.description !== 'string' || !normalize(row.description) || lengthOf(row.description) > group.maxDescriptionLength || !Array.isArray(row.entries) || entryTypes.some(k => row.entries.filter(e => e?.kind === k).length > capacity(group, k))) return null;
        names.add(row.scene);
        const ids = new Set();
        for (const entry of row.entries) {
          if (!validName(entry?.id) || !entryTypes.includes(entry.kind) || ids.has(entry.id) || typeof entry.text !== 'string' || !normalize(entry.text) || lengthOf(entry.text) > group.maxTextLength) return null;
          ids.add(entry.id);
        }
      }
      continue;
    }
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

function matchesMutation(data, payload, before) {
  const group = data[payload.kind];
  if (payload.action === 'configure') return equalConfig(configOf(group), payload.config);
  if (payload.kind === R) {
    const scene = group.scenes.find(row => row.scene === payload.scene);
    if (payload.action.endsWith('Scene')) return payload.action === 'removeScene' ? !scene : scene?.description === payload.description;
    const entry = scene?.entries.find(row => row.id === payload.id);
    return payload.action === 'removeEntry' ? !entry : entry?.text === payload.text && entry.kind === payload.entryKind;
  }
  if (payload.action === 'add') return group.entries.some(row => row.text === payload.text && !before[payload.kind].entries.some(old => old.id === row.id));
  const entry = group.entries.find(row => row.id === payload.id);
  return payload.action === 'remove' ? !entry : entry?.text === payload.text;
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
  const [shortName, setShortName] = React.useState('');
  const [browsed, setBrowsed] = React.useState('');
  const nameField = React.useRef(null);
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
        if (recovery?.payload) {
          if (matchesMutation(data, recovery.payload, recovery.state)) {
            if (recovery.payload.action === 'createScene') setBrowsed(recovery.payload.scene);
            setEditing(null);
          } else if (recovery.editor) setEditing(recovery.editor);
        }
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
      (editing.action === 'remove' ? cancelButton.current : editing.kind === R && editing.action === 'add' ? nameField.current : field.current)?.focus();
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
  const open = (key, action, row, opener, target, scene, entryKind) => {
    if (locked) return;
    returnFocus.current = () => opener.isConnected ? opener : tabs.current[key];
    setBody((target === 'scene' ? row?.description : row?.text) ?? '');
    setShortName((target === 'scene' ? row?.scene : row?.id) ?? '');
    setEntryIssue(null);
    setEditing({ kind: key, action, row, target, scene, entryKind: row?.kind ?? entryKind });
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

  async function setScope(key, enabled, time) {
    if (write.current || uncertain) return;
    const master = key === 'allSessions', review = key === 'review';
    if (review && (!timeValid(time) || (enabled === state.review.enabled && time === state.review.time))) return;
    if (!review && !master && !state.allSessions) return;
    if (!review && enabled === (master ? state.allSessions : state.sharedLists[key])) return;
    const request = new AbortController();
    write.current = request;
    setPending({ scope: key });
    setScopeFeedback(null);
    try {
      const reply = await rpcCall(review ? 'memory.setReview' : 'memory.setScope', review ? { enabled, time } : master ? enabled : { kind: key, enabled }, request.signal);
      if (!mounted.current || request.signal.aborted) return;
      const failure = mutationProblem(reply);
      if (failure) {
        if (failure.uncertain) setUncertain('scope');
        else setScopeFeedback({ key, issue: failure.issue });
        return;
      }
      const next = stateOf(reply);
      if (!next || (review ? next.review.enabled !== enabled || next.review.time !== time : (master ? next.allSessions : next.sharedLists[key]) !== enabled)) throw new Error('Invalid memory scope');
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
        if (failure.uncertain) { scopeRecovery.current = { payload, editor: editing, state, drafts }; setUncertain(true); }
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
        const focusKey = editing?.target === 'entry' ? `${editing.entryKind}-entry` : key;
        const opener = returnFocus.current;
        returnFocus.current = () => { const el = opener?.(); return el?.isConnected && !el.disabled && el !== tabs.current[key] ? el : addButtons.current[focusKey] && !addButtons.current[focusKey].disabled ? addButtons.current[focusKey] : tabs.current[key]; };
        setEditing(null);
      }
      if (action === 'createScene') setBrowsed(payload.scene);
      const labels = key !== R ? LABELS[key] : action.endsWith('Scene') ? sceneLabels : recordLabels;
      setNotice({ kind: key, configure, ...problem(configure ? labels.configured : action.startsWith('remove') ? labels.removed : labels.saved) });
    } catch {
      // The request may have committed. Reload before allowing a second add or write.
      if (!mounted.current || request.signal.aborted) return;
      scopeRecovery.current = { payload, editor: editing, state, drafts };
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
    const payload = editing.kind === R ? recollectionRequest(state[R], editing, shortName, body) : entryRequest(editing.kind, editing.action, state[editing.kind], editing.row?.id, body);
    if (payload.key) { setEntryIssue(payload); (['scene', 'id'].includes(payload.field) ? nameField.current : field.current)?.focus(); }
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
  const scopeRow = (key, label, hint, checked, disabled) => {
    const id = key === 'allSessions' ? `${uid}-scope` : `${uid}-${key}-scope`;
    const saving = pending?.scope === key;
    return h('div', { id, className: 'memory-scope', 'aria-busy': saving },
      h('label', { className: 'memory-switch-row' },
        h('span', null,
          h('span', { id: `${id}-label`, className: 'memory-switch-label' }, t(label)),
          h('span', { id: `${id}-hint`, className: 'memory-note memory-switch-hint' }, t(hint))),
        h('input', { type: 'checkbox', role: 'switch', className: 'memory-switch',
          'aria-labelledby': `${id}-label`, 'aria-describedby': `${id}-hint`, checked, disabled: locked || disabled,
          onChange: event => void setScope(key, event.currentTarget.checked, key === 'review' ? state.review.time : undefined),
        })),
      h('p', { role: 'status', className: 'memory-note' }, saving ? t('saving') : null),
      errorView(scopeFeedback?.key === key && scopeFeedback.issue));
  };
  const showScenes = (section, feedback) => {
    const scene = section.scenes.find(row => row.scene === browsed) ?? section.scenes[0];
    const command = (label, action, target, row, props = {}, entryKind) => button(t(label), { className: 'memory-secondary', disabled: locked,
      onClick: event => open(R, action, row, event.currentTarget, target, scene?.scene, entryKind), ...props });
    return h(React.Fragment, null,
      h('div', { className: 'memory-list-head' }, h('span', { className: 'memory-note' }, t('countScenes', { count: section.scenes.length, limit: section.maxScenes })),
        command('addScene','add','scene',null,{ disabled: locked || section.scenes.length >= section.maxScenes, ref: node => { addButtons.current[R] = node; } })),
      h('p', { className: 'memory-note memory-list-status', role: 'status' }, feedback && !feedback.configure ? textOf(t,feedback) : null),
      !scene ? h('p', { className: 'memory-note' }, t('emptyScenes')) : h(React.Fragment, null,
        h('label', { className: 'memory-number-label' }, t('browseScene'), h('select', { value: scene.scene, disabled: locked, onChange: e => { setBrowsed(e.currentTarget.value); setNotice(null); } }, section.scenes.map(row => h('option', { key: row.scene, value: row.scene }, row.scene)))),
        h('p', { className: 'memory-entry' }, scene.description),
        h('div', { className: 'memory-actions' }, command('editScene','update','scene',scene), command('removeScene','remove','scene',scene,{ disabled: locked || Boolean(scene.entries.length), title: scene.entries.length ? t('nonemptyScene') : undefined })),
        entryTypes.map(kind => {
          const thought = kind === 'thought', rows = scene.entries.filter(row => row.kind === kind), limit = capacity(section, kind);
          return h('section', { key: kind }, h('div', { className: 'memory-list-head' }, h('span', { className: 'memory-note' }, t(thought ? 'countThoughts' : 'countRecollections', { count: rows.length, limit })), command(thought ? 'addThought' : 'addRecollection','add','entry',null,{ disabled: locked || rows.length >= limit, ref: node => { addButtons.current[kind + '-entry'] = node; } }, kind)),
            h('ul', { 'aria-label': t(thought ? 'thoughts' : 'recollections') }, rows.map(row => h('li', { key: row.id }, h('div', { className: 'memory-entry' }, h('strong', null, row.id), h('div', null, row.text)), h('span', { className: 'memory-actions' }, command('edit','update','entry',row,{ 'aria-label': t('entryAction',{ action:t('edit'), text:row.id }) }),command('removeSettingAction','remove','entry',row,{ 'aria-label': t('entryAction',{ action:t('removeSettingAction'), text:row.id }) }))))),
            !rows.length && h('p', { className: 'memory-note' }, t(thought ? 'emptyThoughts' : 'emptyRecollections')));
        })));
  };
  const showPanel = key => {
    const section = state[key], draft = drafts[key], labels = key === R ? recordLabels : LABELS[key], issue = optionIssues[key];
    const limits = key === R ? SCENE_LIMITS : LIMITS;
    const issueId = `${uid}-${key}-error`;
    const dirty = !equalConfig(draft, configOf(section));
    const draftIssue = dirty ? (key === R ? sceneOptions(section, draft) : checkOptions(section.entries, draft)) : null;
    const optionIssue = issue ?? draftIssue;
    const feedback = notice?.kind === key ? notice : null;
    const full = key !== R && section.entries.length >= section.maxEntries;
    const inputError = name => optionIssue?.field === name ? { 'aria-invalid': true, 'aria-describedby': issueId } : {};
    const number = name => h('label', { key: name, className: 'memory-number-label' }, t(key === R && name === 'maxEntries' ? 'maxSceneEntries' : name), h('input', {
      ref: node => { inputs.current[`${key}-${name}`] = node; }, type: 'number', name, min: 1, max: limits[name], step: 1, required: true,
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
        scopeRow(key, `${key}Scope`, state.allSessions ? 'listScopeHint' : 'scopeOffHint', state.sharedLists[key], !state.allSessions),
        h('div', { className: key === R ? 'memory-fields memory-recollection-fields' : 'memory-fields' }, Object.keys(limits).map(number)),
        errorView(optionIssue, issueId),
        h('div', { className: 'memory-options-foot' },
          h('div', null,
            !section.enabled && h('p', { className: 'memory-note' }, t('disabled')),
            h('p', { className: 'memory-note', role: 'status' }, dirty ? t('unsaved') : feedback?.configure ? textOf(t, feedback) : null)),
          button(t(pending?.configure && pending.key === key ? 'saving' : 'saveOptions'), { type: 'submit', className: 'memory-primary', disabled: locked || !dirty || Boolean(draftIssue) }))),
      key === R ? showScenes(section, feedback) : h(React.Fragment, null, h('div', { className: 'memory-list-head' },
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
      !section.entries.length && h('p', { className: 'memory-note memory-empty' }, t(labels.empty))));
  };
  const renderDialog = () => {
    const isScene = editing?.target === 'scene';
    const labels = editing && (editing.kind === R ? (isScene ? sceneLabels : recordLabels) : LABELS[editing.kind]);
    const removing = editing?.action === 'remove';
    const title = editing?.target === 'entry' ? ({ add: 'addSceneEntry', update: 'editSceneEntry', remove: 'removeSceneEntry' })[editing.action] : labels?.[editing.action === 'update' ? 'edit' : editing.action];
    const issueId = `${uid}-entry-error`, countId = `${uid}-entry-count`;
    return h('dialog', { ref: dialog, className: 'lpipe-memory-dialog', 'aria-labelledby': `${uid}-editor-title`,
      onCancel: event => { event.preventDefault(); close(); } },
    editing && h('form', { onSubmit: saveEntry, noValidate: true },
      h('h4', { id: `${uid}-editor-title` }, t(title)),
      removing ? h('p', null, t(editing?.target === 'entry' ? 'confirmSceneEntry' : labels.confirm, { text: editing.kind === R ? shortName : editing.row.text })) : h(React.Fragment, null,
        editing.kind === R && h('label', { className: 'memory-number-label' }, t(isScene ? 'sceneName' : 'entryName'), h('input', { type: 'text', ref: nameField, value: shortName, maxLength: 32, readOnly: editing.action !== 'add', disabled: locked, 'aria-invalid': ['scene','id'].includes(entryIssue?.field) || undefined, 'aria-describedby': entryIssue ? issueId : undefined, onChange: e => { setShortName(e.currentTarget.value); setEntryIssue(null); } })),
        editing.target === 'entry' && h('label', { className: 'memory-number-label' }, t('entryKind'), h('select', { value: editing.entryKind, disabled: locked, onChange: e => { setEditing({ ...editing, entryKind: e.currentTarget.value }); setEntryIssue(null); } }, entryTypes.map(k => h('option', { key:k, value:k }, t(k))))),
        h('label', { htmlFor: `${uid}-entry-text` }, t(isScene ? 'sceneDescription' : 'body')),
        h('textarea', { id: `${uid}-entry-text`, ref: field, value: body, required: true, disabled: locked,
          'aria-invalid': entryIssue?.field === (isScene ? 'description' : 'text') || undefined, 'aria-describedby': entryIssue ? `${countId} ${issueId}` : countId,
          onChange: event => { setBody(event.currentTarget.value); setEntryIssue(null); } }),
        h('p', { id: countId, className: 'memory-note' }, t('charCount', { count: lengthOf(body), limit: isScene ? state[R].maxDescriptionLength : state[editing.kind].maxTextLength }))),
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
      h('p', { className: 'memory-note' }, t(state?.allSessions && state.sharedLists[kind] ? 'allSessions' : 'mainOnly'))),
    state && drafts && h('section', { className: 'memory-card memory-review-card', 'aria-labelledby': `${uid}-review-scope-label` },
      h('div', { className: 'memory-switch-row memory-review-row' },
        h('label', { htmlFor: `${uid}-review-switch`, className: 'memory-review-caption' },
        h('span', { id: `${uid}-review-scope-label`, className: 'memory-switch-label' }, t('enableReview')),
        h('span', { id: `${uid}-review-hint`, className: 'memory-note memory-switch-hint' }, t('mainOnly'))),
      h('div', { className: 'memory-review-controls' },
        h('label', { className: 'memory-number-label memory-review-time', title: t('reviewHint') }, t('reviewTime'), h('input', { type: 'time', value: state.review.time, disabled: locked, onChange: e => void setScope('review', state.review.enabled, e.currentTarget.value) })),
        h('input', { id: `${uid}-review-switch`, type: 'checkbox', role: 'switch', className: 'memory-switch', 'aria-labelledby': `${uid}-review-scope-label`, 'aria-describedby': `${uid}-review-hint`, checked: state.review.enabled, disabled: locked, onChange: e => void setScope('review', e.currentTarget.checked, state.review.time) }))),
      pending?.scope === 'review' && h('p', { role: 'status', className: 'memory-note' }, t('saving')),
      errorView(scopeFeedback?.key === 'review' && scopeFeedback.issue)),
    h('div', { className: 'memory-card' }, state && drafts ? h(React.Fragment, null,
      scopeRow('allSessions', 'allSessions', 'scopeHint', state.allSessions, false),
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
    return module.exports;
  }
});
