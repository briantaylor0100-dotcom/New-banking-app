const DEFAULT_CATEGORY_TYPES = {
  'Transfers': ['Account transfer'],
  'Personal spending': ['Groceries', 'Dining', 'Transportation', 'Shopping', 'Entertainment'],
  'Bills & utilities': ['Rent / mortgage', 'Utilities', 'Insurance', 'Phone & internet'],
  'Income': ['Paycheck', 'Other income']
};
let state = { accounts: [], transactions: [], categoryTypes: DEFAULT_CATEGORY_TYPES, planning: { safetyBuffer: 0, goalReserve: 0 }, importTemplates: [] };
let selectedAccountId = null;
let pendingImport = null;
let openSplitTransactionId = null;

const dashboardPage = document.getElementById('dashboard-page');
const reportsPage = document.getElementById('reports-page');
const importPage = document.getElementById('import-page');
const planningPage = document.getElementById('planning-page');
const navItems = document.querySelectorAll('.nav-item');
const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' });

const safeText = value => String(value ?? '');
const amount = value => Number.isFinite(Number(value)) ? Math.round(Number(value) * 100) / 100 : 0;
const today = () => new Date().toISOString().slice(0, 10);
const makeId = () => crypto.randomUUID();

function accountById(id) { return state.accounts.find(account => account.id === id); }
function accountBalance(account) {
  return amount(account.openingBalance + state.transactions
    .filter(tx => tx.accountId === account.id)
    .reduce((sum, tx) => sum + amount(tx.receive) - amount(tx.spend), 0));
}
function balances() {
  return state.accounts.map(account => ({ ...account, balance: accountBalance(account) }));
}
async function persist() {
  try {
    await window.vault.save(state);
    setStatus('Saved.', 'success');
  } catch (error) {
    setStatus(`Could not save changes: ${error.message}`, 'error');
  }
}
function setStatus(message, kind = '') {
  const status = document.getElementById('app-status');
  status.textContent = message;
  status.className = kind;
}
function makeCell(value, className = '') {
  const cell = document.createElement('td');
  cell.className = className;
  cell.textContent = safeText(value);
  return cell;
}
function inputCell(type, value, className = '') {
  const cell = document.createElement('td');
  const input = document.createElement('input');
  input.type = type; input.value = safeText(value); input.className = className || 'edit-input';
  cell.appendChild(input); return cell;
}
function accountSelect(value) {
  const select = document.createElement('select');
  select.className = 'edit-input';
  state.accounts.forEach(account => {
    const option = new Option(account.name, account.id, false, account.id === value);
    select.add(option);
  });
  return select;
}
function normalizedCategoryTypes(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return structuredClone(DEFAULT_CATEGORY_TYPES);
  return Object.fromEntries(Object.entries(value)
    .map(([type, categories]) => [safeText(type).trim(), [...new Set((Array.isArray(categories) ? categories : []).map(category => safeText(category).trim()).filter(Boolean))]])
    .filter(([type]) => type));
}
function categoryValue(type, category) { return `${type}::${category}`; }
function splitCategory(value) {
  const [type, ...rest] = safeText(value).split('::');
  return rest.length ? { type, category: rest.join('::') } : { type: '', category: safeText(value) };
}
function categorySelect(value) {
  const select = document.createElement('select'); select.className = 'edit-input';
  const { type: selectedType, category: selectedCategory } = splitCategory(value);
  const found = Object.entries(state.categoryTypes).some(([type, categories]) => type === selectedType && categories.includes(selectedCategory));
  if (!found && value) select.add(new Option(safeText(value), safeText(value), true, true));
  Object.entries(state.categoryTypes).sort(([a], [b]) => a.localeCompare(b)).forEach(([type, categories]) => {
    const group = document.createElement('optgroup'); group.label = type;
    categories.forEach(category => group.append(new Option(category, categoryValue(type, category), false, type === selectedType && category === selectedCategory)));
    select.append(group);
  });
  return select;
}
function splitTotalCents(tx) { return Math.round(amount(tx.receive) * 100); }
function renderSplitRows(tx) {
  const holder = document.getElementById('split-rows');
  holder.replaceChildren();
  const rows = Array.isArray(tx.splits) && tx.splits.length
    ? tx.splits
    : [{ payee: tx.payee, category: tx.category || 'Uncategorized', amount: amount(tx.receive) }];
  rows.forEach(split => {
    const row = document.createElement('div'); row.className = 'split-input-row';
    const payee = document.createElement('input'); payee.type = 'text'; payee.maxLength = 80; payee.placeholder = 'e.g. Alex'; payee.value = safeText(split.payee); payee.setAttribute('aria-label', 'Person or source');
    const category = categorySelect(split.category || 'Uncategorized'); category.setAttribute('aria-label', 'Category');
    const value = document.createElement('input'); value.type = 'number'; value.min = '0.01'; value.step = '0.01'; value.inputMode = 'decimal'; value.value = amount(split.amount).toFixed(2); value.className = 'split-amount'; value.setAttribute('aria-label', 'Amount');
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'remove-split-btn'; remove.textContent = 'Remove'; remove.addEventListener('click', () => { row.remove(); updateSplitRemainder(); });
    value.addEventListener('input', updateSplitRemainder);
    row.append(payee, category, value, remove); holder.append(row);
  });
  document.getElementById('split-total').textContent = money.format(amount(tx.receive));
  updateSplitRemainder();
}
function updateSplitRemainder() {
  const tx = state.transactions.find(item => item.id === openSplitTransactionId);
  if (!tx) return;
  const allocated = [...document.querySelectorAll('#split-rows .split-amount')]
    .reduce((sum, input) => sum + Math.round(amount(input.value) * 100), 0);
  const remainder = splitTotalCents(tx) - allocated;
  const target = document.getElementById('split-remaining');
  target.textContent = remainder === 0 ? 'Fully allocated' : `${money.format(Math.abs(remainder) / 100)} ${remainder > 0 ? 'left' : 'over'}`;
  target.classList.toggle('balanced', remainder === 0);
}

function updateUI() {
  const current = balances();
  const totalCash = current.filter(a => a.balance >= 0).reduce((sum, a) => sum + a.balance, 0);
  const totalDebt = current.filter(a => a.balance < 0).reduce((sum, a) => sum + Math.abs(a.balance), 0);
  document.getElementById('total-cash').textContent = money.format(totalCash);
  document.getElementById('total-debt').textContent = money.format(totalDebt);
  document.getElementById('net-worth').textContent = money.format(totalCash - totalDebt);
  document.getElementById('all-accounts-balance').textContent = money.format(totalCash - totalDebt);
  renderAccountList(current);
  renderSafeToSpend(current);
}

function liquidCash(current = balances()) { return current.filter(account => account.type !== 'debt' && account.balance > 0).reduce((sum, account) => sum + account.balance, 0); }
function addDays(date, days) { const result = new Date(`${date}T12:00:00`); result.setDate(result.getDate() + days); return result.toISOString().slice(0, 10); }
function daysBetween(a, b) { return Math.round((new Date(`${b}T12:00:00`) - new Date(`${a}T12:00:00`)) / 86400000); }
function normalizedPayee(value) { return safeText(value).toLowerCase().replace(/\d+/g, '').replace(/[^a-z]/g, ' ').replace(/\s+/g, ' ').trim(); }
function recurringPatterns() {
  const groups = new Map();
  state.transactions.filter(tx => tx.date && (amount(tx.spend) || amount(tx.receive))).forEach(tx => {
    const key = `${normalizedPayee(tx.payee)}|${amount(tx.receive) > 0 ? 'income' : 'expense'}`;
    if (!normalizedPayee(tx.payee)) return;
    const list = groups.get(key) || []; list.push(tx); groups.set(key, list);
  });
  return [...groups.values()].map(items => {
    const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date));
    const intervals = sorted.slice(1).map((tx, i) => daysBetween(sorted[i].date, tx.date)).filter(d => d >= 5 && d <= 40);
    const cadence = intervals.length ? Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length) : 0;
    const values = sorted.map(tx => amount(tx.receive) || amount(tx.spend));
    const average = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = Math.max(...values) - Math.min(...values);
    return { payee: sorted[0].payee, direction: amount(sorted[0].receive) > 0 ? 'income' : 'expense', items: sorted, cadence, average: amount(average), variance: amount(variance), latest: sorted.at(-1) };
  }).filter(pattern => pattern.items.length >= 2 && pattern.cadence >= 5 && pattern.cadence <= 35 && pattern.variance <= Math.max(5, pattern.average * .25));
}
function upcomingRecurring(days = 30) { const end = addDays(today(), days); return recurringPatterns().filter(p => p.direction === 'expense').map(p => ({ ...p, nextDate: addDays(p.latest.date, p.cadence) })).filter(p => p.nextDate >= today() && p.nextDate <= end); }
function renderSafeToSpend(current) {
  const planning = state.planning || {}; const bills = upcomingRecurring(30).reduce((sum, bill) => sum + bill.average, 0);
  const safe = Math.max(0, liquidCash(current) - bills - amount(planning.goalReserve) - amount(planning.safetyBuffer));
  document.getElementById('safe-to-spend').textContent = money.format(safe);
  document.getElementById('safe-spend-explanation').textContent = `${money.format(liquidCash(current))} liquid cash − ${money.format(bills)} due in 30 days − ${money.format(planning.goalReserve)} goals − ${money.format(planning.safetyBuffer)} buffer.`;
  document.getElementById('safety-buffer').value = amount(planning.safetyBuffer);
  document.getElementById('goal-reserve').value = amount(planning.goalReserve);
}

function renderAccountList(currentAccounts = balances()) {
  const list = document.getElementById('account-list');
  list.replaceChildren();
  document.getElementById('all-accounts-btn').classList.toggle('active', selectedAccountId === null);
  currentAccounts.forEach(account => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'account-pill';
    button.classList.toggle('active', account.id === selectedAccountId);
    const name = document.createElement('span'); name.textContent = account.name;
    const balance = document.createElement('span'); balance.className = 'balance'; balance.textContent = money.format(account.balance);
    if (account.balance < 0) balance.classList.add('negative-balance');
    button.append(name, balance);
    button.addEventListener('click', () => {
      selectedAccountId = account.id;
      renderTransactions();
      renderAccountList();
    });
    list.append(button);
  });
}

function renderTransactions() {
  const body = document.getElementById('transaction-body');
  body.replaceChildren();
  const visibleTransactions = state.transactions
    .map((tx, index) => ({ tx, index }))
    .filter(({ tx }) => selectedAccountId === null || tx.accountId === selectedAccountId);
  const selectedAccount = accountById(selectedAccountId);
  document.getElementById('transaction-heading').textContent = selectedAccount
    ? `${selectedAccount.name} Transactions`
    : 'Recent Transactions';
  visibleTransactions.forEach(({ tx, index }) => {
    const row = document.createElement('tr'); row.className = 'main-row';
    if (tx.isEditing) {
      row.append(inputCell('date', tx.date));
      row.append(inputCell('text', tx.payee));
      const categoryCell = document.createElement('td'); categoryCell.append(categorySelect(tx.category)); row.append(categoryCell);
      row.append(inputCell('text', tx.tag));
      row.append(inputCell('text', tx.cleared, 'edit-small'));
      row.append(inputCell('number', tx.spend));
      row.append(inputCell('number', tx.receive));
      row.append(makeCell(money.format(amount(tx.receive) - amount(tx.spend))));
      const accountCell = document.createElement('td'); accountCell.append(accountSelect(tx.accountId)); row.append(accountCell);
      const action = document.createElement('td'); action.className = 'transaction-actions';
      const save = document.createElement('button'); save.type = 'button'; save.textContent = 'Save';
      save.addEventListener('click', () => saveRow(index, row));
      action.append(save, removeButton(index)); row.append(action);
    } else {
      row.append(makeCell(tx.date));
      const payee = makeCell(tx.payee); payee.className = 'payee'; row.append(payee);
      row.append(makeCell(tx.splits?.length ? `Split · ${tx.splits.length} parts` : tx.category)); row.append(makeCell(tx.tag)); row.append(makeCell(tx.cleared, 'text-center'));
      row.append(makeCell(tx.spend > 0 ? money.format(tx.spend) : '', 'neg'));
      row.append(makeCell(tx.receive > 0 ? money.format(tx.receive) : '', 'pos'));
      row.append(makeCell(money.format(amount(tx.receive) - amount(tx.spend))));
      row.append(makeCell(accountById(tx.accountId)?.name ?? 'Unassigned'));
      const action = document.createElement('td'); action.className = 'transaction-actions';
      const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = 'Edit';
      edit.addEventListener('click', () => { tx.isEditing = true; renderTransactions(); });
      action.append(edit);
      if (amount(tx.receive) > 0 && amount(tx.spend) === 0) {
        const split = document.createElement('button'); split.type = 'button'; split.textContent = tx.splits?.length ? 'Edit split' : 'Split';
        split.addEventListener('click', () => openSplitEditor(index)); action.append(split);
      }
      action.append(removeButton(index)); row.append(action);
    }
    const memoRow = document.createElement('tr'); memoRow.className = 'memo-row';
    const memo = document.createElement('td'); memo.colSpan = 10;
    if (tx.isEditing) { const input = document.createElement('input'); input.type = 'text'; input.value = safeText(tx.memo); input.className = 'edit-input memo-edit'; input.placeholder = 'Enter memo'; memo.append(input); }
    else memo.textContent = tx.memo || 'No memo';
    memoRow.append(memo); body.append(row, memoRow);
    if (!tx.isEditing && tx.splits?.length) {
      const detailsRow = document.createElement('tr'); detailsRow.className = 'split-detail-row';
      const details = document.createElement('td'); details.colSpan = 10;
      details.textContent = tx.splits.map(split => `${split.payee || 'Unassigned'} · ${splitCategoryLabel(split.category)} · ${money.format(amount(split.amount))}`).join('  |  ');
      detailsRow.append(details); body.append(detailsRow);
    }
  });
}

function splitCategoryLabel(value) {
  const { type, category } = splitCategory(value || 'Uncategorized');
  return type ? `${type}: ${category}` : category;
}

function removeButton(index) {
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = 'Remove';
  remove.className = 'remove-btn';
  remove.addEventListener('click', () => removeTransaction(index));
  return remove;
}

function removeTransaction(index) {
  const transaction = state.transactions[index];
  if (!transaction || !window.confirm(`Remove the transaction for ${transaction.payee || 'this payee'}?`)) return;
  state.transactions.splice(index, 1);
  renderTransactions();
  updateUI();
  persist();
}

function saveRow(index, row) {
  const fields = row.querySelectorAll('input, select');
  const memo = row.nextElementSibling.querySelector('input');
  const [date, payee, category, tag, cleared, spend, receive, account] = fields;
  const outgoing = amount(spend.value), incoming = amount(receive.value);
  if (!date.value || !payee.value.trim() || (outgoing > 0 && incoming > 0) || (outgoing < 0 || incoming < 0)) {
    setStatus('Enter a date and payee, with either a non-negative spend or receive amount.', 'error'); return;
  }
  const existing = state.transactions[index];
  if (existing.splits?.length && Math.round(incoming * 100) !== splitTotalCents(existing)) {
    setStatus('Update the split before changing this deposit amount.', 'error'); return;
  }
  Object.assign(state.transactions[index], { date: date.value, payee: payee.value.trim(), category: category.value || 'Uncategorized', tag: tag.value.trim(), cleared: cleared.value.trim(), spend: outgoing, receive: incoming, accountId: account.value, memo: memo.value.trim(), isEditing: false });
  renderTransactions(); updateUI(); persist();
}

function addTransaction() {
  const firstType = Object.keys(state.categoryTypes)[0];
  const firstCategory = state.categoryTypes[firstType]?.[0];
  state.transactions.unshift({ id: makeId(), date: today(), payee: '', category: firstCategory ? categoryValue(firstType, firstCategory) : 'Uncategorized', tag: '', memo: '', cleared: '', spend: 0, receive: 0, accountId: selectedAccountId || state.accounts[0]?.id, isEditing: true });
  renderTransactions();
}

function openSplitEditor(index) {
  const tx = state.transactions[index];
  if (!tx || amount(tx.receive) <= 0 || amount(tx.spend) > 0) return;
  openSplitTransactionId = tx.id;
  renderSplitRows(tx);
  document.getElementById('split-modal').hidden = false;
  document.querySelector('#split-rows input').focus();
}
function closeSplitEditor() {
  document.getElementById('split-modal').hidden = true;
  openSplitTransactionId = null;
}
async function saveTransactionSplit() {
  const tx = state.transactions.find(item => item.id === openSplitTransactionId);
  if (!tx) return closeSplitEditor();
  const rows = [...document.querySelectorAll('#split-rows .split-input-row')];
  const splits = rows.map(row => ({
    id: makeId(),
    payee: row.children[0].value.trim(),
    category: row.children[1].value || 'Uncategorized',
    amount: amount(row.querySelector('.split-amount').value)
  }));
  if (splits.length < 2 || splits.some(split => split.amount <= 0)) {
    setStatus('Add at least two portions, each with an amount greater than zero.', 'error'); return;
  }
  if (splits.reduce((sum, split) => sum + Math.round(split.amount * 100), 0) !== splitTotalCents(tx)) {
    setStatus('The split portions must add up exactly to the deposit.', 'error'); return;
  }
  tx.splits = splits;
  closeSplitEditor();
  renderTransactions();
  generateCategoryReport();
  await persist();
  setStatus(`Split saved across ${splits.length} portions.`, 'success');
}
function addSplitRow() {
  const holder = document.getElementById('split-rows');
  const firstType = Object.keys(state.categoryTypes)[0];
  const firstCategory = state.categoryTypes[firstType]?.[0];
  const row = document.createElement('div'); row.className = 'split-input-row';
  const payee = document.createElement('input'); payee.type = 'text'; payee.maxLength = 80; payee.placeholder = 'e.g. Alex'; payee.setAttribute('aria-label', 'Person or source');
  const category = categorySelect(firstCategory ? categoryValue(firstType, firstCategory) : 'Uncategorized'); category.setAttribute('aria-label', 'Category');
  const value = document.createElement('input'); value.type = 'number'; value.min = '0.01'; value.step = '0.01'; value.inputMode = 'decimal'; value.value = '0.00'; value.className = 'split-amount'; value.setAttribute('aria-label', 'Amount'); value.addEventListener('input', updateSplitRemainder);
  const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'remove-split-btn'; remove.textContent = 'Remove'; remove.addEventListener('click', () => { row.remove(); updateSplitRemainder(); });
  row.append(payee, category, value, remove); holder.append(row); value.focus(); updateSplitRemainder();
}

function showAddAccountForm() {
  const form = document.getElementById('add-account-form');
  form.hidden = false;
  document.getElementById('account-name').focus();
}

function hideAddAccountForm() {
  const form = document.getElementById('add-account-form');
  form.reset();
  form.hidden = true;
}

async function addAccount(event) {
  event.preventDefault();
  const name = document.getElementById('account-name').value.trim();
  const accountKind = document.getElementById('account-type').value;
  const openingBalance = amount(document.getElementById('opening-balance').value);
  if (!name) return;
  const account = {
    id: makeId(),
    name,
    openingBalance,
    type: accountKind === 'credit-card' ? 'debt' : 'cash',
    accountKind
  };
  state.accounts.push(account);
  selectedAccountId = account.id;
  hideAddAccountForm();
  updateUI();
  renderTransactions();
  await persist();
  setStatus(`${name} added.`, 'success');
}

function parseCsv(text) {
  const rows = csvRows(text); if (rows.length < 2) return [];
  return parseCsvRows(rows);
}
function csvRows(text) {
  const rows = []; let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i], next = text[i + 1];
    if (char === '"' && quoted && next === '"') { field += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(field.trim()); field = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && next === '\n') i += 1; row.push(field.trim()); if (row.some(Boolean)) rows.push(row); row = []; field = ''; }
    else field += char;
  }
  if (field || row.length) { row.push(field.trim()); rows.push(row); }
  return rows;
}
function parseCsvRows(rows) {
  if (rows.length < 2) return [];
  const headings = rows.shift().map(x => x.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const get = (record, names) => record[headings.findIndex(h => names.includes(h))] || '';
  return rows.map((record, index) => {
    const rawAmount = get(record, ['amount', 'transactionamount']);
    const debit = amount(get(record, ['debit', 'withdrawal', 'withdrawals']));
    const credit = amount(get(record, ['credit', 'deposit', 'deposits']));
    const signed = amount(rawAmount);
    return { id: `csv-${index}-${get(record, ['date', 'transactiondate'])}-${get(record, ['description', 'payee', 'name'])}-${signed}`, date: get(record, ['date', 'transactiondate']) || today(), payee: get(record, ['description', 'payee', 'name']) || 'Unknown Payee', memo: get(record, ['memo', 'notes']), fitId: get(record, ['fitid', 'id', 'transactionid']), spend: debit || (signed < 0 ? Math.abs(signed) : 0), receive: credit || (signed > 0 ? signed : 0) };
  });
}
function getOfxValue(record, tag) {
  const match = record.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i'));
  return match ? match[1].trim() : '';
}
function parseOfx(text) {
  return text.split(/<STMTTRN>/i).slice(1).map((record, index) => {
    const signed = amount(getOfxValue(record, 'TRNAMT'));
    const rawDate = getOfxValue(record, 'DTPOSTED').slice(0, 8);
    const date = /^\d{8}$/.test(rawDate) ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}` : today();
    const fitId = getOfxValue(record, 'FITID');
    return { id: fitId || `ofx-${index}-${date}-${signed}`, fitId, date, payee: getOfxValue(record, 'NAME') || 'Unknown Payee', memo: getOfxValue(record, 'MEMO'), spend: signed < 0 ? Math.abs(signed) : 0, receive: signed > 0 ? signed : 0 };
  });
}
async function importBankFile() {
  const selected = await window.vault.selectBankFile();
  if (!selected) return;
  if (/<OFX|<STMTTRN>/i.test(selected.content)) return await finishImport(parseOfx(selected.content), selected.name);
  const rows = csvRows(selected.content);
  if (rows.length < 2) { setStatus(`No transactions found in ${selected.name}. Check its format.`, 'error'); return; }
  pendingImport = { name: selected.name, rows };
  renderMappingInterface(rows, selected.name);
}
async function finishImport(parsed, name) {
  if (!parsed.length) { setStatus(`No transactions found in ${name}. Check its format.`, 'error'); return; }
  const accountId = document.getElementById('import-account').value;
  const keys = new Set(state.transactions.map(tx => tx.fitId ? `fit:${tx.fitId}` : `${tx.accountId}|${tx.date}|${tx.payee}|${tx.spend}|${tx.receive}`));
  let added = 0, skipped = 0;
  parsed.forEach(tx => {
    const key = tx.fitId ? `fit:${tx.fitId}` : `${accountId}|${tx.date}|${tx.payee}|${tx.spend}|${tx.receive}`;
    if (keys.has(key)) { skipped += 1; return; }
    keys.add(key); state.transactions.push({ ...tx, id: makeId(), accountId, category: 'Imported', tag: '', cleared: 'c', isEditing: false }); added += 1;
  });
  state.transactions.sort((a, b) => b.date.localeCompare(a.date));
  renderTransactions(); updateUI(); await persist();
  setStatus(`Imported ${added} transaction${added === 1 ? '' : 's'} from ${name}; skipped ${skipped} duplicate${skipped === 1 ? '' : 's'}.`, 'success');
  showPage('dashboard');
}
function renderMappingInterface(rows, name) {
  const fields = ['date', 'description', 'amount', 'debit', 'credit', 'memo'];
  const headings = rows[0]; const template = state.importTemplates?.find(item => item.headers?.join('|') === headings.join('|'));
  document.getElementById('mapping-file-name').textContent = `${name}: choose where each field lives. Preview: ${headings.join(' · ')}`;
  const holder = document.getElementById('mapping-fields'); holder.replaceChildren();
  fields.forEach(field => { const label = document.createElement('label'); label.textContent = field[0].toUpperCase() + field.slice(1); const select = document.createElement('select'); select.dataset.field = field; select.add(new Option('Not mapped', '')); headings.forEach((heading, index) => select.add(new Option(`${heading || `Column ${index + 1}`}`, index))); const inferred = template?.mapping?.[field] ?? inferColumn(headings, field); select.value = inferred === '' || inferred === undefined ? '' : inferred; label.append(select); holder.append(label); });
  document.getElementById('mapping-template-name').value = template?.name || '';
  document.getElementById('mapping-panel').hidden = false;
}
function inferColumn(headings, field) { const aliases = { date: ['date', 'transactiondate'], description: ['description', 'payee', 'name'], amount: ['amount', 'transactionamount'], debit: ['debit', 'withdrawal'], credit: ['credit', 'deposit'], memo: ['memo', 'notes'] }; const index = headings.findIndex(h => aliases[field].includes(safeText(h).toLowerCase().replace(/[^a-z]/g, ''))); return index < 0 ? '' : index; }
async function confirmMappedImport() {
  if (!pendingImport) return; const mapping = Object.fromEntries([...document.querySelectorAll('#mapping-fields select')].map(select => [select.dataset.field, select.value]));
  if (mapping.date === '' || mapping.description === '' || (mapping.amount === '' && mapping.debit === '' && mapping.credit === '')) { setStatus('Map Date, Description, and either Amount or Debit/Credit.', 'error'); return; }
  const name = document.getElementById('mapping-template-name').value.trim();
  if (name) { state.importTemplates = (state.importTemplates || []).filter(template => template.name !== name); state.importTemplates.push({ name, headers: pendingImport.rows[0], mapping }); await persist(); }
  const [headers, ...records] = pendingImport.rows; const value = (record, field) => mapping[field] === '' ? '' : record[Number(mapping[field])] || '';
  const parsed = records.filter(record => record.some(Boolean)).map((record, index) => { const signed = amount(value(record, 'amount')); const debit = amount(value(record, 'debit')); const credit = amount(value(record, 'credit')); return { id: `mapped-${index}`, date: value(record, 'date') || today(), payee: value(record, 'description') || 'Unknown Payee', memo: value(record, 'memo'), spend: debit || (signed < 0 ? Math.abs(signed) : 0), receive: credit || (signed > 0 ? signed : 0) }; });
  document.getElementById('mapping-panel').hidden = true; pendingImport = null; await finishImport(parsed, name || 'mapped statement');
}

function generateCategoryReport() {
  const start = document.getElementById('report-start').value, end = document.getElementById('report-end').value;
  const inRange = tx => (!start || tx.date >= start) && (!end || tx.date <= end);
  const transactions = state.transactions.filter(inRange);
  const income = transactions.reduce((sum, tx) => sum + amount(tx.receive), 0);
  const spending = transactions.reduce((sum, tx) => sum + amount(tx.spend), 0);
  const summarize = field => transactions.reduce((totals, tx) => {
    const entries = field === 'receive' && tx.splits?.length
      ? tx.splits.map(split => ({ category: split.category, value: split.amount }))
      : [{ category: tx.category, value: tx[field] }];
    entries.forEach(entry => {
      if (amount(entry.value) <= 0) return;
      const { type, category } = splitCategory(entry.category || 'Uncategorized');
      const group = type || 'Other';
      if (!totals.has(group)) totals.set(group, new Map());
      const categories = totals.get(group);
      categories.set(category || 'Uncategorized', amount((categories.get(category || 'Uncategorized') || 0) + amount(entry.value)));
    });
    return totals;
  }, new Map());
  const renderSummary = (target, totals, total, label) => {
    target.replaceChildren();
    if (!totals.size) { const empty = document.createElement('div'); empty.className = 'report-row empty-row'; empty.textContent = 'No transactions in this period.'; target.append(empty); }
    [...totals.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([type, categories]) => {
      const groupTotal = [...categories.values()].reduce((sum, value) => sum + value, 0);
      const parent = document.createElement('div'); parent.className = 'report-row parent-cat';
      parent.append(Object.assign(document.createElement('span'), { textContent: type }), Object.assign(document.createElement('span'), { textContent: money.format(groupTotal) })); target.append(parent);
      [...categories.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([category, value]) => {
        const row = document.createElement('div'); row.className = 'report-row sub-cat';
        row.append(Object.assign(document.createElement('span'), { textContent: category }), Object.assign(document.createElement('span'), { textContent: money.format(value) })); target.append(row);
      });
    });
    const totalRow = document.createElement('div'); totalRow.className = 'report-row total-row';
    const name = document.createElement('span'); name.textContent = label;
    const valueNode = document.createElement('span'); valueNode.textContent = money.format(total);
    totalRow.append(name, valueNode); target.append(totalRow);
  };
  renderSummary(document.getElementById('income-report-table'), summarize('receive'), income, 'TOTAL INCOME');
  renderSummary(document.getElementById('spending-report-table'), summarize('spend'), spending, 'TOTAL SPENDING');
  document.getElementById('report-net-flow').textContent = money.format(income - spending);
  renderSleuthAlerts();
}
function renderSleuthAlerts() {
  const alerts = []; const patterns = recurringPatterns();
  patterns.filter(p => p.direction === 'expense').forEach(p => {
    const label = normalizedPayee(p.payee);
    if (/fee|overdraft|atm charge|service charge/.test(label)) alerts.push({ type: 'Fee', text: `${p.payee}: recurring charge averaging ${money.format(p.average)}.` });
    const values = p.items.map(tx => amount(tx.spend));
    if (values.length >= 3 && values.at(-1) > values[0] * 1.08) alerts.push({ type: 'Price increase', text: `${p.payee} rose from ${money.format(values[0])} to ${money.format(values.at(-1))}.` });
    if (/subscription|stream|netflix|spotify|membership|prime|icloud|gym/.test(label)) alerts.push({ type: 'Subscription', text: `${p.payee}: approximately every ${p.cadence} days at ${money.format(p.average)}.` });
  });
  const holder = document.getElementById('sleuth-alerts'); holder.replaceChildren();
  if (!alerts.length) { holder.textContent = 'No recurring fees, rising charges, or recognizable subscriptions detected yet.'; return; }
  alerts.forEach(alert => { const row = document.createElement('div'); row.className = 'sleuth-alert'; const text = document.createElement('span'); text.textContent = `${alert.type}: ${alert.text}`; const button = document.createElement('button'); button.type = 'button'; button.className = 'secondary-btn'; button.textContent = 'Create dispute note'; button.addEventListener('click', () => { navigator.clipboard?.writeText(`I am requesting a review of this ${alert.type.toLowerCase()}: ${alert.text}`); setStatus('Dispute note copied to your clipboard.', 'success'); }); row.append(text, button); holder.append(row); });
}
function renderForecast() {
  const horizon = Number(document.getElementById('forecast-days').value); const events = [];
  recurringPatterns().forEach(pattern => { let date = addDays(pattern.latest.date, pattern.cadence); while (date <= addDays(today(), horizon)) { if (date >= today()) events.push({ date, delta: pattern.direction === 'income' ? pattern.average : -pattern.average, label: pattern.payee }); date = addDays(date, pattern.cadence); } });
  const simulated = amount(document.getElementById('simulation-amount').value); const simulationDate = document.getElementById('simulation-date').value || today(); const delay = Number(document.getElementById('simulation-delay').value) || 0; if (simulated) events.push({ date: addDays(simulationDate, delay), delta: -simulated, label: 'Simulated purchase' });
  let balance = liquidCash(); let low = balance; const byDate = new Map(); events.forEach(event => byDate.set(event.date, [...(byDate.get(event.date) || []), event])); const points = [];
  for (let day = 0; day <= horizon; day += 1) { const date = addDays(today(), day); (byDate.get(date) || []).forEach(event => balance += event.delta); low = Math.min(low, balance); points.push({ date, balance }); }
  document.getElementById('forecast-low').textContent = `Projected low: ${money.format(low)}`; document.getElementById('forecast-note').textContent = `${events.length} inferred/simulated event${events.length === 1 ? '' : 's'} included.`;
  const max = Math.max(...points.map(point => Math.abs(point.balance)), 1); const timeline = document.getElementById('cashflow-timeline'); timeline.replaceChildren(); points.filter((_, index) => index % Math.max(1, Math.ceil(horizon / 15)) === 0 || index === points.length - 1).forEach(point => { const bar = document.createElement('div'); bar.className = 'timeline-point'; const fill = document.createElement('i'); fill.style.height = `${Math.max(5, Math.abs(point.balance) / max * 100)}%`; fill.classList.toggle('negative', point.balance < 0); bar.append(fill); const label = document.createElement('small'); label.textContent = `${point.date.slice(5)}\n${money.format(point.balance)}`; bar.append(label); timeline.append(bar); });
  const list = document.getElementById('recurring-list'); list.replaceChildren(); const patterns = recurringPatterns(); if (!patterns.length) list.textContent = 'Import at least two similar transactions to detect a repeating pattern.'; patterns.forEach(pattern => { const item = document.createElement('div'); item.className = 'recurring-item'; item.textContent = `${pattern.payee} · ${pattern.direction} · every ~${pattern.cadence} days · ${money.format(pattern.average)}`; list.append(item); });
}
function renderCategoryManager() {
  const list = document.getElementById('category-type-list'); const types = document.getElementById('category-types');
  list.replaceChildren(); types.replaceChildren();
  Object.entries(state.categoryTypes).sort(([a], [b]) => a.localeCompare(b)).forEach(([type, categories]) => {
    types.append(new Option(type, type));
    const card = document.createElement('section'); card.className = 'category-type-card';
    const title = document.createElement('h3'); title.textContent = type; card.append(title);
    if (!categories.length) { const empty = document.createElement('span'); empty.textContent = 'No categories yet'; card.append(empty); }
    categories.forEach(category => { const chip = document.createElement('span'); chip.className = 'category-chip'; chip.append(document.createTextNode(category)); const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label', `Remove ${category}`); remove.addEventListener('click', () => removeCategory(type, category)); chip.append(remove); card.append(chip); });
    list.append(card);
  });
}
function openCategoryManager() { document.getElementById('category-modal').hidden = false; renderCategoryManager(); document.getElementById('category-type-input').focus(); }
function closeCategoryManager() { document.getElementById('category-modal').hidden = true; }
async function addCategory(event) {
  event.preventDefault(); const type = document.getElementById('category-type-input').value.trim(); const category = document.getElementById('category-name-input').value.trim();
  if (!type || !category) return;
  state.categoryTypes[type] = state.categoryTypes[type] || [];
  if (state.categoryTypes[type].some(item => item.toLocaleLowerCase() === category.toLocaleLowerCase())) { setStatus('That category already exists for this transaction type.', 'error'); return; }
  state.categoryTypes[type].push(category); event.target.reset(); renderCategoryManager(); await persist(); setStatus(`${category} added to ${type}.`, 'success');
  closeCategoryManager();
}
async function removeCategory(type, category) {
  if (!window.confirm(`Remove “${category}” from ${type}? Existing transactions will keep this category.`)) return;
  state.categoryTypes[type] = state.categoryTypes[type].filter(item => item !== category); renderCategoryManager(); await persist(); setStatus(`${category} removed.`, 'success');
}
function showPage(page) {
  dashboardPage.hidden = page !== 'dashboard';
  reportsPage.hidden = page !== 'reports';
  importPage.hidden = page !== 'import';
  planningPage.hidden = page !== 'planning';
  navItems.forEach(item => item.classList.toggle('active', item.dataset.page === page));
  if (page === 'reports') generateCategoryReport();
  if (page === 'planning') renderForecast();
}
function populateAccountSelectors() {
  const importSelect = document.getElementById('import-account'); importSelect.replaceChildren();
  state.accounts.forEach(account => importSelect.add(new Option(account.name, account.id)));
}
async function start() {
  state = await window.vault.load();
  state.accounts = state.accounts.length ? state.accounts : [];
  state.categoryTypes = normalizedCategoryTypes(state.categoryTypes);
  state.planning = { safetyBuffer: amount(state.planning?.safetyBuffer), goalReserve: amount(state.planning?.goalReserve) };
  state.importTemplates = Array.isArray(state.importTemplates) ? state.importTemplates : [];
  state.transactions = state.transactions.map(tx => ({ ...tx, id: tx.id || makeId(), accountId: tx.accountId || state.accounts[0]?.id, isEditing: false, spend: amount(tx.spend), receive: amount(tx.receive) }));
  showPage('dashboard');
  populateAccountSelectors(); updateUI(); renderTransactions();
  document.getElementById('add-transaction-btn').addEventListener('click', addTransaction);
  document.getElementById('all-accounts-btn').addEventListener('click', () => {
    selectedAccountId = null;
    renderTransactions();
    renderAccountList();
  });
  document.getElementById('show-add-account-btn').addEventListener('click', showAddAccountForm);
  document.getElementById('cancel-add-account-btn').addEventListener('click', hideAddAccountForm);
  document.getElementById('add-account-form').addEventListener('submit', addAccount);
  document.getElementById('select-file-btn').addEventListener('click', importBankFile);
  document.getElementById('confirm-import-btn').addEventListener('click', confirmMappedImport);
  document.getElementById('cancel-import-btn').addEventListener('click', () => { pendingImport = null; document.getElementById('mapping-panel').hidden = true; });
  document.getElementById('safety-plan-form').addEventListener('submit', async event => { event.preventDefault(); state.planning = { safetyBuffer: amount(document.getElementById('safety-buffer').value), goalReserve: amount(document.getElementById('goal-reserve').value) }; updateUI(); await persist(); setStatus('Safe-to-spend plan saved.', 'success'); });
  document.getElementById('update-forecast-btn').addEventListener('click', renderForecast);
  document.getElementById('forecast-days').addEventListener('change', renderForecast);
  document.getElementById('refresh-report-btn').addEventListener('click', generateCategoryReport);
  document.getElementById('add-split-row-btn').addEventListener('click', addSplitRow);
  document.getElementById('save-splits-btn').addEventListener('click', saveTransactionSplit);
  document.getElementById('close-split-modal-btn').addEventListener('click', closeSplitEditor);
  document.getElementById('cancel-splits-btn').addEventListener('click', closeSplitEditor);
  document.getElementById('split-modal').addEventListener('click', event => { if (event.target === event.currentTarget) closeSplitEditor(); });
  document.getElementById('close-category-modal-btn').addEventListener('click', closeCategoryManager);
  document.getElementById('done-categories-btn').addEventListener('click', closeCategoryManager);
  document.getElementById('category-modal').addEventListener('click', event => { if (event.target === event.currentTarget) closeCategoryManager(); });
  document.getElementById('add-category-form').addEventListener('submit', addCategory);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { closeCategoryManager(); closeSplitEditor(); } });
  window.vault.onOpenCategoryManager(openCategoryManager);
  navItems.forEach(item => item.addEventListener('click', () => showPage(item.dataset.page)));
  setStatus('Ready.', 'success');
}
start();
