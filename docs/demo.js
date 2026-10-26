const STORAGE_KEY = 'vaultcompute-demo-state';
const state = { accounts: [], transactions: [] };
let selectedAccountId = null;
let pendingReview = null;

const dashboardPage = document.getElementById('dashboard-page');
const reportsPage = document.getElementById('reports-page');
const importPage = document.getElementById('import-page');
const navItems = document.querySelectorAll('.nav-item');
const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' });

const safeText = value => String(value ?? '');
const amount = value => Number.isFinite(Number(value)) ? Math.round(Number(value) * 100) / 100 : 0;
const makeId = () => Math.random().toString(36).slice(2, 11);
const today = () => new Date().toISOString().slice(0, 10);

function accountById(id) {
  return state.accounts.find(account => account.id === id);
}

function accountBalance(account) {
  return amount(account.openingBalance + state.transactions
    .filter(tx => tx.accountId === account.id || tx.paymentFromAccountId === account.id)
    .reduce((sum, tx) => sum
      + (tx.accountId === account.id ? amount(tx.receive) - amount(tx.spend) : 0)
      - (tx.paymentFromAccountId === account.id ? amount(tx.paymentAmount) : 0), 0));
}

function isCreditCard(account) { return account?.accountKind === 'credit-card' || account?.type === 'debt'; }

function balances() {
  return state.accounts.map(account => ({ ...account, balance: accountBalance(account) }));
}

function setStatus(message, kind = '') {
  const status = document.getElementById('app-status');
  status.textContent = message;
  status.className = kind;
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
  input.type = type;
  input.value = safeText(value);
  input.className = className || 'edit-input';
  cell.appendChild(input);
  return cell;
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

function renderAccountList(currentAccounts = balances()) {
  const list = document.getElementById('account-list');
  list.replaceChildren();
  document.getElementById('all-accounts-btn').classList.toggle('active', selectedAccountId === null);

  currentAccounts.forEach(account => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'account-pill';
    button.classList.toggle('active', account.id === selectedAccountId);

    const name = document.createElement('span');
    name.textContent = account.name;

    const balance = document.createElement('span');
    balance.className = 'balance';
    balance.textContent = money.format(account.balance);
    if (account.balance < 0) balance.classList.add('negative-balance');

    button.append(name, balance);
    button.addEventListener('click', () => {
      selectedAccountId = account.id;
      renderTransactions();
      renderAccountList();
    });

    list.appendChild(button);
  });
}

function renderTransactions() {
  const body = document.getElementById('transaction-body');
  body.replaceChildren();

  const visibleTransactions = state.transactions
    .map((tx, index) => ({ tx, index }))
    .filter(({ tx }) => selectedAccountId === null || tx.accountId === selectedAccountId || tx.paymentFromAccountId === selectedAccountId);

  const selectedAccount = accountById(selectedAccountId);
  document.getElementById('transaction-heading').textContent = selectedAccount
    ? `${selectedAccount.name} Transactions`
    : 'Recent Transactions';

  visibleTransactions.forEach(({ tx, index }) => {
    const shownAsPaymentSource = Boolean(tx.paymentFromAccountId && selectedAccountId === tx.paymentFromAccountId);
    const shownSpend = shownAsPaymentSource ? amount(tx.paymentAmount) : amount(tx.spend);
    const shownReceive = shownAsPaymentSource ? 0 : amount(tx.receive);
    const row = document.createElement('tr');
    row.className = 'main-row';

    if (tx.isEditing) {
      row.append(inputCell('date', tx.date));
      row.append(inputCell('text', tx.payee));
      row.append(inputCell('text', tx.category));
      row.append(inputCell('text', tx.tag));
      row.append(inputCell('text', tx.cleared, 'edit-input'));
      row.append(inputCell('number', tx.spend));
      row.append(inputCell('number', tx.receive));
      row.append(makeCell(money.format(amount(tx.receive) - amount(tx.spend))));

      const accountCell = document.createElement('td');
      accountCell.appendChild(accountSelect(tx.accountId));
      row.append(accountCell);

      const action = document.createElement('td');
      action.className = 'transaction-actions';
      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.textContent = 'Save';
      saveBtn.addEventListener('click', () => saveRow(index));
      action.append(saveBtn, removeButton(index));
      row.append(action);
    } else {
      row.append(makeCell(tx.date));
      const payee = makeCell(tx.payee);
      payee.className = 'payee';
      row.append(payee);
      row.append(makeCell(tx.category));
      row.append(makeCell(tx.tag));
      row.append(makeCell(tx.cleared, 'text-center'));
      row.append(makeCell(shownSpend > 0 ? money.format(shownSpend) : '', 'neg'));
      row.append(makeCell(shownReceive > 0 ? money.format(shownReceive) : '', 'pos'));
      row.append(makeCell(money.format(shownReceive - shownSpend)));
      const accountCell = makeCell(accountById(tx.accountId)?.name ?? 'Unassigned');
      if (tx.paymentFromAccountId) accountCell.textContent += ` · paid from ${accountById(tx.paymentFromAccountId)?.name ?? 'Unassigned'}`;
      row.append(accountCell);

      const action = document.createElement('td');
      action.className = 'transaction-actions';
      if (!tx.isPayment) {
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.textContent = 'Edit';
        edit.addEventListener('click', () => { tx.isEditing = true; renderTransactions(); });
        action.append(edit);
      }
      action.append(removeButton(index));
      row.append(action);
    }

    const memoRow = document.createElement('tr');
    memoRow.className = 'memo-row';
    const memo = document.createElement('td');
    memo.colSpan = 10;
    if (tx.isEditing) {
      const input = document.createElement('input');
      input.type = 'text';
      input.value = safeText(tx.memo);
      input.className = 'edit-input memo-edit';
      input.placeholder = 'Enter memo';
      memo.appendChild(input);
    } else {
      memo.textContent = tx.memo || 'No memo';
    }
    memoRow.appendChild(memo);
    body.append(row, memoRow);
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
  const outgoing = amount(spend.value);
  const incoming = amount(receive.value);

  if (!date.value || !payee.value.trim() || (outgoing > 0 && incoming > 0) || (outgoing < 0 || incoming < 0)) {
    setStatus('Enter a date and payee, with either a non-negative spend or receive amount.', 'error');
    return;
  }

  Object.assign(state.transactions[index], {
    date: date.value,
    payee: payee.value.trim(),
    category: category.value.trim() || 'Uncategorized',
    tag: tag.value.trim(),
    cleared: cleared.value.trim(),
    spend: outgoing,
    receive: incoming,
    accountId: account.value,
    memo: memo ? memo.value.trim() : '',
    isEditing: false,
  });

  renderTransactions();
  updateUI();
  persist();
}

function addTransaction() {
  state.transactions.unshift({
    id: makeId(),
    date: today(),
    payee: '',
    category: 'Uncategorized',
    tag: '',
    memo: '',
    cleared: 'c',
    spend: 0,
    receive: 0,
    accountId: selectedAccountId || state.accounts[0]?.id,
    isEditing: true,
  });
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

function addAccount(event) {
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
    accountKind,
  };

  state.accounts.push(account);
  selectedAccountId = account.id;
  hideAddAccountForm();
  populateAccountSelectors();
  updateUI();
  renderTransactions();
  persist();
  setStatus(`${name} added.`, 'success');
}

function generateCategoryReport() {
  const start = document.getElementById('report-start').value;
  const end = document.getElementById('report-end').value;
  const inRange = tx => (!start || tx.date >= start) && (!end || tx.date <= end);

  const transactions = state.transactions.filter(tx => inRange(tx) && !tx.paymentFromAccountId);
  const income = transactions.reduce((sum, tx) => sum + amount(tx.receive), 0);
  const spending = transactions.reduce((sum, tx) => sum + amount(tx.spend), 0);

  const summarize = field => transactions.reduce((totals, tx) => {
    if (amount(tx[field]) > 0) {
      const category = tx.category || 'Uncategorized';
      totals.set(category, amount((totals.get(category) || 0) + amount(tx[field])));
    }
    return totals;
  }, new Map());

  const renderSummary = (target, totals, total, label) => {
    target.replaceChildren();
    [...totals.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([category, value]) => {
      const row = document.createElement('div');
      row.className = 'report-row';
      const name = document.createElement('span');
      name.textContent = category;
      const valueNode = document.createElement('span');
      valueNode.textContent = money.format(value);
      row.append(name, valueNode);
      target.appendChild(row);
    });

    const totalRow = document.createElement('div');
    totalRow.className = 'report-row total-row';
    const totalName = document.createElement('span');
    totalName.textContent = label;
    const totalValue = document.createElement('span');
    totalValue.textContent = money.format(total);
    totalRow.append(totalName, totalValue);
    target.appendChild(totalRow);
  };

  renderSummary(document.getElementById('income-report-table'), summarize('receive'), income, 'TOTAL INCOME');
  renderSummary(document.getElementById('spending-report-table'), summarize('spend'), spending, 'TOTAL SPENDING');
  document.getElementById('report-net-flow').textContent = money.format(income - spending);
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

function showPage(page) {
  dashboardPage.hidden = page !== 'dashboard';
  reportsPage.hidden = page !== 'reports';
  importPage.hidden = page !== 'import';
  navItems.forEach(item => item.classList.toggle('active', item.dataset.page === page));
  if (page === 'reports') generateCategoryReport();
}

function populateAccountSelectors() {
  const importSelect = document.getElementById('import-account');
  importSelect.replaceChildren();
  state.accounts.forEach(account => importSelect.add(new Option(account.name, account.id)));
}

function openCardPayment() {
  const cards = state.accounts.filter(isCreditCard);
  const sources = state.accounts.filter(account => !isCreditCard(account));
  if (!cards.length || !sources.length) return setStatus('Add a credit card and a cash account before recording a payment.', 'error');
  const cardSelect = document.getElementById('payment-card');
  const sourceSelect = document.getElementById('payment-source');
  cardSelect.replaceChildren(...cards.map(account => new Option(account.name, account.id)));
  sourceSelect.replaceChildren(...sources.map(account => new Option(account.name, account.id)));
  if (selectedAccountId && isCreditCard(accountById(selectedAccountId))) cardSelect.value = selectedAccountId;
  if (selectedAccountId && !isCreditCard(accountById(selectedAccountId))) sourceSelect.value = selectedAccountId;
  document.getElementById('payment-date').value = today();
  document.getElementById('payment-amount').value = '';
  document.getElementById('card-payment-modal').hidden = false;
}

function closeCardPayment() { document.getElementById('card-payment-modal').hidden = true; }

function saveCardPayment(event) {
  event.preventDefault();
  const card = accountById(document.getElementById('payment-card').value);
  const source = accountById(document.getElementById('payment-source').value);
  const payment = amount(document.getElementById('payment-amount').value);
  const date = document.getElementById('payment-date').value;
  if (!isCreditCard(card) || !source || isCreditCard(source) || payment <= 0 || !date) return setStatus('Choose a card, a cash account, a date, and a payment greater than zero.', 'error');
  state.transactions.unshift({ id: makeId(), date, payee: `${card.name} payment`, category: 'Account transfer', tag: '', memo: 'Credit card payment', cleared: '', spend: 0, receive: payment, accountId: card.id, paymentFromAccountId: source.id, paymentAmount: payment, isPayment: true });
  closeCardPayment(); renderTransactions(); updateUI(); persist();
  setStatus(`${money.format(payment)} payment recorded for ${card.name}.`, 'success');
}

function parseImportAmount(value) {
  const text = safeText(value).trim();
  const negativeParens = /^\(.*\)$/.test(text);
  const number = Number(text.replace(/[,$\s]/g, '').replace(/[()]/g, ''));
  return amount(negativeParens ? -Math.abs(number) : number);
}

function csvToRows(text) {
  const rows = []; let row = []; let field = ''; let quoted = false;
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

function parseDemoImport(text) {
  if (/<STMTTRN>/i.test(text)) {
    return text.split(/<STMTTRN>/i).slice(1).map((record, index) => {
      const get = tag => record.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i'))?.[1]?.trim() || '';
      const signed = parseImportAmount(get('TRNAMT')); const rawDate = get('DTPOSTED').slice(0, 8);
      const date = /^\d{8}$/.test(rawDate) ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}` : today();
      return { id: get('FITID') || `ofx-${index}`, fitId: get('FITID'), date, payee: get('NAME') || 'Unknown Payee', memo: get('MEMO'), spend: signed < 0 ? -signed : 0, receive: signed > 0 ? signed : 0 };
    });
  }
  const rows = csvToRows(text); if (rows.length < 2) return [];
  const headings = rows.shift().map(value => value.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const col = names => headings.findIndex(value => names.includes(value));
  const dateCol = col(['date', 'transactiondate']), payeeCol = col(['description', 'payee', 'name', 'merchant']);
  const amountCol = col(['amount', 'transactionamount']), debitCol = col(['debit', 'withdrawal', 'withdrawals']), creditCol = col(['credit', 'deposit', 'deposits']);
  const memoCol = col(['memo', 'notes']); const fitCol = col(['fitid', 'transactionid']);
  if (dateCol < 0 || payeeCol < 0 || (amountCol < 0 && debitCol < 0 && creditCol < 0)) return [];
  return rows.map((record, index) => {
    const signed = amountCol >= 0 ? parseImportAmount(record[amountCol]) : 0;
    const debit = debitCol >= 0 ? Math.abs(parseImportAmount(record[debitCol])) : 0;
    const credit = creditCol >= 0 ? Math.abs(parseImportAmount(record[creditCol])) : 0;
    return { id: `csv-${index}`, fitId: fitCol >= 0 ? record[fitCol] : '', date: record[dateCol] || today(), payee: record[payeeCol] || 'Unknown Payee', memo: memoCol >= 0 ? record[memoCol] : '', spend: debit || (signed < 0 ? -signed : 0), receive: credit || (signed > 0 ? signed : 0) };
  });
}

function showImportReview(parsed, fileName) {
  if (!parsed.length) return setStatus(`No transactions found in ${fileName}. Check its format.`, 'error');
  pendingReview = { parsed, fileName };
  const account = accountById(document.getElementById('import-account').value);
  document.getElementById('import-review-summary').textContent = `${fileName} · ${parsed.length} transactions · Account: ${account?.name || 'not selected'}`;
  document.getElementById('reverse-import-amounts').checked = false;
  const body = document.getElementById('import-review-rows'); body.replaceChildren();
  parsed.forEach((tx, index) => {
    const row = document.createElement('tr'); row.dataset.index = index;
    for (const [field, type, value] of [['date', 'date', tx.date || today()], ['payee', 'text', tx.payee], ['spend', 'number', amount(tx.spend) || ''], ['receive', 'number', amount(tx.receive) || ''], ['memo', 'text', tx.memo]]) {
      const cell = document.createElement('td'); const input = document.createElement('input'); input.type = type; input.dataset.field = field; input.value = safeText(value);
      if (type === 'number') { input.min = '0'; input.step = '0.01'; }
      cell.append(input); row.append(cell);
    }
    const cell = document.createElement('td'); const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'remove-btn'; remove.textContent = 'Remove'; remove.addEventListener('click', () => row.remove()); cell.append(remove); row.append(cell); body.append(row);
  });
  document.getElementById('import-review-panel').hidden = false;
}

function reverseDemoImportAmounts() {
  document.querySelectorAll('#import-review-rows tr').forEach(row => {
    const spend = row.querySelector('[data-field="spend"]'), receive = row.querySelector('[data-field="receive"]');
    [spend.value, receive.value] = [receive.value, spend.value];
  });
}

function saveDemoImport() {
  if (!pendingReview) return;
  const parsed = [...document.querySelectorAll('#import-review-rows tr')].map(row => {
    const original = pendingReview.parsed[Number(row.dataset.index)];
    const value = field => row.querySelector(`[data-field="${field}"]`).value;
    return { ...original, date: value('date'), payee: value('payee').trim(), memo: value('memo').trim(), spend: amount(value('spend')), receive: amount(value('receive')) };
  });
  if (!parsed.length || parsed.some(tx => !tx.date || !tx.payee || (tx.spend > 0 && tx.receive > 0))) return setStatus('Keep a row with a date and description, and choose spend or receive for each row.', 'error');
  const accountId = document.getElementById('import-account').value;
  const keys = new Set(state.transactions.map(tx => tx.fitId ? `fit:${tx.fitId}` : `${tx.accountId}|${tx.date}|${tx.payee}|${tx.spend}|${tx.receive}`));
  let added = 0, skipped = 0;
  parsed.forEach(tx => {
    const key = tx.fitId ? `fit:${tx.fitId}` : `${accountId}|${tx.date}|${tx.payee}|${tx.spend}|${tx.receive}`;
    if (keys.has(key)) { skipped += 1; return; }
    keys.add(key); state.transactions.push({ ...tx, id: makeId(), accountId, category: 'Imported', tag: '', cleared: 'c', isEditing: false }); added += 1;
  });
  pendingReview = null; document.getElementById('import-review-panel').hidden = true;
  state.transactions.sort((a, b) => b.date.localeCompare(a.date)); renderTransactions(); updateUI(); persist(); showPage('dashboard');
  setStatus(`Imported ${added}; skipped ${skipped} duplicate transactions.`, 'success');
}

function bootstrapSampleData() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    const parsed = JSON.parse(saved);
    state.accounts = Array.isArray(parsed.accounts) ? parsed.accounts : [];
    state.transactions = Array.isArray(parsed.transactions) ? parsed.transactions : [];
    return;
  }

  state.accounts = [
    { id: 'acct-checking', name: 'Main Checking', openingBalance: 4200.15, type: 'cash', accountKind: 'checking' },
    { id: 'acct-savings', name: 'Emergency Savings', openingBalance: 12250, type: 'cash', accountKind: 'savings' },
    { id: 'acct-card', name: 'Travel Card', openingBalance: -520.33, type: 'debt', accountKind: 'credit-card' }
  ];

  state.transactions = [
    { id: 'tx-1', date: '2026-09-19', payee: 'Paycheck', category: 'Income', tag: 'salary', memo: 'Monthly payroll deposit', cleared: 'c', spend: 0, receive: 4200.15, accountId: 'acct-checking', isEditing: false },
    { id: 'tx-2', date: '2026-09-21', payee: 'Trader Joe\'s', category: 'Groceries', tag: 'food', memo: 'Weekly groceries', cleared: 'c', spend: 83.41, receive: 0, accountId: 'acct-checking', isEditing: false },
    { id: 'tx-3', date: '2026-09-22', payee: 'FPL', category: 'Bills', tag: 'utilities', memo: 'Electric bill', cleared: 'c', spend: 128.44, receive: 0, accountId: 'acct-checking', isEditing: false },
    { id: 'tx-4', date: '2026-09-23', payee: 'Amazon', category: 'Shopping', tag: 'household', memo: 'Office supplies', cleared: 'c', spend: 64.19, receive: 0, accountId: 'acct-card', isEditing: false },
    { id: 'tx-5', date: '2026-09-25', payee: 'Freelance Client', category: 'Income', tag: 'side-hustle', memo: 'Design invoice', cleared: 'c', spend: 0, receive: 650, accountId: 'acct-savings', isEditing: false }
  ];

  persist();
}

function initDemo() {
  bootstrapSampleData();
  showPage('dashboard');
  populateAccountSelectors();
  updateUI();
  renderTransactions();

  document.getElementById('add-transaction-btn').addEventListener('click', addTransaction);
  document.getElementById('pay-credit-card-btn').addEventListener('click', openCardPayment);
  document.getElementById('card-payment-form').addEventListener('submit', saveCardPayment);
  document.getElementById('close-card-payment-btn').addEventListener('click', closeCardPayment);
  document.getElementById('cancel-card-payment-btn').addEventListener('click', closeCardPayment);
  document.getElementById('card-payment-modal').addEventListener('click', event => { if (event.target === event.currentTarget) closeCardPayment(); });
  document.getElementById('all-accounts-btn').addEventListener('click', () => {
    selectedAccountId = null;
    renderTransactions();
    renderAccountList();
  });
  document.getElementById('show-add-account-btn').addEventListener('click', showAddAccountForm);
  document.getElementById('cancel-add-account-btn').addEventListener('click', hideAddAccountForm);
  document.getElementById('add-account-form').addEventListener('submit', addAccount);
  document.getElementById('refresh-report-btn').addEventListener('click', generateCategoryReport);
  document.getElementById('select-file-btn').addEventListener('click', async () => {
    const file = document.getElementById('demo-import-file').files[0];
    if (!file) return setStatus('Choose a statement file first.', 'error');
    try { showImportReview(parseDemoImport(await file.text()), file.name); }
    catch (error) { setStatus(`Could not read ${file.name}: ${error.message}`, 'error'); }
  });
  document.getElementById('save-import-review-btn').addEventListener('click', saveDemoImport);
  document.getElementById('cancel-import-review-btn').addEventListener('click', () => { pendingReview = null; document.getElementById('import-review-panel').hidden = true; });
  document.getElementById('reverse-import-amounts').addEventListener('change', reverseDemoImportAmounts);
  document.getElementById('import-account').addEventListener('change', () => {
    if (!pendingReview) return;
    const account = accountById(document.getElementById('import-account').value);
    document.getElementById('import-review-summary').textContent = `${pendingReview.fileName} · ${pendingReview.parsed.length} transactions · Account: ${account?.name || 'not selected'}`;
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeCardPayment(); });
  navItems.forEach(item => item.addEventListener('click', () => showPage(item.dataset.page)));
  setStatus('Demo ready.', 'success');
}

initDemo();
