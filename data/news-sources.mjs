// Only project-owned publications and governance/release feeds are auto-published.
// Every displayed item links to its original source; no article body is copied.
export const newsSources = [
  {
    id: "arbitrum-forum", label: "Arbitrum Governance", url: "https://forum.arbitrum.foundation/latest.rss",
    kind: "governance", symbols: ["ARB"], hosts: ["forum.arbitrum.foundation"],
    categories: ["Proposals", "Security Council", "Announcements", "Finalized AIPs"]
  },
  {
    id: "morpho-forum", label: "Morpho Forum", url: "https://forum.morpho.org/latest.rss",
    kind: "governance", symbols: ["MORPHO"], hosts: ["forum.morpho.org"],
    categories: ["Governance", "MORPHO & Treasury"]
  },
  {
    id: "polkadot-forum", label: "Polkadot Forum", url: "https://forum.polkadot.network/latest.rss",
    kind: "governance", symbols: ["DOT"], hosts: ["forum.polkadot.network"],
    categories: ["Governance", "Ecosystem"]
  },
  {
    id: "uniswap-releases", label: "Uniswap GitHub Releases", url: "https://api.github.com/repos/Uniswap/v4-core/releases?per_page=8",
    kind: "github-releases", symbols: ["UNI"], hosts: ["github.com"]
  },
  {
    id: "aave-releases", label: "Aave GitHub Releases", url: "https://api.github.com/repos/aave/aave-v3-core/releases?per_page=8",
    kind: "github-releases", symbols: ["AAVE"], hosts: ["github.com"]
  },
  {
    id: "solana-releases", label: "Solana Agave Releases", url: "https://api.github.com/repos/anza-xyz/agave/releases?per_page=8",
    kind: "github-releases", symbols: ["SOL"], hosts: ["github.com"]
  },
  {
    id: "near-releases", label: "NEAR Core Releases", url: "https://api.github.com/repos/near/nearcore/releases?per_page=8",
    kind: "github-releases", symbols: ["NEAR"], hosts: ["github.com"]
  },
  {
    id: "sui-releases", label: "Sui Releases", url: "https://api.github.com/repos/MystenLabs/sui/releases?per_page=8",
    kind: "github-releases", symbols: ["SUI"], hosts: ["github.com"]
  },
  {
    id: "chainlink-releases", label: "Chainlink Releases", url: "https://api.github.com/repos/smartcontractkit/chainlink/releases?per_page=8",
    kind: "github-releases", symbols: ["LINK"], hosts: ["github.com"]
  }
];
