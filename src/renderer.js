let state = { accounts: [], transactions: [] };
let selectedAccountId = null;

const dashboardPage = document.getElementById('dashboard-page');
const reportsPage = document.getElementById('reports-page');
const importPage = document.getElementById('import-page');
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

function updateUI() {
  const current = balances();
  const totalCash = current.filter(a => a.balance >= 0).reduce((sum, a) => sum + a.balance, 0);
  const totalDebt = current.filter(a => a.balance < 0).reduce((sum, a) => sum + Math.abs(a.balance), 0);
  document.getElementById('total-cash').textContent = money.format(totalCash);
  document.getElementById('total-debt').textContent = money.format(totalDebt);
  document.getElementById('net-worth').textContent = money.format(totalCash - totalDebt);
  document.getElementById('all-accounts-balance').textContent = money.format(totalCash - totalDebt);
  renderAccountList(current);
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
      row.append(inputCell('text', tx.category));
      row.append(inputCell('text', tx.tag));
      row.append(inputCell('text', tx.cleared, 'edit-small'));
      row.append(inputCell('number', tx.spend));
      row.append(inputCell('number', tx.receive));
      row.append(makeCell(money.format(amount(tx.receive) - amount(tx.spend))));
      const accountCell = document.createElement('td'); accountCell.append(accountSelect(tx.accountId)); row.append(accountCell);
      const action = document.createElement('td'); action.className = 'transaction-actions';
      const save = document.createElement('button'); save.type = 'button'; save.textContent = 'Save';
      save.addEventListener('click', () => saveRow(index));
      action.append(save, removeButton(index)); row.append(action);
    } else {
      row.append(makeCell(tx.date));
      const payee = makeCell(tx.payee); payee.className = 'payee'; row.append(payee);
      row.append(makeCell(tx.category)); row.append(makeCell(tx.tag)); row.append(makeCell(tx.cleared, 'text-center'));
      row.append(makeCell(tx.spend > 0 ? money.format(tx.spend) : '', 'neg'));
      row.append(makeCell(tx.receive > 0 ? money.format(tx.receive) : '', 'pos'));
      row.append(makeCell(money.format(amount(tx.receive) - amount(tx.spend))));
      row.append(makeCell(accountById(tx.accountId)?.name ?? 'Unassigned'));
      const action = document.createElement('td'); action.className = 'transaction-actions';
      const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = 'Edit';
      edit.addEventListener('click', () => { tx.isEditing = true; renderTransactions(); });
      action.append(edit, removeButton(index)); row.append(action);
    }
    const memoRow = document.createElement('tr'); memoRow.className = 'memo-row';
    const memo = document.createElement('td'); memo.colSpan = 10;
    if (tx.isEditing) { const input = document.createElement('input'); input.type = 'text'; input.value = safeText(tx.memo); input.className = 'edit-input memo-edit'; input.placeholder = 'Enter memo'; memo.append(input); }
    else memo.textContent = tx.memo || 'No memo';
    memoRow.append(memo); body.append(row, memoRow);
  });
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

function saveRow(index) {
  const rows = document.querySelectorAll('#transaction-body .main-row');
  const fields = rows[index].querySelectorAll('input, select');
  const memo = document.querySelectorAll('#transaction-body .memo-row input')[index];
  const [date, payee, category, tag, cleared, spend, receive, account] = fields;
  const outgoing = amount(spend.value), incoming = amount(receive.value);
  if (!date.value || !payee.value.trim() || (outgoing > 0 && incoming > 0) || (outgoing < 0 || incoming < 0)) {
    setStatus('Enter a date and payee, with either a non-negative spend or receive amount.', 'error'); return;
  }
  Object.assign(state.transactions[index], { date: date.value, payee: payee.value.trim(), category: category.value.trim() || 'Uncategorized', tag: tag.value.trim(), cleared: cleared.value.trim(), spend: outgoing, receive: incoming, accountId: account.value, memo: memo.value.trim(), isEditing: false });
  renderTransactions(); updateUI(); persist();
}

function addTransaction() {
  state.transactions.unshift({ id: makeId(), date: today(), payee: '', category: 'Uncategorized', tag: '', memo: '', cleared: '', spend: 0, receive: 0, accountId: selectedAccountId || state.accounts[0]?.id, isEditing: true });
  renderTransactions();
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
  const parsed = /<OFX|<STMTTRN>/i.test(selected.content) ? parseOfx(selected.content) : parseCsv(selected.content);
  if (!parsed.length) { setStatus(`No transactions found in ${selected.name}. Check its format.`, 'error'); return; }
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
  setStatus(`Imported ${added} transaction${added === 1 ? '' : 's'}; skipped ${skipped} duplicate${skipped === 1 ? '' : 's'}.`, 'success');
  showPage('dashboard');
}

function generateCategoryReport() {
  const start = document.getElementById('report-start').value, end = document.getElementById('report-end').value;
  const inRange = tx => (!start || tx.date >= start) && (!end || tx.date <= end);
  const transactions = state.transactions.filter(inRange);
  const income = transactions.reduce((sum, tx) => sum + amount(tx.receive), 0);
  const spending = transactions.reduce((sum, tx) => sum + amount(tx.spend), 0);
  const summarize = (field) => transactions.reduce((totals, tx) => {
    if (amount(tx[field]) > 0) {
      const category = tx.category || 'Uncategorized';
      totals.set(category, amount((totals.get(category) || 0) + amount(tx[field])));
    }
    return totals;
  }, new Map());
  const renderSummary = (target, totals, total, label) => {
    target.replaceChildren();
    [...totals.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([category, value]) => {
      const row = document.createElement('div'); row.className = 'report-row';
      const name = document.createElement('span'); name.textContent = category;
      const valueNode = document.createElement('span'); valueNode.textContent = money.format(value);
      row.append(name, valueNode); target.append(row);
    });
    const totalRow = document.createElement('div'); totalRow.className = 'report-row total-row';
    const name = document.createElement('span'); name.textContent = label;
    const valueNode = document.createElement('span'); valueNode.textContent = money.format(total);
    totalRow.append(name, valueNode); target.append(totalRow);
  };
  renderSummary(document.getElementById('income-report-table'), summarize('receive'), income, 'TOTAL INCOME');
  renderSummary(document.getElementById('spending-report-table'), summarize('spend'), spending, 'TOTAL SPENDING');
  document.getElementById('report-net-flow').textContent = money.format(income - spending);
}
function showPage(page) {
  dashboardPage.hidden = page !== 'dashboard';
  reportsPage.hidden = page !== 'reports';
  importPage.hidden = page !== 'import';
  navItems.forEach(item => item.classList.toggle('active', item.dataset.page === page));
  if (page === 'reports') generateCategoryReport();
}
function populateAccountSelectors() {
  const importSelect = document.getElementById('import-account'); importSelect.replaceChildren();
  state.accounts.forEach(account => importSelect.add(new Option(account.name, account.id)));
}
async function start() {
  state = await window.vault.load();
  state.accounts = state.accounts.length ? state.accounts : [];
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
  document.getElementById('refresh-report-btn').addEventListener('click', generateCategoryReport);
  navItems.forEach(item => item.addEventListener('click', () => showPage(item.dataset.page)));
  setStatus('Ready.', 'success');
}
start();
