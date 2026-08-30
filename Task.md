# RWAHub evaluation: environment and Solidity

Use this list to check the basic setup and Solidity workflow. After the chain tasks pass, verify everything in the frontend. Do not add a separate Solidity unit-test suite for this evaluation.

## 1. Basic environment

- [ ] Node.js 20+ (`node -v`)
- [ ] Dependencies install (`npm install`)
- [ ] App starts (`npm run dev`)
- [ ] Frontend opens at http://localhost:5173/
- [ ] API health check: http://localhost:3001/api/health
- [ ] Home, Sign In, and Dashboard load

## 2. Solidity environment

- [ ] Contracts compile (`npm run compile`)
- [ ] Local chain runs (`npm run chain`) on `http://127.0.0.1:8545`, chain id `31337`
- [ ] Contracts deploy (`npm run deploy:local`)
- [ ] `src/config/contracts.json` has non-empty `kyc`, `marketplace`, `token`, and `compliance`
- [ ] Restart `npm run dev` after deploy so Vite picks up the new addresses

## 3. Wallet for frontend verification

- [ ] MetaMask has **Hardhat Local**
  - RPC: `http://127.0.0.1:8545`
  - Chain ID: `31337`
  - Currency: `ETH`
- [ ] Import Hardhat Account #0 (the first key printed by `npm run chain`)
- [ ] Sign in on http://localhost:5173/ with that wallet
- [ ] Dashboard shows the wallet address and chain `31337` or Hardhat Local

## 4. Verify Solidity in the frontend

Do these in the browser after deploy. Each step should produce a MetaMask transaction if contracts are configured.

- [ ] Open **Asset Creation** (`/asset-creation`)
- [ ] The page says contracts are live (or demo mode if `contracts.json` is still empty)
- [ ] Submit a new asset (title, category, price, optional image, validator)
- [ ] Approve KYC `selfVerify` if MetaMask asks
- [ ] Approve `createAsset`
- [ ] Dashboard shows the new asset
- [ ] Marketplace and Explorer also show the same asset
- [ ] Asset card / dashboard shows an on-chain token id (number), not only `demo-...`


## Evaluation

We will review:

* Understanding of the existing Solidity and Hardhat setup
* Compile and local deploy
* `contracts.json` addresses after deploy
* Wallet / MetaMask on Hardhat Local
* Whether create-asset works on-chain in the existing UI

**Pass:** compile and deploy work, a wallet user can create an asset in the UI and see it on Dashboard / Marketplace.

**We are not expecting a complete production protocol.**

The goal is to see how you work with the existing contracts, deploy them locally, and prove the flow in the existing frontend.

## Commands

```bash
npm install
npm run compile
npm run chain
npm run deploy:local
npm run dev
```

Keep `npm run chain` running while you use the frontend.
