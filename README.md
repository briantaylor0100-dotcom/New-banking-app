# New Banking App

A private desktop budgeting app for tracking accounts, transactions, and cash flow without sending your financial data to a remote service.

This project is also referred to as `VaultCompute` in the app interface and documentation.

## Overview

New Banking App is a local-first personal finance dashboard built with Electron. It helps you:

- monitor balances across multiple accounts
- add and manage transactions manually
- import bank statements from CSV, QFX, and OFX files
- review income and spending by category
- keep all financial data stored on your own machine

## Features

- Clear snapshot of total cash, debt, and net worth
- Multi-account support for checking, savings, and credit-card accounts
- Transaction register with dates, payees, categories, memos, and cleared status
- Spending and income tracking with category totals
- Import support for common bank statement formats
- Review imported bank and card transactions before saving, including edits and amount direction correction
- Record credit-card payments against both the card and the account used to pay it
- Duplicate detection while importing transactions
- Split incoming deposits across recipients and categories while counting the deposit once
- Local-only storage in the app data directory for privacy

## Prerequisites

Install [Node.js](https://nodejs.org/) and use the current LTS version. `npm` is included with Node.js.

## Getting started

1. Clone this repository or download it as a ZIP file and extract it.
2. Open a terminal in the project directory.
3. Install dependencies:

   ```bash
   npm install
   ```

4. Start the app:

   ```bash
   npm start
   ```

On first launch, the app creates sample account data so you can explore the interface immediately. You can replace or customize those entries from inside the app.

## Browser demo

The GitHub Pages demo is published from the `docs/` folder: [Open the VaultCompute demo](https://briantaylor0100-dotcom.github.io/New-banking-app/). It stores demo data in that browser's local storage and now includes transaction import review and credit-card payments.

## Development check

Run a basic JavaScript syntax validation before committing changes:

```bash
npm run check
```

## Project structure

```text
.
├── main.js              # Electron main process and local persistence logic
├── preload.js           # Safe bridge between the renderer and main process
├── src/
│   ├── index.html       # App layout and UI structure
│   ├── renderer.js      # Financial logic and UI behavior
│   └── style.css        # Styling and layout
├── package.json         # Scripts and dependencies
├── README.md            # Project overview and usage guide
├── .electron-data/      # Local app data for development
└── node_modules/        # Installed dependencies
```

## Privacy and data storage

Financial data is stored locally in Electron's application-data directory as `vault_data.json` and related app files. The project intentionally avoids cloud syncing and remote account access.

> This is a personal budgeting tool, not a bank or financial institution.

## License

ISC
