// A reviewed research universe, not a claim to cover every cryptocurrency.
// Keep symbols and Binance spot pairs explicit so similarly named tokens cannot collide.
// DefiLlama slugs name the exact products whose TVL/fees are shown.
const raw = [
  ["QNT", "Quant", "互操作性", "跨网络消息与企业集成", "QNTUSDT"],
  ["RAY", "Raydium", "去中心化交易", "Solana 生态交易与流动性", "RAYUSDT", ["raydium-amm"]],
  ["NEAR", "NEAR Protocol", "公链", "智能合约与链抽象", "NEARUSDT"],
  ["ARB", "Arbitrum", "扩容网络", "以太坊二层网络", "ARBUSDT"],
  ["UNI", "Uniswap", "去中心化交易", "多链自动做市交易", "UNIUSDT", ["uniswap-v2", "uniswap-v3", "uniswap-v4"]],
  ["ZEC", "Zcash", "支付与隐私", "隐私支付网络", "ZECUSDT"],
  ["DASH", "Dash", "支付与隐私", "数字支付网络", "DASHUSDT"],
  ["SUI", "Sui", "公链", "Move 智能合约网络", "SUIUSDT"],
  ["AERO", "Aerodrome Finance", "去中心化交易", "Base 生态交易与流动性", "AEROUSDT", ["aerodrome-v1", "aerodrome-slipstream"]],
  ["ENA", "Ethena", "DeFi", "合成美元相关协议", "ENAUSDT", ["ethena-usde"]],
  ["HYPE", "Hyperliquid", "链上衍生品", "链上永续合约与交易网络", "HYPEUSDT", ["hyperliquid-hlp", "hyperliquid-spot-orderbook"]],
  ["JST", "JUST", "DeFi", "TRON 生态借贷与稳定币设施", "JSTUSDT"],
  ["MORPHO", "Morpho", "DeFi 借贷", "模块化链上借贷市场", "MORPHOUSDT", ["morpho-blue"]],
  ["INJ", "Injective", "公链", "面向金融应用的链上网络", "INJUSDT"],
  ["SOL", "Solana", "公链", "高吞吐智能合约网络", "SOLUSDT"],
  ["ADA", "Cardano", "公链", "权益证明智能合约网络", "ADAUSDT"],
  ["AVAX", "Avalanche", "公链", "多链智能合约平台", "AVAXUSDT"],
  ["LINK", "Chainlink", "预言机", "跨链数据与预言机网络", "LINKUSDT"],
  ["DOT", "Polkadot", "互操作性", "多链互操作网络", "DOTUSDT"],
  ["AAVE", "Aave", "DeFi 借贷", "链上存借款协议", "AAVEUSDT", ["aave-v2", "aave-v3", "aave-v4"]],
  ["OP", "Optimism", "扩容网络", "以太坊二层网络", "OPUSDT"],
  ["ATOM", "Cosmos", "互操作性", "跨链生态与应用链", "ATOMUSDT"],
  ["RENDER", "Render", "计算网络", "分布式 GPU 渲染与计算", "RENDERUSDT"],
  ["FIL", "Filecoin", "存储网络", "去中心化存储网络", "FILUSDT"],
  ["ICP", "Internet Computer", "公链", "链上应用与计算网络", "ICPUSDT"],
  ["XLM", "Stellar", "支付网络", "跨境支付网络", "XLMUSDT"],
  ["HBAR", "Hedera", "公链", "分布式账本与企业应用", "HBARUSDT"],
  ["LTC", "Litecoin", "支付网络", "支付型工作量证明网络", "LTCUSDT"],
  ["BCH", "Bitcoin Cash", "支付网络", "支付型工作量证明网络", "BCHUSDT"],
  ["BNB", "BNB", "公链与平台", "BNB Chain 生态及平台代币", "BNBUSDT"],
  ["TRX", "TRON", "公链", "稳定币与链上应用网络", "TRXUSDT"],
  ["LDO", "Lido DAO", "流动性质押", "以太坊流动性质押协议", "LDOUSDT", ["lido"]],
  ["PENDLE", "Pendle", "收益交易", "链上收益拆分与交易", "PENDLEUSDT", ["pendle-v2"]],
  ["JUP", "Jupiter", "去中心化交易", "Solana 聚合交易及金融应用", "JUPUSDT", ["jupiter-lend", "jupiter-perpetual-exchange"]],
  ["ONDO", "Ondo", "现实资产", "代币化金融产品", "ONDOUSDT"],
  ["TAO", "Bittensor", "计算网络", "去中心化机器学习网络", "TAOUSDT"],
  ["SEI", "Sei", "公链", "面向交易应用的智能合约网络", "SEIUSDT"],
  ["TIA", "Celestia", "模块化网络", "模块化数据可用性网络", "TIAUSDT"],
  ["STX", "Stacks", "比特币生态", "比特币应用与智能合约层", "STXUSDT"],
  ["ALGO", "Algorand", "公链", "权益证明智能合约网络", "ALGOUSDT"],
  ["APT", "Aptos", "公链", "Move 智能合约网络", "APTUSDT"],
  ["GRT", "The Graph", "数据索引", "链上数据索引网络", "GRTUSDT"],
  ["FET", "Artificial Superintelligence Alliance", "计算网络", "去中心化 AI 服务网络", "FETUSDT"],
  ["CRV", "Curve DAO", "去中心化交易", "稳定资产交易协议", "CRVUSDT", ["curve-dex", "curve-llamalend"]],
  ["COMP", "Compound", "DeFi 借贷", "链上存借款协议", "COMPUSDT", ["compound-v2", "compound-v3"]],
  ["SNX", "Synthetix", "链上衍生品", "衍生品与流动性设施", "SNXUSDT"],
  ["RUNE", "THORChain", "跨链交易", "跨链资产交易协议", "RUNEUSDT", ["thorchain-dex"]],
  ["IMX", "Immutable", "游戏基础设施", "游戏资产与扩容网络", "IMXUSDT"]
];

export const universe = raw.map(([symbol, name, sector, description, pair, llamaSlugs = []]) => ({
  symbol, name, sector, description, pair, llamaSlugs
}));

export const universeVersion = "2026-10-04.1";
