# VaultCompute

A desktop personal-finance app for tracking accounts, transactions, and cash flow. Built with Electron, VaultCompute keeps data locally on the computer rather than requiring an online account.

## Features

- Add and manage checking, savings, and credit-card accounts.
- Select an account in the sidebar to view only its transactions, or choose **All accounts** for the complete register.
- Add, edit, and remove transactions.
- Track spending, income, account balances, total cash, debt, and net worth.
- Import transaction data from CSV, QFX, and OFX bank-statement files.
- View income, spending, and net-cash-flow reports for a chosen date range.
- Opens maximized with standard window controls.

## Getting started

### Requirements

- [Node.js](https://nodejs.org/) (LTS recommended)

### Install and run

```bash
npm install
npm start
```

## Development checks

Run the JavaScript syntax check before committing changes:

```bash
npm run check
```

## Project structure

```text
.
├── main.js          # Electron main process and local data access
├── preload.js       # Secure renderer-to-main IPC bridge
├── src/
│   ├── index.html   # App layout
│   ├── renderer.js  # User interface and finance logic
│   └── style.css    # App styles
├── package.json
└── ideas for project.txt
```

## Data and privacy

Account and transaction data is saved locally in Electron's application-data folder as `vault_data.json`. The `.electron-data/` development folder and `node_modules/` are excluded from Git.

> This is a personal budgeting tool, not a bank or financial institution. Keep backups of any financial data you rely on.

## License

This project is licensed under the ISC License. See `package.json` for details.
