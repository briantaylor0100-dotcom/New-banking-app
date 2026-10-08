const STORAGE_KEY = 'vaultcompute-demo-state';
const state = { accounts: [], transactions: [] };
let selectedAccountId = null;

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
    .filter(tx => tx.accountId === account.id)
    .reduce((sum, tx) => sum + amount(tx.receive) - amount(tx.spend), 0));
}

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
    .filter(({ tx }) => selectedAccountId === null || tx.accountId === selectedAccountId);

  const selectedAccount = accountById(selectedAccountId);
  document.getElementById('transaction-heading').textContent = selectedAccount
    ? `${selectedAccount.name} Transactions`
    : 'Recent Transactions';

  visibleTransactions.forEach(({ tx, index }) => {
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
      row.append(makeCell(tx.spend > 0 ? money.format(tx.spend) : '', 'neg'));
      row.append(makeCell(tx.receive > 0 ? money.format(tx.receive) : '', 'pos'));
      row.append(makeCell(money.format(amount(tx.receive) - amount(tx.spend))));
      row.append(makeCell(accountById(tx.accountId)?.name ?? 'Unassigned'));

      const action = document.createElement('td');
      action.className = 'transaction-actions';
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.textContent = 'Edit';
      edit.addEventListener('click', () => {
        tx.isEditing = true;
        renderTransactions();
      });
      action.append(edit, removeButton(index));
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
  updateUI();
  renderTransactions();
  persist();
  setStatus(`${name} added.`, 'success');
}

function generateCategoryReport() {
  const start = document.getElementById('report-start').value;
  const end = document.getElementById('report-end').value;
  const inRange = tx => (!start || tx.date >= start) && (!end || tx.date <= end);

  const transactions = state.transactions.filter(inRange);
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
  document.getElementById('all-accounts-btn').addEventListener('click', () => {
    selectedAccountId = null;
    renderTransactions();
    renderAccountList();
  });
  document.getElementById('show-add-account-btn').addEventListener('click', showAddAccountForm);
  document.getElementById('cancel-add-account-btn').addEventListener('click', hideAddAccountForm);
  document.getElementById('add-account-form').addEventListener('submit', addAccount);
  document.getElementById('refresh-report-btn').addEventListener('click', generateCategoryReport);
  document.getElementById('select-file-btn').addEventListener('click', () => setStatus('Demo mode: file import is shown for the desktop app and will work in the Electron version.', 'success'));
  navItems.forEach(item => item.addEventListener('click', () => showPage(item.dataset.page)));
  setStatus('Demo ready.', 'success');
}

initDemo();
