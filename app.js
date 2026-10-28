const RULES_URL = 'https://www.trisportsnc.com/_files/ugd/a303f8_8175c2f662cb451a820b0e9925bddfe0.pdf';
const STORAGE_KEY = 'trisports-kickball-lineup-v1';
const BACKUP_KEY = 'trisports-kickball-lineup-before-import-v1';
const INFIELD = ['P', 'C', '1B', '2B', 'SS', '3B'];
const OUTFIELD = { four: ['LF', 'LCF', 'RCF', 'RF'], rover: ['LF', 'CF', 'RF', 'ROV'] };
const POSITIONS = {
  P: [50, 67], C: [50, 91], '1B': [71, 69], '2B': [62, 52], SS: [38, 52], '3B': [29, 69],
  LF: [17, 25], LCF: [39, 19], RCF: [62, 19], RF: [84, 25], CF: [50, 18], ROV: [78, 45]
};
const samplePlayers = [
  ['Maya', 'W'], ['Jordan', 'M'], ['Sam', 'M'], ['Avery', 'W'],
  ['Chris', 'M'], ['Taylor', 'W'], ['Drew', 'M'], ['Morgan', 'W'],
  ['Casey', 'M'], ['Riley', 'W'], ['Jamie', 'M'], ['Alex', 'M']
].map(([name, gender], index) => ({ id: `sample-${index}`, name, gender, active: true }));
const sampleOrder = [1, 2, 0, 4, 3, 6, 8, 5, 10, 7, 11, 9].map(index => `sample-${index}`);
const sampleField = { P: 'sample-1', C: 'sample-0', '1B': 'sample-2', '2B': 'sample-3', SS: 'sample-4', '3B': 'sample-5', LF: 'sample-6', LCF: 'sample-7', RCF: 'sample-8', RF: 'sample-9' };
function sampleState() {
  return {
    players: structuredClone(samplePlayers), order: [...sampleOrder],
    rotations: { M: sampleOrder.filter(id => samplePlayers.find(p => p.id === id)?.gender === 'M'), W: sampleOrder.filter(id => samplePlayers.find(p => p.id === id)?.gender === 'W') },
    fields: { four: { ...sampleField }, rover: { ...sampleField, CF: sampleField.LCF, ROV: sampleField.RCF, LCF: undefined, RCF: undefined } },
    fieldRotations: { four: [], rover: [] }, previewInning: { four: 1, rover: 1 },
    formation: 'four', selected: null, sample: true
  };
}
let state;
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
  state = saved && Array.isArray(saved.players) && saved.fields ? { ...saved, selected: null } : sampleState();
} catch { state = sampleState(); }
if (!state.rotations) state.rotations = {
  M: state.order.filter(id => state.players.find(p => p.id === id)?.gender === 'M'),
  W: state.order.filter(id => state.players.find(p => p.id === id)?.gender === 'W')
};
if (!state.fieldRotations) state.fieldRotations = { four: [], rover: [] };
if (!state.previewInning) state.previewInning = { four: 1, rover: 1 };
const app = document.getElementById('app');
let message = '';
let drag = null;
let draftGroup = null;

const player = id => state.players.find(p => p.id === id);
const activePlayers = () => state.players.filter(p => p.active);
const activeIds = () => new Set(activePlayers().map(p => p.id));
const usesSplitRotation = () => {
  const active = activePlayers();
  const women = active.filter(p => p.gender === 'W').length;
  return women > 0 && active.length - women > women * 2;
};
function generatedKicks(count = 30) {
  const men = state.rotations.M.filter(id => player(id)?.active && player(id)?.gender === 'M');
  const women = state.rotations.W.filter(id => player(id)?.active && player(id)?.gender === 'W');
  if (!men.length || !women.length) return [];
  return Array.from({ length: count }, (_, index) => {
    const phase = index % 3;
    const turn = Math.floor(index / 3);
    return phase === 1 ? women[turn % women.length] : men[(turn * 2 + (phase === 2 ? 1 : 0)) % men.length];
  });
}
function syncRotationsFromOrder() {
  state.rotations.M = state.order.filter(id => player(id)?.active && player(id)?.gender === 'M');
  state.rotations.W = state.order.filter(id => player(id)?.active && player(id)?.gender === 'W');
}
const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const genderName = gender => gender === 'W' ? 'Woman' : 'Man';
const initials = name => name.trim().split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase();
function save() {
  const { selected, ...data } = state;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
function lineupDocument() {
  const { selected, ...lineup } = state;
  return { format: 'kickball-lineup', version: 1, exportedAt: new Date().toISOString(), lineup };
}
function parseLineupDocument(text) {
  let documentData;
  try { documentData = JSON.parse(text); } catch { throw new Error('This is not a valid JSON lineup file.'); }
  if (documentData?.format !== 'kickball-lineup' || documentData.version !== 1) throw new Error('Choose a lineup file exported from this app.');
  const data = documentData.lineup;
  if (!data || !Array.isArray(data.players) || data.players.length > 200 || !Array.isArray(data.order) || !data.fields || !data.rotations || !data.fieldRotations) throw new Error('The lineup file is missing required data.');
  const ids = new Set();
  for (const p of data.players) {
    if (!p || typeof p.id !== 'string' || !p.id || p.id.length > 100 || ids.has(p.id) || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 32 || !['M', 'W'].includes(p.gender) || typeof p.active !== 'boolean') throw new Error('The lineup file has an invalid player roster.');
    ids.add(p.id);
  }
  const validList = list => Array.isArray(list) && list.length <= ids.size && list.every(id => typeof id === 'string' && ids.has(id)) && new Set(list).size === list.length;
  if (!validList(data.order) || !validList(data.rotations.M) || !validList(data.rotations.W)) throw new Error('The lineup file has an invalid kicking order.');
  if (data.rotations.M.some(id => data.players.find(p => p.id === id).gender !== 'M') || data.rotations.W.some(id => data.players.find(p => p.id === id).gender !== 'W')) throw new Error('The lineup file has a player in the wrong kicking rotation.');
  for (const formation of ['four', 'rover']) {
    const allowed = new Set([...INFIELD, ...OUTFIELD[formation]]);
    const field = data.fields[formation];
    const groups = data.fieldRotations[formation];
    if (!field || typeof field !== 'object' || Array.isArray(field) || !Array.isArray(groups) || groups.length > 20) throw new Error('The lineup file has invalid defensive data.');
    if (Object.entries(field).some(([pos, id]) => !allowed.has(pos) || (id != null && !ids.has(id)))) throw new Error('The lineup file has an invalid field position.');
    const groupIds = new Set();
    for (const group of groups) {
      if (!group || typeof group.id !== 'string' || !group.id || groupIds.has(group.id) || typeof group.name !== 'string' || group.name.length > 80 || !Array.isArray(group.slots) || !Array.isArray(group.members) || group.slots.length > allowed.size || group.members.length > ids.size || new Set(group.slots).size !== group.slots.length || new Set(group.members).size !== group.members.length || group.slots.some(pos => !allowed.has(pos)) || group.members.some(id => !ids.has(id))) throw new Error('The lineup file has an invalid field rotation.');
      groupIds.add(group.id);
    }
  }
  if (!['four', 'rover'].includes(data.formation)) throw new Error('The lineup file has an invalid defense selection.');
  const previewInning = { four: 1, rover: 1 };
  for (const formation of ['four', 'rover']) {
    const inning = data.previewInning?.[formation];
    if (Number.isInteger(inning) && inning >= 1 && inning <= 7) previewInning[formation] = inning;
  }
  return { players: data.players, order: data.order, rotations: { M: data.rotations.M, W: data.rotations.W }, fields: { four: data.fields.four, rover: data.fields.rover }, fieldRotations: { four: data.fieldRotations.four, rover: data.fieldRotations.rover }, previewInning, formation: data.formation, selected: null, sample: Boolean(data.sample) };
}
function exportLineup() {
  const blob = new Blob([JSON.stringify(lineupDocument(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `kickball-lineup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}
async function importLineup(file) {
  if (!file) return;
  if (file.size > 1024 * 1024) return notify('That lineup file is too large.');
  try {
    const imported = parseLineupDocument(await file.text());
    localStorage.setItem(BACKUP_KEY, JSON.stringify(lineupDocument()));
    state = imported;
    draftGroup = null;
    update();
    notify(`Imported ${state.players.length} players. Undo import is available above.`);
  } catch (error) { notify(error.message || 'Could not import this lineup.'); }
}
function undoImport() {
  try {
    const previous = parseLineupDocument(localStorage.getItem(BACKUP_KEY));
    state = previous;
    draftGroup = null;
    localStorage.removeItem(BACKUP_KEY);
    update();
    notify('Restored the lineup from before import.');
  } catch { notify('Could not restore the previous lineup.'); }
}
function notify(text) { message = text; render(); window.clearTimeout(notify.timer); notify.timer = window.setTimeout(() => { message = ''; render(); }, 3400); }
function update() { save(); render(); }
function fieldForInning(formation, inning = 1) {
  const field = { ...state.fields[formation] };
  for (const group of state.fieldRotations[formation]) {
    if (!group.slots?.length || !group.members?.length) continue;
    group.slots.forEach((pos, index) => { field[pos] = group.members[((inning - 1) + index) % group.members.length]; });
  }
  return field;
}
function groupSetupIssues(formation) {
  const issues = [];
  const occupiedSlots = new Set();
  const occupiedPlayers = new Set();
  for (const group of state.fieldRotations[formation]) {
    const name = group.name || group.slots.join(' + ');
    if (!group.slots?.length || group.members.length <= group.slots.length) issues.push(`${name}: add more players than field spots.`);
    for (const pos of group.slots) {
      if (occupiedSlots.has(pos)) issues.push(`${name}: ${pos} is in another rotation group.`);
      occupiedSlots.add(pos);
    }
    for (const id of group.members) {
      if (!player(id)?.active) issues.push(`${name}: remove an unavailable player.`);
      if (occupiedPlayers.has(id)) issues.push(`${name}: a player is in another rotation group.`);
      occupiedPlayers.add(id);
      const outside = Object.keys(state.fields[formation]).find(pos => state.fields[formation][pos] === id && !group.slots.includes(pos));
      if (outside) issues.push(`${name}: ${player(id)?.name || 'A player'} is already assigned to ${outside}.`);
    }
  }
  return [...new Set(issues)];
}
function fieldReport(formation, inning = 1) {
  const field = fieldForInning(formation, inning);
  const ids = [...INFIELD, ...OUTFIELD[formation]].map(pos => field[pos]).filter(Boolean);
  const women = ids.filter(id => player(id)?.gender === 'W').length;
  const infield = INFIELD.filter(pos => field[pos]).length;
  const outfield = OUTFIELD[formation].filter(pos => field[pos]).length;
  const issues = [];
  if (infield !== 6) issues.push(`Fill all 6 infield spots (${infield}/6).`);
  if (ids.length < 9) issues.push(`Field at least 9 players (${ids.length}/9).`);
  if (ids.length === 9 && women < 3) issues.push(`A 9-player defense needs at least 3 women (${women}/3).`);
  if (ids.length === 10 && women < 4) issues.push(`A 10-player defense needs at least 4 women (${women}/4).`);
  if (ids.length === 9 && outfield !== 3) issues.push('A 9-player defense uses 3 outfield spots.');
  if (ids.length === 10 && outfield !== 4) issues.push('A 10-player defense uses 4 outfield spots.');
  const missing = ids.filter(id => !activeIds().has(id));
  if (missing.length) issues.push('Remove unavailable players from the field.');
  return { ids, women, issues, ready: issues.length === 0 };
}
function orderReport() {
  const active = activePlayers();
  const activeMen = active.filter(p => p.gender === 'M').length;
  const activeWomen = active.length - activeMen;
  if (usesSplitRotation()) {
    const men = state.rotations.M.filter(id => player(id)?.active && player(id)?.gender === 'M');
    const women = state.rotations.W.filter(id => player(id)?.active && player(id)?.gender === 'W');
    const missingMen = active.filter(p => p.gender === 'M' && !men.includes(p.id));
    const missingWomen = active.filter(p => p.gender === 'W' && !women.includes(p.id));
    const issues = [];
    if (missingMen.length) issues.push(`Add ${missingMen.length} ${missingMen.length === 1 ? 'man' : 'men'} to the men's rotation.`);
    if (missingWomen.length) issues.push(`Add ${missingWomen.length} ${missingWomen.length === 1 ? 'woman' : 'women'} to the women's rotation.`);
    return { men: activeMen, women: activeWomen, issues, ready: active.length >= 9 && issues.length === 0, missing: [...missingMen, ...missingWomen], split: true };
  }
  const ids = state.order.filter(id => player(id)?.active);
  const men = ids.filter(id => player(id)?.gender === 'M').length;
  const women = ids.length - men;
  const issues = [];
  const missing = active.filter(p => !ids.includes(p.id));
  if (missing.length) issues.push(`Add every available player to the kicking order (${missing.length} missing).`);
  if (ids.length >= 3 && ids.some((id, i) => [0, 1, 2].every(offset => player(ids[(i + offset) % ids.length])?.gender === 'M'))) {
    issues.push('Three men would kick in a row, including when the order loops.');
  }
  if (!missing.length && ids.length >= 2) {
    const adjacentSame = ids.filter((id, i) => player(id)?.gender === player(ids[(i + 1) % ids.length])?.gender).length;
    const minimum = Math.abs(men - women);
    if (adjacentSame > minimum) issues.push(`Alternate women and men wherever possible (${adjacentSame - minimum} avoidable same-gender pair${adjacentSame - minimum === 1 ? '' : 's'}).`);
  }
  if (active.length && women === 0) issues.push('Add women to the roster to make a legal kicking order.');
  return { men, women, issues, ready: active.length >= 9 && issues.length === 0, missing };
}
function status() {
  function formationStatus(formation) {
    const current = fieldReport(formation, state.previewInning[formation]);
    const setupIssues = groupSetupIssues(formation);
    const reports = state.fieldRotations[formation].length ? Array.from({ length: 7 }, (_, index) => fieldReport(formation, index + 1)) : [fieldReport(formation, 1)];
    const laterIssues = reports.flatMap((report, index) => index + 1 === state.previewInning[formation] ? [] : report.issues.map(issue => `Inning ${index + 1}: ${issue}`));
    return { ...current, ready: current.ready && reports.every(report => report.ready) && !setupIssues.length, issues: [...new Set([...current.issues, ...laterIssues, ...setupIssues])], inningReports: reports };
  }
  const four = formationStatus('four');
  const rover = formationStatus('rover');
  const order = orderReport();
  return { four, rover, order, ready: four.ready && rover.ready && order.ready };
}
function labelStatus(ready, incomplete) { return ready ? 'Ready' : incomplete ? 'Needs players' : 'Needs fixes'; }
function playerChip(p, source, extra = '') {
  return `<span class="player-chip ${p.gender === 'W' ? 'woman' : 'man'} ${state.selected === p.id ? 'selected' : ''} draggable="true" data-drag-id="${esc(p.id)}" data-source="${source}" ${extra} tabindex="0" role="button" aria-label="${esc(p.name)}, ${genderName(p.gender)}. Select to place."><span class="avatar">${esc(initials(p.name))}</span><span class="chip-name">${esc(p.name)}</span><span class="gender-dot" aria-label="${genderName(p.gender)}">${p.gender}</span></span>`;
}
function fieldSlot(pos) {
  const id = fieldForInning(state.formation, state.previewInning[state.formation])[pos];
  const p = player(id);
  const [x, y] = POSITIONS[pos];
  return `<div class="field-slot drop-target ${p ? 'occupied' : ''}" style="--x:${x}%;--y:${y}%" data-drop="field" data-pos="${pos}" tabindex="0" role="button" aria-label="${pos}: ${p ? p.name : 'empty'}. ${state.selected ? 'Place selected player' : 'Select a player then choose this position'}"><div class="position-tag">${pos === 'ROV' ? 'Rover' : pos}</div>${p ? playerChip(p, 'field') : '<span class="empty-person">+</span>'}</div>`;
}
function groupCard(group) {
  const name = group.name || group.slots.join(' + ');
  const rows = Array.from({ length: Math.min(7, Math.max(group.members.length, 1)) }, (_, index) => index + 1).map(inning => {
    const fielders = group.slots.map((pos, index) => `${pos} ${player(group.members[((inning - 1) + index) % group.members.length])?.name || 'Open'}`);
    const playing = new Set(group.slots.map((_, index) => group.members[((inning - 1) + index) % group.members.length]));
    const sitting = group.members.filter(id => !playing.has(id)).map(id => player(id)?.name || 'Unknown');
    return `<div class="group-inning"><b>${inning}</b><span>${esc(fielders.join(' · '))}</span><small>Bench: ${esc(sitting.join(', ') || 'none')}</small></div>`;
  }).join('');
  return `<article class="rotation-card"><div class="rotation-card-top"><div><h4>${esc(name)}</h4><p>${esc(group.slots.join(' + '))} · ${group.members.length} players for ${group.slots.length} ${group.slots.length === 1 ? 'spot' : 'spots'}</p></div><div class="rotation-card-actions"><button data-edit-group="${esc(group.id)}" aria-label="Edit ${esc(name)}">Edit</button><button data-delete-group="${esc(group.id)}" aria-label="Delete ${esc(name)}">×</button></div></div><div class="group-schedule">${rows}</div></article>`;
}
function groupBuilder() {
  if (!draftGroup || draftGroup.formation !== state.formation) return '';
  const formation = state.formation;
  const blockedSlots = new Set(state.fieldRotations[formation].filter(group => group.id !== draftGroup.id).flatMap(group => group.slots));
  const blockedPlayers = new Set(state.fieldRotations[formation].filter(group => group.id !== draftGroup.id).flatMap(group => group.members));
  const fieldIds = new Set(Object.values(state.fields[formation]).filter(Boolean));
  const bench = state.players.filter(p => (p.active || draftGroup.members.includes(p.id)) && !fieldIds.has(p.id) && !blockedPlayers.has(p.id));
  const firstPlayers = draftGroup.slots.map(pos => state.fields[formation][pos]).filter(Boolean);
  const extras = draftGroup.members.filter(id => !firstPlayers.includes(id));
  const valid = draftGroup.slots.length > 0 && draftGroup.slots.every(pos => state.fields[formation][pos]) && draftGroup.members.length > draftGroup.slots.length && draftGroup.members.every(id => player(id)?.active);
  return `<div class="group-builder" id="group-builder"><div class="builder-head"><div><h4>${draftGroup.editing ? 'Edit rotation group' : 'New rotation group'}</h4><p>Keep the current field as inning 1. Select the spots, then add bench players.</p></div><button id="cancel-group" aria-label="Cancel rotation group">×</button></div><label class="group-name-label" for="group-name">Group name <span>optional</span></label><input id="group-name" value="${esc(draftGroup.name)}" placeholder="Example: Center field"><div class="builder-step"><strong>1. Field spots</strong><div class="choice-grid">${[...INFIELD, ...OUTFIELD[formation]].map(pos => {
    const id = state.fields[formation][pos];
    return `<button class="choice ${draftGroup.slots.includes(pos) ? 'chosen' : ''}" data-group-slot="${pos}" ${(!id && !draftGroup.slots.includes(pos)) || blockedSlots.has(pos) || (id && blockedPlayers.has(id)) ? 'disabled' : ''}><b>${pos === 'ROV' ? 'Rover' : pos}</b><span>${esc(player(id)?.name || 'Empty')}</span></button>`;
  }).join('')}</div></div><div class="builder-step"><strong>2. Add players from the bench</strong><div class="choice-grid bench-choices">${bench.length ? bench.map(p => `<button class="choice ${draftGroup.members.includes(p.id) ? 'chosen' : ''}" data-group-member="${esc(p.id)}"><b>${esc(p.name)}</b><span>${p.active ? genderName(p.gender) : 'Unavailable'}</span></button>`).join('') : '<p class="builder-empty">No available bench players. Add someone to the roster first.</p>'}</div></div><div class="group-start"><strong>Inning 1</strong><span>${draftGroup.slots.map(pos => `${pos}: ${esc(player(state.fields[formation][pos])?.name || 'Open')}`).join(' · ') || 'Choose a field spot'}</span></div>${extras.length > 1 ? `<div class="extra-order"><strong>Bench rotation order</strong>${extras.map((id, index) => `<div><span>${esc(player(id)?.name || 'Unknown')}</span><button data-extra-move="${esc(id)}" data-direction="up" ${index === 0 ? 'disabled' : ''} aria-label="Move ${esc(player(id)?.name || 'player')} up">↑</button><button data-extra-move="${esc(id)}" data-direction="down" ${index === extras.length - 1 ? 'disabled' : ''} aria-label="Move ${esc(player(id)?.name || 'player')} down">↓</button></div>`).join('')}</div>` : ''}<div class="builder-footer"><p>${valid ? `${draftGroup.members.length} players will share ${draftGroup.slots.length} ${draftGroup.slots.length === 1 ? 'spot' : 'spots'} over seven innings.` : 'Choose at least one field spot and more players than spots.'}</p><button id="save-group" ${valid ? '' : 'disabled'}>Save rotation</button></div></div>`;
}
function fieldRotationPanel() {
  const groups = state.fieldRotations[state.formation];
  return `<div class="field-rotations"><div class="field-rotations-head"><div><h3>Field rotations</h3><p>Group players who share one or more spots across innings.</p></div><button id="new-group" ${state.previewInning[state.formation] !== 1 ? 'disabled' : ''}>+ Add group</button></div>${groups.length ? `<div class="rotation-cards">${groups.map(groupCard).join('')}</div>` : '<p class="rotation-empty">No rotation groups yet. Start with a field spot and add players from the bench.</p>'}${groupBuilder()}</div>`;
}
function reportMarkup(report, formation) {
  const label = formation === 'four' ? '4 outfielders' : 'Rover';
  return `<div class="check-row ${report.ready ? 'good' : 'warn'}"><span class="check-icon">${report.ready ? '✓' : '!'}</span><span><strong>${label}</strong><small>${report.ids.length} on field · ${report.women} women</small></span><b>${labelStatus(report.ready, report.ids.length < 9)}</b></div>`;
}
function orderRows(ids, lane = '') {
  return ids.map((id, index) => {
    const p = player(id);
    if (!p) return '';
    return `<div class="order-row drop-target" data-drop="${lane ? 'rotation-item' : 'order-item'}" data-lane="${lane}" data-index="${index}"><span class="order-number">${String(index + 1).padStart(2, '0')}</span>${playerChip(p, lane ? `rotation-${lane}` : 'order')}<button class="order-move" data-move="${esc(id)}" data-direction="up" data-lane="${lane}" aria-label="Move ${esc(p.name)} up" ${index === 0 ? 'disabled' : ''}>↑</button><button class="order-move" data-move="${esc(id)}" data-direction="down" data-lane="${lane}" aria-label="Move ${esc(p.name)} down" ${index === ids.length - 1 ? 'disabled' : ''}>↓</button><button class="remove-order" data-remove-order="${esc(id)}" data-lane="${lane}" aria-label="Remove ${esc(p.name)} from ${lane ? `${genderName(lane)} rotation` : 'kicking order'}">×</button></div>`;
  }).join('');
}
function orderPanel(active, report) {
  if (report.split) {
    const men = state.rotations.M.filter(id => player(id)?.active && player(id)?.gender === 'M');
    const women = state.rotations.W.filter(id => player(id)?.active && player(id)?.gender === 'W');
    const preview = generatedKicks(30);
    return `<section class="order-panel panel split-order"><div class="panel-heading"><div><h2>Kicking order</h2><p>Two repeating rotations · starts man, woman, man</p></div><span class="count-pill">${men.length + women.length}/${active.length}</span></div><div class="rotation-explain">Each list stays in order and loops independently. Women can kick again before every man has kicked. The order starts M/W/M, then keeps two men between women.</div><button id="add-selected" class="add-selected" ${state.selected && !state.rotations[player(state.selected)?.gender]?.includes(state.selected) ? '' : 'disabled'}>Add selected player to ${state.selected ? (player(state.selected)?.gender === 'W' ? "women's" : "men's") : 'rotation'}</button><div class="rotation-lanes"><div class="rotation-lane"><div class="subheading"><h3>Men's rotation</h3><span>${men.length}</span></div><div class="rotation-list drop-target" data-drop="rotation" data-lane="M">${orderRows(men, 'M') || '<div class="order-empty">Drop men here</div>'}</div></div><div class="rotation-lane"><div class="subheading"><h3>Women's rotation</h3><span>${women.length}</span></div><div class="rotation-list drop-target" data-drop="rotation" data-lane="W">${orderRows(women, 'W') || '<div class="order-empty">Drop women here</div>'}</div></div></div><div class="sequence-preview"><div class="subheading"><h3>Next 30 kicks · read down each column</h3></div><div class="preview-grid">${preview.map((id, i) => `<div class="preview-kick ${player(id)?.gender === 'W' ? 'woman' : 'man'}"><b>${i + 1}</b><span>${esc(player(id)?.name || '')}</span></div>`).join('')}</div></div><div class="order-footer"><button id="fill-order" class="quiet-button">Add missing players</button><span>Rotations continue from kick 30</span></div></section>`;
  }
  return `<section class="order-panel panel"><div class="panel-heading"><div><h2>Kicking order</h2><p>Every available player kicks</p></div><span class="count-pill">${state.order.length}/${active.length}</span></div><button id="add-selected" class="add-selected" ${state.selected && !state.order.includes(state.selected) ? '' : 'disabled'}>Add selected player to order</button><div class="order-list drop-target" data-drop="order">${orderRows(state.order) || '<div class="order-empty">Drag a player here, or select one from the roster.</div>'}</div><div class="order-footer"><button id="fill-order" class="quiet-button">Add missing players</button><span>Order wraps back to #1</span></div></section>`;
}
function printDefense(formation) {
  const field = fieldForInning(formation, 1);
  const groups = state.fieldRotations[formation];
  const slots = [...INFIELD, ...OUTFIELD[formation]].map(pos => {
    const [x, y] = POSITIONS[pos];
    const group = groups.find(item => item.slots.includes(pos));
    const extras = group?.members.slice(group.slots.length).map(id => player(id)?.name).filter(Boolean) || [];
    return `<div class="print-field-slot" style="--x:${x}%;--y:${y}%"><strong>${pos === 'ROV' ? 'Rover' : pos}</strong><span>${esc(player(field[pos])?.name || 'Open')}</span>${extras.length ? `<small>Rotates: ${esc(extras.join(', '))}</small>` : ''}</div>`;
  }).join('');
  const rotationNotes = groups.map(group => {
    const members = group.members.map(id => player(id)?.name || 'Unknown');
    return `<div><b>${esc(group.name || group.slots.join(' + '))}:</b> ${esc(members.join(', '))} (Positions: ${esc(group.slots.join(', '))})</div>`;
  }).join('');
  const groupedBench = new Set(groups.flatMap(group => group.members));
  const onField = new Set(Object.values(field));
  const otherBench = activePlayers().filter(p => !onField.has(p.id) && !groupedBench.has(p.id));
  return `<section class="print-defense"><h2>${formation === 'four' ? '4 across outfield' : 'Right-side rover'}</h2><div class="print-field"><div class="print-diamond"></div>${slots}</div><div class="print-defense-notes">${rotationNotes || '<div>No field rotations set</div>'}${otherBench.length ? `<div><b>Other available:</b> ${esc(otherBench.map(p => p.name).join(', '))}</div>` : ''}</div></section>`;
}
function printOrder() {
  if (usesSplitRotation()) {
    const lane = (gender, columns) => {
      const ids = state.rotations[gender].filter(id => player(id)?.active && player(id)?.gender === gender);
      return `<div class="print-order-grid" style="--rows:${Math.ceil(ids.length / columns)}">${ids.map((id, index) => `<span><b>${index + 1}.</b> ${esc(player(id).name)}</span>`).join('')}</div>`;
    };
    const nextKicks = generatedKicks(30).map((id, index) => `<span class="${player(id)?.gender === 'W' ? 'woman' : ''}"><b>${index + 1}.</b> ${esc(player(id)?.name || 'Open')}</span>`).join('');
    return `<div class="print-order-columns"><div><h3>Men's rotation</h3>${lane('M', 3)}</div><div><h3>Women's rotation</h3>${lane('W', 2)}</div></div><div class="print-next-kicks"><h3>First 30 kicks · read down each column</h3><div class="print-kick-grid">${nextKicks}</div></div><p class="print-order-note">After #30, continue the man, woman, man pattern. Each rotation keeps its own order and loops independently.</p>`;
  }
  const ids = state.order.filter(id => player(id)?.active);
  return `<div class="print-order-grid single" style="--rows:${Math.ceil(ids.length / 6)}">${ids.map((id, index) => `<span><b>${index + 1}.</b> ${esc(player(id).name)}</span>`).join('')}</div><p class="print-order-note">Read down each column. After the last kicker, return to #1.</p>`;
}
function render() {
  const checks = status();
  const current = checks[state.formation];
  const active = activePlayers();
  const onField = new Set(Object.values(fieldForInning(state.formation, state.previewInning[state.formation])));
  app.innerHTML = `<div class="app-shell">
    <header class="masthead"><div class="brand"><span class="brand-ball" aria-hidden="true">✳</span><span>Kickball<br><b>lineup board</b></span></div><div class="header-actions"><span class="saved-note">Saved on this device</span><button id="export-lineup" class="header-button" type="button">Export</button><button id="import-lineup" class="header-button" type="button">Import</button>${localStorage.getItem(BACKUP_KEY) ? '<button id="undo-import" class="header-button" type="button">Undo import</button>' : ''}<input id="import-file" class="visually-hidden" type="file" accept=".json,application/json" aria-label="Choose a lineup JSON file"><a href="${RULES_URL}" target="_blank" rel="noopener">League rules ↗</a></div></header>
    <section class="intro"><div><p class="intro-kicker">Game day, sorted</p><h1>Put your team<br>in play.</h1><p>Drag players onto the diamond and into the kicking order. The board checks both defenses and the full batting cycle.</p></div><div class="readiness ${checks.ready ? 'ready' : ''}"><div class="readiness-mark">${checks.ready ? '✓' : '!'}</div><div><strong>${checks.ready ? 'Lineup is ready' : 'Lineup needs work'}</strong><span>${checks.ready ? 'Both defenses, every planned inning, and the kicking order meet the lineup rules.' : 'Check the details below before you take the field.'}</span></div></div></section>
    <main class="workspace">
      <section class="roster-panel panel"><div class="panel-heading"><div><h2>Roster</h2><p>${active.length} playing tonight · ${active.filter(p => p.gender === 'W').length} women</p></div><button class="quiet-button" id="clear-roster" title="Start with an empty roster">Clear</button></div>
      ${state.sample ? '<div class="sample-note">Sample team shown. Add your players or clear the roster to start fresh.</div>' : ''}
      <form id="add-player" class="add-form"><label for="player-name">Add a player</label><div class="add-row"><input id="player-name" name="name" placeholder="Player name" maxlength="32" required autocomplete="off"><select name="gender" aria-label="Player gender"><option value="W">Woman</option><option value="M">Man</option></select><button type="submit" aria-label="Add player">+</button></div></form>
      <div class="roster-list">${state.players.length ? state.players.map(p => `<div class="roster-row ${p.active ? '' : 'inactive'}">${playerChip(p, 'roster')}<div class="roster-controls"><label title="Playing tonight"><input type="checkbox" data-active="${esc(p.id)}" ${p.active ? 'checked' : ''}><span>Playing</span></label><button class="icon-button" data-remove="${esc(p.id)}" aria-label="Remove ${esc(p.name)}">×</button></div></div>`).join('') : '<div class="empty-roster">Add your players to start the lineup.</div>'}</div>
      <p class="panel-tip">Tip: tap a player, then tap a field spot or “Add to order.” Dragging works too.</p></section>
      <section class="field-panel panel"><div class="panel-heading"><div><h2>Defense</h2><p>Set both configurations for game day</p></div><span class="count-pill">${current.ids.length}/10 placed</span></div>
      <div class="formation-tabs" role="tablist" aria-label="Defensive configuration"><button data-formation="four" class="${state.formation === 'four' ? 'active' : ''}" role="tab" aria-selected="${state.formation === 'four'}">4 across outfield</button><button data-formation="rover" class="${state.formation === 'rover' ? 'active' : ''}" role="tab" aria-selected="${state.formation === 'rover'}">Right-side rover</button></div>
      <div class="inning-tabs"><span>View inning</span><div>${Array.from({ length: 7 }, (_, index) => `<button data-inning="${index + 1}" class="${state.previewInning[state.formation] === index + 1 ? 'active' : ''}" aria-label="View inning ${index + 1}" aria-pressed="${state.previewInning[state.formation] === index + 1}">${index + 1}</button>`).join('')}</div></div>
      <div class="field-wrap"><div class="field" aria-label="Kickball field"><div class="grass-stripe one"></div><div class="grass-stripe two"></div><div class="outfield-arc"></div><div class="infield-dirt"></div><div class="basepath"></div><div class="pitcher-circle"></div><span class="base second"></span><span class="base first"></span><span class="base third"></span><span class="base home"></span><div class="field-spots">${[...INFIELD, ...OUTFIELD[state.formation]].map(fieldSlot).join('')}</div></div><div class="field-hint">${state.previewInning[state.formation] !== 1 ? `Inning ${state.previewInning[state.formation]} preview. Return to inning 1 to edit the starting defense.` : state.formation === 'rover' ? 'Rover is the fourth outfielder. Keep them in the outfield, toward the 1B–2B gap.' : 'Outfielders stay in the outfield until the ball is kicked.'}</div></div>
      <div class="field-actions"><button id="clear-field" class="quiet-button" ${state.previewInning[state.formation] !== 1 ? 'disabled' : ''}>Clear this defense</button><button id="copy-field" class="quiet-button" ${state.previewInning[state.formation] !== 1 ? 'disabled' : ''}>Copy to other defense</button></div>
      <div class="bench"><div class="subheading"><h3>Available on bench</h3><span>${active.filter(p => !onField.has(p.id)).length}</span></div><div class="bench-list drop-target" data-drop="bench">${active.filter(p => !onField.has(p.id)).map(p => playerChip(p, 'bench')).join('') || '<span class="bench-empty">Everyone is on the field</span>'}</div></div>${fieldRotationPanel()}</section>
      ${orderPanel(active, checks.order)}
    </main>
    <section class="rules-panel"><div class="rules-title"><div><h2>Lineup checks</h2><p>Based on the TRI SPORTS rules, revised February 2025</p></div><button id="print-lineup" class="print-button" ${checks.ready ? '' : 'disabled'}>Print ready lineup</button></div><div class="check-grid">${reportMarkup(checks.four, 'four')}${reportMarkup(checks.rover, 'rover')}<div class="check-row ${checks.order.ready ? 'good' : 'warn'}"><span class="check-icon">${checks.order.ready ? '✓' : '!'}</span><span><strong>Kicking order</strong><small>${checks.order.split ? state.rotations.M.length + state.rotations.W.length : state.order.length} kickers · ${checks.order.women} women</small></span><b>${labelStatus(checks.order.ready, checks.order.missing.length > 0)}</b></div></div><div class="issue-list">${[...new Set([...current.issues, ...checks.order.issues])].map(issue => `<p>• ${esc(issue)}</p>`).join('') || '<p class="all-clear">This defense and kicking order pass the lineup checks.</p>'}</div><p class="rules-footnote">10 fielders: 6 infield + 4 outfield, with 4+ women. 9 fielders: 6 infield + 3 outfield, with 3+ women. All available players kick. Alternate genders when possible, and never place 3 men consecutively. When one full order cannot satisfy that, the board runs separate gender rotations starting M/W/M, with two men between women thereafter. Set your order before the game; the league restricts changes during play.</p></section>
    <section class="print-sheet ${checks.order.split ? 'split-print' : ''}"><div class="print-header"><div><h1>Kickball lineup</h1><p>Game: ____________________ &nbsp; Date: __________</p></div><div class="print-ready">READY LINEUP</div></div><div class="print-defenses">${printDefense('four')}${printDefense('rover')}</div><section class="print-kicking"><h2>Kicking order</h2>${printOrder()}</section></section>
    ${message ? `<div class="toast" role="status">${esc(message)}</div>` : ''}
  </div>`;
  bindEvents();
}

function moveToField(id, pos) {
  if (state.previewInning[state.formation] !== 1) return notify('Return to inning 1 to edit field positions.');
  const groups = state.fieldRotations[state.formation];
  if (groups.some(group => group.slots.includes(pos) || group.members.includes(id))) return notify('Edit the rotation group to change this spot or player.');
  const p = player(id);
  if (!p?.active) return notify('Choose a player who is playing tonight.');
  const field = state.fields[state.formation];
  const oldPos = Object.keys(field).find(key => field[key] === id);
  const displaced = field[pos];
  if (oldPos === pos) return;
  if (oldPos) field[oldPos] = displaced || undefined;
  field[pos] = id;
  state.selected = null;
  update();
}
function moveToBench(id) {
  if (state.previewInning[state.formation] !== 1) return notify('Return to inning 1 to edit field positions.');
  if (state.fieldRotations[state.formation].some(group => group.members.includes(id))) return notify('Edit the rotation group to change this player.');
  const field = state.fields[state.formation];
  const pos = Object.keys(field).find(key => field[key] === id);
  if (pos) { field[pos] = undefined; update(); }
}
function syncDraftMembers() {
  if (!draftGroup) return;
  const starters = draftGroup.slots.map(pos => state.fields[draftGroup.formation][pos]).filter(Boolean);
  const extras = draftGroup.members.filter(id => !starters.includes(id) && !Object.values(state.fields[draftGroup.formation]).includes(id));
  draftGroup.members = [...new Set([...starters, ...extras])];
}
function moveToOrder(id, index = state.order.length) {
  if (!player(id)?.active) return notify('Choose a player who is playing tonight.');
  const old = state.order.indexOf(id);
  if (old >= 0) state.order.splice(old, 1);
  const destination = old >= 0 && old < index ? index - 1 : index;
  state.order.splice(Math.max(0, Math.min(destination, state.order.length)), 0, id);
  syncRotationsFromOrder();
  state.selected = null;
  update();
}
function moveToRotation(id, lane = player(id)?.gender, index = state.rotations[lane]?.length || 0) {
  if (!player(id)?.active || player(id)?.gender !== lane) return notify('Drop the player in the matching rotation.');
  const list = state.rotations[lane];
  const old = list.indexOf(id);
  if (old >= 0) list.splice(old, 1);
  const destination = old >= 0 && old < index ? index - 1 : index;
  list.splice(Math.max(0, Math.min(destination, list.length)), 0, id);
  state.selected = null;
  update();
}
function bindEvents() {
  document.getElementById('export-lineup').addEventListener('click', exportLineup);
  document.getElementById('import-lineup').addEventListener('click', () => document.getElementById('import-file').click());
  document.getElementById('import-file').addEventListener('change', event => { importLineup(event.target.files?.[0]); event.target.value = ''; });
  document.getElementById('undo-import')?.addEventListener('click', undoImport);
  document.getElementById('add-player').addEventListener('submit', event => {
    event.preventDefault();
    const form = event.currentTarget;
    const name = form.elements.name.value.trim();
    if (!name) return;
    state.players.push({ id: crypto.randomUUID(), name, gender: form.elements.gender.value, active: true });
    state.sample = false;
    update();
    document.getElementById('player-name').focus();
  });
  document.querySelectorAll('[data-active]').forEach(input => input.addEventListener('change', () => {
    const id = input.dataset.active;
    const p = player(id);
    p.active = input.checked;
    if (!p.active) {
      state.order = state.order.filter(item => item !== id);
      state.rotations.M = state.rotations.M.filter(item => item !== id);
      state.rotations.W = state.rotations.W.filter(item => item !== id);
      Object.values(state.fields).forEach(field => Object.keys(field).forEach(pos => { if (field[pos] === id) field[pos] = undefined; }));
    }
    state.sample = false;
    update();
  }));
  document.querySelectorAll('[data-remove]').forEach(button => button.addEventListener('click', () => {
    const id = button.dataset.remove;
    state.players = state.players.filter(p => p.id !== id);
    state.order = state.order.filter(item => item !== id);
    state.rotations.M = state.rotations.M.filter(item => item !== id);
    state.rotations.W = state.rotations.W.filter(item => item !== id);
    Object.values(state.fieldRotations).forEach(groups => groups.forEach(group => { group.members = group.members.filter(item => item !== id); }));
    Object.values(state.fields).forEach(field => Object.keys(field).forEach(pos => { if (field[pos] === id) field[pos] = undefined; }));
    if (state.selected === id) state.selected = null;
    state.sample = false;
    update();
  }));
  document.querySelectorAll('[data-remove-order]').forEach(button => button.addEventListener('click', () => {
    const list = button.dataset.lane ? state.rotations[button.dataset.lane] : state.order;
    const index = list.indexOf(button.dataset.removeOrder);
    if (index >= 0) list.splice(index, 1);
    if (!button.dataset.lane) syncRotationsFromOrder();
    update();
  }));
  document.querySelectorAll('[data-move]').forEach(button => button.addEventListener('click', () => {
    const list = button.dataset.lane ? state.rotations[button.dataset.lane] : state.order;
    const index = list.indexOf(button.dataset.move);
    const other = index + (button.dataset.direction === 'up' ? -1 : 1);
    if (other < 0 || other >= list.length) return;
    [list[index], list[other]] = [list[other], list[index]];
    if (!button.dataset.lane) syncRotationsFromOrder();
    update();
  }));
  document.querySelectorAll('[data-formation]').forEach(button => button.addEventListener('click', () => { state.formation = button.dataset.formation; draftGroup = null; update(); }));
  document.querySelectorAll('[data-inning]').forEach(button => button.addEventListener('click', () => { state.previewInning[state.formation] = Number(button.dataset.inning); draftGroup = null; update(); }));
  document.getElementById('new-group').addEventListener('click', () => { draftGroup = { id: crypto.randomUUID(), name: '', slots: [], members: [], formation: state.formation, editing: false }; render(); });
  document.querySelectorAll('[data-edit-group]').forEach(button => button.addEventListener('click', () => {
    const group = state.fieldRotations[state.formation].find(item => item.id === button.dataset.editGroup);
    if (!group) return;
    state.previewInning[state.formation] = 1;
    draftGroup = { ...structuredClone(group), formation: state.formation, editing: true };
    render();
  }));
  document.querySelectorAll('[data-delete-group]').forEach(button => button.addEventListener('click', () => {
    const group = state.fieldRotations[state.formation].find(item => item.id === button.dataset.deleteGroup);
    if (!group || !window.confirm(`Remove the ${group.name || group.slots.join(' + ')} rotation group?`)) return;
    state.fieldRotations[state.formation] = state.fieldRotations[state.formation].filter(item => item.id !== group.id);
    if (draftGroup?.id === group.id) draftGroup = null;
    update();
  }));
  const groupName = document.getElementById('group-name');
  if (groupName) groupName.addEventListener('input', () => { draftGroup.name = groupName.value; });
  document.getElementById('cancel-group')?.addEventListener('click', () => { draftGroup = null; render(); });
  document.querySelectorAll('[data-group-slot]').forEach(button => button.addEventListener('click', () => {
    const pos = button.dataset.groupSlot;
    draftGroup.slots = draftGroup.slots.includes(pos) ? draftGroup.slots.filter(item => item !== pos) : [...draftGroup.slots, pos];
    syncDraftMembers();
    render();
  }));
  document.querySelectorAll('[data-group-member]').forEach(button => button.addEventListener('click', () => {
    const id = button.dataset.groupMember;
    draftGroup.members = draftGroup.members.includes(id) ? draftGroup.members.filter(item => item !== id) : [...draftGroup.members, id];
    syncDraftMembers();
    render();
  }));
  document.querySelectorAll('[data-extra-move]').forEach(button => button.addEventListener('click', () => {
    const starters = draftGroup.slots.map(pos => state.fields[state.formation][pos]).filter(Boolean);
    const extras = draftGroup.members.filter(id => !starters.includes(id));
    const index = extras.indexOf(button.dataset.extraMove);
    const other = index + (button.dataset.direction === 'up' ? -1 : 1);
    if (other < 0 || other >= extras.length) return;
    [extras[index], extras[other]] = [extras[other], extras[index]];
    draftGroup.members = [...starters, ...extras];
    render();
  }));
  document.getElementById('save-group')?.addEventListener('click', () => {
    syncDraftMembers();
    if (!draftGroup.slots.length || draftGroup.members.length <= draftGroup.slots.length) return;
    const group = { id: draftGroup.id, name: draftGroup.name.trim() || `${draftGroup.slots.join(' + ')} rotation`, slots: [...draftGroup.slots], members: [...draftGroup.members] };
    const groups = state.fieldRotations[state.formation];
    const index = groups.findIndex(item => item.id === group.id);
    if (index >= 0) groups[index] = group; else groups.push(group);
    draftGroup = null;
    update();
  });
  document.getElementById('add-selected').addEventListener('click', () => { if (state.selected) usesSplitRotation() ? moveToRotation(state.selected) : moveToOrder(state.selected); });
  document.getElementById('fill-order').addEventListener('click', () => {
    activePlayers().forEach(p => {
      if (usesSplitRotation()) { if (!state.rotations[p.gender].includes(p.id)) state.rotations[p.gender].push(p.id); }
      else if (!state.order.includes(p.id)) state.order.push(p.id);
    });
    if (!usesSplitRotation()) syncRotationsFromOrder();
    update();
  });
  document.getElementById('clear-field').addEventListener('click', () => {
    if (state.fieldRotations[state.formation].length && !window.confirm('Clear this defense and its field rotation groups?')) return;
    state.fields[state.formation] = {};
    state.fieldRotations[state.formation] = [];
    draftGroup = null;
    update();
  });
  document.getElementById('copy-field').addEventListener('click', () => {
    const source = state.fields[state.formation];
    const target = state.formation === 'four' ? 'rover' : 'four';
    const copy = Object.fromEntries(INFIELD.map(pos => [pos, source[pos]]));
    copy.LF = source.LF; copy.RF = source.RF;
    if (target === 'rover') { copy.CF = source.LCF; copy.ROV = source.RCF; }
    else { copy.LCF = source.CF; copy.RCF = source.ROV; }
    state.fields[target] = copy;
    update(); notify(`Copied placements to the ${target === 'four' ? '4-across' : 'rover'} defense.`);
  });
  document.getElementById('clear-roster').addEventListener('click', () => {
    if (!window.confirm('Clear the roster, both defenses, and the kicking order?')) return;
    state = { players: [], order: [], rotations: { M: [], W: [] }, fields: { four: {}, rover: {} }, fieldRotations: { four: [], rover: [] }, previewInning: { four: 1, rover: 1 }, formation: 'four', selected: null, sample: false };
    draftGroup = null;
    update();
  });
  document.getElementById('print-lineup').addEventListener('click', () => window.print());
  document.querySelectorAll('[data-drag-id]').forEach(el => {
    el.addEventListener('click', event => {
      if (drag?.moved) return;
      const id = event.currentTarget.dataset.dragId;
      state.selected = state.selected === id ? null : id;
      render();
    });
    el.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); state.selected = el.dataset.dragId; render(); }
    });
    el.addEventListener('dragstart', event => { event.dataTransfer.setData('text/plain', el.dataset.dragId); event.dataTransfer.effectAllowed = 'move'; });
    el.addEventListener('pointerdown', pointerStart);
  });
  document.querySelectorAll('[data-drop]').forEach(el => {
    el.addEventListener('dragover', event => { event.preventDefault(); event.currentTarget.classList.add('drag-over'); });
    el.addEventListener('dragleave', event => event.currentTarget.classList.remove('drag-over'));
    el.addEventListener('drop', event => { event.preventDefault(); event.stopPropagation(); document.querySelectorAll('.drag-over').forEach(node => node.classList.remove('drag-over')); handleDrop(event.dataTransfer.getData('text/plain'), event.currentTarget, event.clientY); });
    if (el.dataset.drop === 'field') {
      el.addEventListener('click', event => { if (state.selected && state.selected !== state.fields[state.formation][el.dataset.pos]) { event.stopPropagation(); moveToField(state.selected, el.dataset.pos); } }, true);
      el.addEventListener('keydown', event => { if ((event.key === 'Enter' || event.key === ' ') && state.selected) { event.preventDefault(); moveToField(state.selected, el.dataset.pos); } });
    }
    if (el.dataset.drop === 'order-item') {
      el.addEventListener('click', event => { if (state.selected && state.selected !== state.order[Number(el.dataset.index)] && !event.target.closest('button')) { event.stopPropagation(); moveToOrder(state.selected, Number(el.dataset.index)); } }, true);
    }
    if (el.dataset.drop === 'rotation-item') {
      el.addEventListener('click', event => { const lane = el.dataset.lane; if (state.selected && state.selected !== state.rotations[lane][Number(el.dataset.index)] && !event.target.closest('button')) { event.stopPropagation(); moveToRotation(state.selected, lane, Number(el.dataset.index)); } }, true);
    }
  });
}
function handleDrop(id, target, clientY) {
  if (!id || !target) return;
  if (target.dataset.drop === 'field') moveToField(id, target.dataset.pos);
  else if (target.dataset.drop === 'bench') moveToBench(id);
  else if (target.dataset.drop === 'order-item') {
    const rect = target.getBoundingClientRect();
    moveToOrder(id, Number(target.dataset.index) + (clientY > rect.top + rect.height / 2 ? 1 : 0));
  } else if (target.dataset.drop === 'order') moveToOrder(id);
  else if (target.dataset.drop === 'rotation-item') {
    const rect = target.getBoundingClientRect();
    moveToRotation(id, target.dataset.lane, Number(target.dataset.index) + (clientY > rect.top + rect.height / 2 ? 1 : 0));
  } else if (target.dataset.drop === 'rotation') moveToRotation(id, target.dataset.lane);
}
function pointerStart(event) {
  if (event.pointerType === 'mouse') return;
  const source = event.currentTarget;
  const id = source.dataset.dragId;
  const startX = event.clientX, startY = event.clientY;
  drag = { id, moved: false, ghost: null };
  function onMove(move) {
    if (!drag || drag.id !== id) return;
    if (!drag.moved && Math.hypot(move.clientX - startX, move.clientY - startY) > 8) {
      drag.moved = true;
      drag.ghost = source.cloneNode(true);
      drag.ghost.classList.add('drag-ghost');
      document.body.appendChild(drag.ghost);
    }
    if (drag.moved) {
      move.preventDefault();
      drag.ghost.style.left = `${move.clientX}px`;
      drag.ghost.style.top = `${move.clientY}px`;
      document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
      document.elementFromPoint(move.clientX, move.clientY)?.closest('[data-drop]')?.classList.add('drag-over');
    }
  }
  function onEnd(end) {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onEnd);
    window.removeEventListener('pointercancel', onEnd);
    if (!drag || drag.id !== id) return;
    const wasMoved = drag.moved;
    drag.ghost?.remove();
    const target = document.elementFromPoint(end.clientX, end.clientY)?.closest('[data-drop]');
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    if (wasMoved) { handleDrop(id, target, end.clientY); window.setTimeout(() => { drag = null; }, 0); }
    else drag = null;
  }
  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', onEnd);
  window.addEventListener('pointercancel', onEnd);
}
render();
