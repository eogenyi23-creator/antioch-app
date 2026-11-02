# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Monorepo: web, api, escrow-client and shared packages
- Campaign creation with milestones and approver sets
- Non-custodial donation flow (initialize, sign, submit, verify)
- Milestone evidence and on-chain approvals
- Refunds after expiry
- Public transparency page, receipts and CSV export
- Web: `NEXT_PUBLIC_ASSET_CODE` setting (default `USDC`) for amount labels

### Fixed
- Sign-in: the login nonce is now at most 28 bytes so it fits a Stellar text memo
- Sign-in: the wallet picker opens when connecting, and the session is restored after a reload
- Campaigns: the expiry ledger is now saved when a campaign is created, so publishing no longer fails with "Campaign has no expiry date"
- CI: workspace packages build before typecheck, and the auth test no longer needs a database
- Web: merged the duplicate Funding section on the campaign page into FundingWidget
- Web: show the campaign goal formatted with the asset code (e.g. 300.0000000 TESTUSD) instead of raw stroops
- Web: amount labels and placeholders use NEXT_PUBLIC_ASSET_CODE instead of hardcoded USDC
- Web: the nav "New" link is now shown to admins as well as applicants
- Web: create-campaign submit is guarded against double submits
- Web: the create-campaign form ignores a second click while a submit is in progress

   ### Known gaps
   - The evidence verifier service and fee sponsorship are planned and not built yet
