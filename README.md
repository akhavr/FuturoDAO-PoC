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
future success.  By integrating Hedgehog Markets' prediction
infrastructure and Pyth Network's price feeds, we create a seamless
system that bridges governance and financial markets.

# Distinct Features

- Long-Term Incentives: Binary options ensure participants remain invested in the DAO's performance for up to 1 year, discouraging short-term token dumping.
- Market-Driven Accountability: Proposal outcomes are tied to real-world price movements, encouraging informed decision-making and reducing manipulation risks.
- Cross-Protocol Integration: Combines futarchy governance framework with Hedgehog's prediction markets and Pyth's decentralized price oracles for robust functionality.
- User-Friendly Interface: A unified dashboard displays proposals, markets, and option performance, making complex financial instruments accessible to DAO participants.

This project redefines futarchy governance by embedding long-term
alignment into every decision, empowering DAOs to make sustainable
choices while fostering innovation in decentralized finance.

# Current status

```
$ docker compose up -d
[+] Running 2/2
 ✔ Container futurodao-validator-1  Started                                                                      0.4s 
 ✔ Container futurodao-builder-1    Started                                                                      0.4s 

$ docker compose run builder bash

hostuser@fd8d3ac013b3:/project$ solana config get
Config File: /home/hostuser/.config/solana/cli/config.yml
RPC URL: http://validator:8899 
WebSocket URL: ws://validator:8900/ (computed)
Keypair Path: /home/hostuser/.config/solana/my-keypair.json 
Commitment: confirmed 

hostuser@fd8d3ac013b3:/project$ solana balance
0 SOL

hostuser@fd8d3ac013b3:/project$ solana airdrop 10
Requesting airdrop of 10 SOL

Signature: 3q8tXkRTayYjRKy8pKH3UJAoiJRASWf14J3Mh9YZ2MFcXvUqWPqXPxyHGf4HstAJusCZkwXBUmuFpkUJW76287gG

10 SOL

hostuser@fd8d3ac013b3:/project$ solana balance
10 SOL

hostuser@fd8d3ac013b3:/project$ solana ping
[...]
1 lamport(s) transferred: seq=0   time= 200ms signature=24WPg39RvCcafVWMjrX8d1Rmxg5YYXvBLRatxCHvXvxRtP66VVvn7jwZmms8SEjnUrqKjRyM62RfgR27QpuDwyYm
2 lamport(s) transferred: seq=1   time= 401ms signature=3h19snm8fnp26j8ajxGRjwAdHvqiPvtTkBfSkeeG6XNJQSbBtYenQFca1ct4ucXo4LyPUGKYCVdUFF8euvwi1kZg
3 lamport(s) transferred: seq=2   time= 401ms signature=wH35bTF8CiSE8XEwBpS9CBf2xNsLRBZJ7DoYGeBf7zuMGVAZ2ja6xz7sCugHGJwXRE1HtprfZshCopX3KCy5bWo

--- transaction statistics ---
3 transactions submitted, 3 transactions confirmed, 0.0% transaction loss
confirmation min/mean/max/stddev = 200/334/401/116 ms

hostuser@fd8d3ac013b3:/project$ solana balance
9.999985 SOL
hostuser@fd8d3ac013b3:/project$ 
exit
```
