# Scan-to-Trust

A lightweight supply-chain traceability app: create product batches, transfer custody with guarded handoffs, show public timelines via QR, and anchor daily Merkle roots (optional Ethereum on-chain).

<video src="Video Demonstration.mp4" controls width="800" />


## Features
- **Batches & QR**: Create batches and share a QR that opens a public timeline.
- **Guarded Handoffs**: Current owner authorizes the next role + recipient ID; receiver must present a one-time code.
- **Price at Each Step**: Selling price captured per transfer.
- **Daily Integrity Anchor**: SHA-256 Merkle root over the day’s events; optional on-chain write via Hardhat/Ethers.
- **Language Toggle (EN/Bn)**: UI can switch English ⇄ Bangla.
- **Simple, portable stack**: Node/Express + PostgreSQL + vanilla JS.

## Tech Stack
Node.js · Express · PostgreSQL · Ethers v6 · Hardhat (local chain) · QRCode · HTML/CSS/JS

## Quick Start

```bash
# 1) Clone
git clone https://github.com/Fa-him/scan-to-trust.git
cd scan-to-trust

# 2) Install server deps
npm i

# 3) Configure environment
cp .env.example .env   # fill values (see below)

# 4) Start server
node server.js
# App: http://localhost:${PORT:-5000}
