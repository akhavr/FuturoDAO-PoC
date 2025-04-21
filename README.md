# FuturoDAO Proof of Concept

Project Description: Futarchy DAO Binary Options for Long-Term Governance

# Problem Statement

Traditional DAO governance models often suffer from short-term
decision-making and misaligned incentives. Participants can vote on
proposals and immediately sell their governance tokens, escaping the
long-term consequences of poor decisions. This creates a lack of
accountability and undermines the DAO's ability to make sustainable,
impactful choices. Additionally, existing futarchy-based systems,
while innovative, often lack mechanisms to align participants with
long-term protocol performance.

# Solution

Our project enhances MetaDAO's governance model by introducing binary
options as the outcome of proposal settlements.  Instead of redeeming
original tokens after a proposal passes or fails, participants receive
European-style binary options with a 1-year expiry and a predefined
strike price (e.g., +50% from the current TWAP).  These options
incentivize participants to align their decisions with long-term
protocol growth, as the value of their options depends on the DAO's
future success.  By integrating Tru3Bliss prediction infrastructure
and Pyth Network's price feeds, we create a seamless system that
bridges governance and financial markets.

# Distinct Features

- Long-Term Incentives: Binary options ensure participants remain invested in the DAO's performance for up to 1 year, discouraging short-term token dumping.
- Market-Driven Accountability: Proposal outcomes are tied to real-world price movements, encouraging informed decision-making and reducing manipulation risks.
- Cross-Protocol Integration: Combines futarchy governance framework with Tru3Bliss prediction markets and Pyth's decentralized price oracles for robust functionality.
- User-Friendly Interface: A unified dashboard displays proposals, markets, and option performance, making complex financial instruments accessible to DAO participants.

This project redefines futarchy governance by embedding long-term
alignment into every decision, empowering DAOs to make sustainable
choices while fostering innovation in decentralized finance.

# Current status

## 2025.04.21

- MetaDAO contracts deployed on local validator
- Dropped HedgeHog for being closed source.  Investigating Tru3Bliss https://github.com/Tru3Bliss/Prediction-Market-Contract-Solana
