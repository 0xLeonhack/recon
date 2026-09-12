# RECON 实现路线图

> 状态：两日最小真实 Demo 收口
> 日期：2026-09-11
> 执行方式：单 Agent 串行推进
> 产品基准：`docs/prd.md` v1.3

本文只定义实现顺序、目录落位、阶段门槛和交付证据。产品范围、验收标准与对外口径仍以 `docs/prd.md` 为准。

## 1. 当前状态

仓库已完成最小工程骨架，并提前实现了大量 S1-S6 代码：

- S0.1 骨架完成；S0.2/S0.3 spike 代码就绪，S0.4 完成 facilitator 支持发现。
- Evidence/Verification v1 类型、canonicalization、hash、R1/R2/R4 对账核心已实现并有单元测试。
- `PolicyVault` 已实现单资产 HBAR 版本（HTS 探针稳定后仍可评估切回），合约测试通过。
- Agent 确定性工作流、verifier 演示快照、CLI（`demo:verify` / `demo:verify:forged`）与 Web 视觉壳已就位。
- Web 当前只能切换 `LOCAL_FIXTURE`，没有钱包、控制 API 或真实运行入口，不能视为用户可用产品，也不能作为视频主流程。
- CLI 已使用真实 testnet Vault、HCS topic、Graph target 和 Blocky402 付款完成 live loop；Web 仍只显示 `LOCAL_FIXTURE`，live verifier 的 R1 补丁与 R5 settlement receipt 仍需收口。
- 核心真实性 Gate（Hedera/Graph/x402/R1-R5）通过前不做 Web 接线；Bazantic Gate 独立处理，不阻塞核心 Demo。

### 阶段状态

| 阶段 | 目标 | 当前状态 | 完成证据 |
|---|---|---|---|
| S0 | 工程骨架与核心真实性 Gate | 进行中 | Hedera/Graph/x402/R1-R5 核心 Gate 已用 `live-1789115733718` 全绿通过；Bazantic 独立 Gate 未完成 |
| S1 | 冻结 Evidence、Verification、PolicyVault v1 契约 | 进行中 | Evidence/Verification v1 与 canonicalization 有实现和单测（`fb9a9f7`-`96d1a8c`）；PolicyVault v1 接口落地（`c8f4092`）。冻结签收待 Gate 0 |
| S2 | PolicyVault 与共享 Core | 进行中 | PolicyVault 合约测试通过，HBAR Vault 已在 testnet 部署并注资（`28731d5`）；共享 R1-R5 core 与 live HBAR payment receipt 已验证 |
| S3 | 外部适配器与正常 Agent 闭环 | 进行中 | `d665132` 完成真实 Graph -> x402 -> Vault -> HCS；R1/R5 已全绿。DeepSeek V4 Flash bounded selector 已接入，真实模型烟测待 Key；付款头生成仍需并入单次 Web run |
| S4 | Verifier Core 与独立 CLI | 进行中 | `verify:live` 已对 correlation `live-1789115733718` 从 HCS+Vault+Graph+mirror payment receipt 得到 R1-R5 全部 `VERIFIED`；Web 契约一致性待接线 |
| S5 | 作弊、罚没与冻结演示 | 进行中 | fixture 级 forged 检测完成；`slash:forged`（确定性 evidenceHash -> slash）与 `kill:switch`（冻结 -> NotActive 拒绝）脚本就绪（`8a45d23`）。真实处置待在最终一次性 Vault 上执行 |
| S6 | 最小 Demo 控制器与用户工作台 | 进行中 | 真实 Vault/Graph/x402/HCS 闭环已由 CLI 跑通，Web 视觉壳完成；尚缺固定 Demo API、live 状态接入、owner kill 签名与浏览器验收 |
| S7 | 端到端验证、部署与提交物 | 未开始 | - |

状态只使用 `未开始`、`进行中`、`阻塞`、`已完成`。只有满足该阶段完成标准并记录可复验证据后，才能标记为 `已完成`。

## 2. 目标目录

目录按实现进度逐步创建，不为尚未存在的功能提前生成空模块。

```text
eth2026/
├── contracts/                 # PolicyVault 与合约接口
├── scripts/                   # 部署、测试网探测和可重复 Demo 脚本
├── src/
│   ├── core/                  # 纯领域模型、canonicalization、hash、对账规则
│   ├── adapters/              # Hedera、HCS、Graph、x402、Bazantic 边界适配
│   ├── agent/                 # 可被 CLI/API 复用的确定性 Agent 工具循环与流程编排
│   ├── verifier/              # R1-R5 验证流程和 evidenceHash 生成
│   ├── cli/                   # 独立验证 CLI 入口
│   └── api/                   # x402 公共验证服务 + loopback Demo 控制器
├── web/                       # Vite + React：真实 mandate、运行、验证、处置
├── test/
│   ├── fixtures/              # 固定输入、规范化输出和链上事件样本
│   ├── unit/                  # 纯逻辑测试
│   └── integration/           # 显式联网的测试网验证
├── deployments/               # 非敏感部署清单与 ABI 引用
├── docs/                      # PRD、路线图、架构和提交证据说明
├── .env.example               # 只包含变量名和安全占位符
├── AGENTS.md                  # 开发约束
└── README.md                  # 评委可执行的公开入口
```

约束：

- `src/core/` 不直接访问网络、环境变量、文件系统或钱包。
- CLI、API、Agent 和 Web 使用同一份 core 类型与验证结果，不复制规则。
- 外部 SDK 只出现在 `src/adapters/`、部署脚本或明确的应用入口。
- `contracts/` 的 ABI 由编译生成；业务代码不维护第二份手写 ABI。
- `deployments/` 只能保存可公开的网络、地址、topic ID、deployment ID 和交易引用，不能保存密钥。

## 3. 总体依赖路径

```text
最小工程骨架
    ↓
核心 Gate 0：Hedera / Graph / x402；Bazantic 独立 timebox
    ↓
冻结 Evidence v1 与 PolicyVault v1 接口
    ↓
共享 core + PolicyVault
    ↓
真实 adapters + Agent 正常执行链路
    ↓
Verifier core + CLI
    ↓
作弊检测 + verifier 裁决罚没 + kill-switch
    ↓
x402 单次付款头生成 + 可复用 Agent/Verifier 函数
    ↓
固定参数 loopback Demo API
    ↓
React 用户工作台：Open live mandate -> Run -> Verify -> Respond
    ↓
端到端复验、部署、README、视频与提交
```

任何阶段发现基础假设失败，都先执行该阶段的降级方案并更新 PRD/路线图，再进入下游；禁止让下游代码建立在未验证的假设上。

`S0-S7` 是本文的实现阶段；`docs/prd.md` 中按日期定义的 `M0-M5` 仍是唯一交付里程碑，两者不得混用。

### 与 PRD 里程碑对齐

| PRD 里程碑 | 截止时间（北京时间） | 本文对应阶段 | 当日必须得到的结果 |
|---|---|---|---|
| M0 | 9/9 | S0 | Hedera/Graph/x402 核心 spike 结论、代码和真实证据；Bazantic 独立评估 |
| M1 | 9/10 | S1-S3 | 单资产 vault、Graph、HCS 和 Agent 正常闭环 |
| M2 | 9/11 | S4-S5 | 恢复 R1 live replay、完成 R5 settlement receipt，使 CLI normal run 的 R1-R5 全部 VERIFIED |
| M3 | 9/12 上午 | S6 | 用户从 Web 打开真实预部署 mandate、启动 normal/forged run 并得到真实对账结果 |
| M4 | 9/12 下午 | S6-S7 | Web 作弊裁决、kill-switch、README、证据清单和 3-4 分钟预录 |
| M5 | 9/13 20:00 | 提交 | 平台提交完成，此后不增加功能 |

## 4. S0：最小工程骨架与 Gate 0

### S0.1 最小工程骨架

只建立三个 spike 所需的最小能力：

1. 创建根依赖清单和唯一锁文件，启用严格 TypeScript。
2. 配置 Hardhat，使最小合约可以编译、测试并部署到 Hedera testnet。
3. 配置统一的格式化、lint、类型检查和测试命令。
4. 创建 `.env.example`，列出 Hedera、Graph、x402/Bazantic 所需变量名。
5. 将验证成功的命令回填到 `AGENTS.md` 和 `README.md`。

完成标准：全新环境可安装依赖；空骨架通过 format、lint、typecheck、test 和 build；没有真实密钥进入 Git 或终端输出。

状态：已完成。实现提交：`4a92bd5`、`49af684`、`3259f98`、`95bdcef`。已验证 `npm ci/install`、format、lint、typecheck、Vitest、Hardhat compile 和 Vite production build；生产依赖审计为 0 漏洞。

### S0.2 Hedera HTS spike

实现最小测试合约和脚本，验证：

- Hardhat 经 JSON-RPC Relay 部署到 Hedera testnet。
- 合约持有、关联并转出一种 HTS token。
- 地址格式、token decimals、association、precompile 返回码和 gas 行为明确。
- HashScan 或 mirror node 能查到部署与转账。

交付证据：可重复命令、合约地址、token ID、交易 ID、实际输出和短说明。

失败降级：当天无法稳定完成 HTS 合约转账，则 PolicyVault 改用单资产 HBAR，并同步删除“已完成 HTS 转账”的对外表述。

状态：已按预案降级为单资产 HBAR。PolicyVault 已在 Hedera testnet 部署，principal 与 operator stake 已真实注资，公开地址和交易记录于 `28731d5`；不再把 HTS association/transfer 作为本次 Demo 条件。

### S0.3 The Graph 重放 spike

实现最小查询与重放脚本，验证：

- 使用真实 provider 和 live subgraph。
- 固定 deployment、final block number/hash、query 和 variables。
- 定义 JSON canonicalization v1。
- 两次独立查询得到相同 canonical response hash。
- 目标 deployment 能读取固定历史区块。

交付证据：一条命令输出全部固定参数、hash 和 `VERIFIED`。

失败降级：更换保留历史状态的 subgraph；在可稳定重放前，不实现依赖该查询的 Agent 决策。

状态：进行中。真实 Uniswap V3 deployment 和固定 Ethereum block 已完成双重重放，目标与 hash 记录于 `28731d5`；当前需要恢复 gateway `_meta` hash 语义补丁并重新跑一次 R1 live 验证。

### S0.4 x402 / Blocky402 与独立 Bazantic spike

实现最小 `POST /verify-query` 服务，验证：

- 未支付请求返回可识别的 402 支付要求。
- Agent 在 Hedera testnet 完成一次真实付款并成功重试。
- 付款引用能对应到真实结算交易。
- Bazantic Gateway/Recipe 能调用同一验证服务，并与 The Graph 输出组合。

交付证据：402 响应、支付引用、结算交易、服务响应、Gateway/Recipe 链接和复验命令。

失败降级：若 Blocky402 与 Bazantic 不能共用网关，为同一 API 提供两个薄适配器；若真实支付仍不可用，立即重新评估对应赛道，不用 mock 冒充完成。

状态：部分完成。`d665132` 已用 agent ECDSA 身份生成单次付款头，并真实跑通 402 -> verify -> settle -> paid retry；Hedera x402 链路不再阻塞。生成器仍需改为内存返回值才能由一次 Web run 自动调用；Bazantic Gateway/Recipe 尚未完成，因此赞助商 Gate 仍为 OPEN。

### S0 Gate

Hedera、Graph 和 x402 三条核心路径都必须有代码、命令和外部证据，且 R1-R5 可消费这些证据。核心 Gate 未通过时不进入 Web 接线。Bazantic 是独立赞助商 Gate：未通过时删除对应参赛声明，不用 mock，也不阻塞核心用户 Demo。

## 5. S1：冻结跨模块契约

Gate 0 通过后，先确定会被全部模块共享的最小协议，再扩展实现。

### 可执行约束落点

这些约束最终以代码和自动检查为准，本文只维护落点和验收关系。具体文件创建后，用真实路径替换下表中的规划路径。

| 约束 | 规划中的唯一实现 | 自动约束 |
|---|---|---|
| Evidence 与验证状态 | `src/core/types/` | TypeScript 穷尽检查、schema 单元测试 |
| canonicalization 与 hash | `src/core/evidence/` | 固定测试向量、跨入口一致性测试 |
| correlation 状态机与 R1-R5 | `src/core/reconciliation/` | 状态转换、错误分类和聚合结果测试 |
| shared core 单一来源 | `src/core/` 公共入口 | ESLint import boundary；应用层禁止复制领域类型和规则 |
| core 纯净边界 | `src/core/` | ESLint 禁止导入 adapters、应用、React、Hardhat、钱包和环境配置 |
| 合约角色与资金隔离 | `contracts/PolicyVault.sol` | 正向、越权、边界、stake 隔离和失败路径合约测试 |
| CLI / Web 结果一致 | verifier fixtures | 两个入口对相同 fixture 的输出一致性测试 |

S0 建立 lint、typecheck 和测试入口；S1-S2 创建共享类型与测试。某项自动约束尚未存在时，不得把对应模块标记为完成。

### S1.1 Evidence v1

定义并测试：

- `EvidenceEvent`、事件类型和 `schemaVersion: "1"`。
- `correlationId`、`eventId`、`actor`、`subjectRef` 和 `payloadHash`。
- Graph、付款、提案和执行证据的必填字段。
- canonicalization v1 的字节级规则、hash 算法与测试向量。
- JSON 边界上的大整数、地址、hash 和时间表示。

### S1.2 Verification v1

定义并测试统一输出：

- 固定状态：`PENDING | VERIFIED | MISMATCH | UNVERIFIABLE | REJECTED`。
- 每条规则的稳定 reason code、可读说明和 source reference。
- 聚合结果如何由 R1-R5 的逐项结果决定。
- 外部不可用必须得到 `UNVERIFIABLE`，不能被归类为作弊或通过。

### S1.3 PolicyVault v1

冻结构造参数、角色、Action、事件和错误/拒绝原因；确认 Agent 只执行动作，owner、agent operator 和 verifier 权限互斥。

完成标准：core 类型、测试向量、合约接口和文档一致。接口冻结后，任何破坏性变更必须先更新调用方清单和迁移方案。

## 6. S2：PolicyVault 与共享 Core

### S2.1 PolicyVault

按以下顺序实现：

1. 单资产、budget cap、deadline 和 recipient allowlist。
2. Agent 执行权限与 owner 冻结、关闭、提款权限。
3. Agent operator 独立 stake 记账。
4. verifier 按 `evidenceHash` 罚没 stake 到固定 beneficiary。
5. 策略拒绝事件与底层资产调用失败的差异化处理。

合约测试至少覆盖正常执行、额度等于边界、超预算、非白名单、刚好过期、冻结、越权、stake 隔离、罚没、提款和底层转账失败。

### S2.2 Shared Core

实现无网络依赖的：

- canonical JSON 和 hash。
- Evidence v1 解析与校验。
- `correlationId` 状态机。
- claimed / actual / allowed 比较模型。
- reason code 与最终状态聚合。
- mismatch evidence 和 `evidenceHash` 生成。

完成标准：纯单元测试覆盖主要边界；核心模块不读取环境变量，不依赖 React、Hardhat 或外部 SDK。

## 7. S3：外部适配器与正常 Agent 闭环

依次实现窄适配器：

1. `graph`：固定 deployment 和 block 查询，返回规范化证据。
2. `hedera`：提交合约交易、读取 receipt 和事件。
3. `hcs`：发布最小证据消息，并通过 mirror node 读取权威 sequence/timestamp。
4. `x402`：处理 402、付款、有限重试和结算引用。
5. `bazantic`：只做 Gateway/Recipe 所需的协议转换，不复制业务逻辑。

随后实现 Agent 工具：`graphQuery`、`paidVerify`、`executeVaultAction`、`publishEvidence`。

确定性边界：LLM 只能选择工具并生成简短公开说明；金额、地址、hash、策略结果和状态由代码计算。

正常闭环必须按同一个 `correlationId` 产生：

```text
DATA_QUERY
  -> API_PAYMENT
  -> ACTION_PROPOSED
  -> PolicyVault execution
  -> ACTION_EXECUTED
  -> HCS / mirror-node evidence
```

完成标准：测试网完成一次真实查询、付款、动作和证据发布；每一步都可从公开引用追溯，Agent signer 无法调用治理、提款或罚没函数。

## 8. S4：Verifier Core 与独立 CLI

按 PRD 的 R1-R5 顺序实现：

1. R1 重放固定 Graph 查询并比较 canonical hash。
2. R2 比较实际动作与动作发生时有效的 mandate。
3. R3 比较 claimed executed set 和 PolicyVault 成功事件集合。
4. R4 校验 HCS 内部 sequence 与 correlation 状态机。
5. R5 核对支付金额、资产、服务和结算交易。

CLI 输入 topic ID、vault address 和 correlation ID，输出逐项状态、reason code、证据链接和最终结果。CLI 不依赖 RECON 自有后端。

完成标准：正常记录为 `VERIFIED`；Graph 或 mirror node 不可用时为 `UNVERIFIABLE`；缺失、矛盾或伪造证据给出稳定且可复验的原因。

## 9. S5：作弊、罚没与冻结演示

1. 在正常 Agent 流程上增加唯一作弊开关，只修改 DATA_QUERY 的 `canonicalResponseHash`。
2. Verifier 生成确定性的 mismatch evidence 和 `evidenceHash`。
3. 受信任 verifier 使用相同 `evidenceHash` 调用 `slash`。
4. owner 执行 kill-switch，后续 Agent 动作产生可检查的拒绝结果。

完成标准：伪造记录在 10 秒内显示 `MISMATCH`；罚没交易在 60 秒内可查；罚没仅减少 Agent operator stake；演示和文档统一使用“verifier 裁决罚没”。

## 10. S6：两日最小真实 Demo

### 范围冻结

本阶段服务的是一个受邀 Demo 用户和一个一次性 testnet Vault，不建设通用产品后台：

- **保留**：读取真实预部署 mandate、owner 钱包连接、normal/forged live run、R1-R5、真实证据链接、verifier 裁决、owner kill-switch 和链上拒绝探测。
- **删除**：注册登录、nonce/session、任意用户部署与注资、任意参数表单、数据库、持久任务队列、历史列表、通知和多租户部署。
- **真实性**：所有成功状态来自 Hedera testnet、HCS、The Graph 与 Blocky402；fixture 只用于自动测试，主入口和视频禁用。
- **诚实边界**：页面固定显示 `Prepared testnet vault` 和 `Local demo controller`。这是一套可真实操作的演示环境，不宣称为无权限公共服务。

### S6.0 真实性 Gate（先做，最多 3 小时）

1. 恢复并验证 Graph gateway 的 `_meta`/固定区块语义，确保 R1 live replay 稳定。
2. 为 R5 增加 settlement receipt 读取；付款金额、资产、服务和结算引用都必须来自真实回单，正常 run 最终必须是 `VERIFIED`，不能把 `UNVERIFIABLE` 涂绿。
3. 用现有 `pay:header -> run:live -> verify:live` 生成一条新的 normal correlation，并保存 CLI 输出与公开引用。
4. 为最终录制准备一个新的 Active Vault：未来 deadline、足够两次动作的 principal、足够一次 slash 的 operator stake；旧 Vault 只用于排练。

Gate 失败即停止前端开发，先修真实链路。通过证据是一条 CLI normal run 的 R1-R5 全部 `VERIFIED`，以及 HashScan/HCS/Graph/x402 的公开引用。

状态：核心真实性 Gate 已通过。2026-09-11 生成 correlation `live-1789115733718`；Graph 双重重放 hash 为 `0x41f0335a7f2c684a2787551cab656b9aab0dc2bde2af885a5516d1c4f2f71e72`，Vault transaction 为 `0xcf68d70dd76703012c86d5f513831f8df8cc6f660617fd375aed8db5f44f1023`，Blocky402 settlement 为 `0.0.7162784@1789115709.735632430`，独立 CLI 的 R1-R5 全部 `VERIFIED`。最终 AI normal/forged 录制仍需新建一次性 Vault。

### S6.1 最小可复用工作流（3 小时）

只提取 Web 必需逻辑，现有 CLI 继续作为薄入口：

- `createPaymentHeader()`：从 agent 服务端身份在内存中生成一次性真实付款头，不写 `.env`，不返回浏览器。
- `runLive(mode, onProgress)`：复用现有 Graph、x402、vault 与 HCS 适配器；每完成一步报告状态；只允许 `normal | forged`。
- DeepSeek V4 Flash 只从 `EXECUTE_VAULT / STOP` 中选择工具并生成短 rationale；代码根据 Graph TVL 与付款状态计算并校验策略结果，HCS 记录 prompt/input/output hash 和公开理由。
- `verifyLive(correlationId)`：复用 CLI 的 R1-R5 组装并返回统一 `VerificationReport`。
- `adjudicate(correlationId)`：重新验证，仅 `MISMATCH` 时按固定金额 slash；禁止浏览器提供 evidenceHash 或 amount。
- `prepareKillTransaction()` 与 `probeFrozen()`：前者只返回固定 Vault 的 `to/data/chainId` 给 owner 钱包签名，后者让受限 agent 提交固定 1 tinybar 动作并读取 `NotActive` 事件。

不重构 core、adapters 或合约，不增加通用 job 框架。

### S6.2 Loopback Demo API（3 小时）

扩展现有 Node server，只监听 `127.0.0.1`，只接受配置好的固定资源：

| 端点 | 行为 |
|---|---|
| `GET /demo/context` | 实时读取 Vault state/roles、服务 readiness 和部署/注资/stake 公开引用 |
| `POST /demo/runs` | body 只允许 `{ mode: "normal" | "forged" }`；单 job 锁；立即返回 correlation ID |
| `GET /demo/runs/:id` | 返回五步进度、真实输出摘要和错误；绝不返回 Graph key、私钥或付款头 |
| `POST /demo/verify/:id` | 从 HCS、Vault、Graph 和 settlement receipt 运行共享 verifier |
| `POST /demo/adjudicate/:id` | 重新验证 forged correlation 后执行幂等 slash |
| `GET /demo/kill-transaction` | 返回 owner 钱包需要签署的固定 kill transaction request |
| `POST /demo/probe-frozen` | kill receipt 成功后提交固定最小 agent 动作并返回链上拒绝证据 |

安全边界：校验 `Origin` 与 JSON schema；不接受 vault、recipient、amount、RPC、topic、URL、命令或密钥；一次只运行一个任务；所有外部调用有超时；进程重启后进行中任务如实标为失败。该写操作 API 不部署到公网。

### S6.3 单页用户流程（4 小时）

使用单路由纵向页面：首屏展示项目定位、claimed / actual / allowed 模型、证据链和真实集成，通过页内锚点进入现有工作台；不增加独立营销路由。工作台只实现五段：

1. **Live mandate**：连接 owner EIP-1193 钱包；从 `/demo/context` 显示真实 Vault 地址、Active/Frozen、budget、spent、principal、stake、recipient、deadline 和公开交易链接。
2. **Run agent**：点击一次启动 normal run；时间线显示 Graph query -> x402 payment -> proposal -> vault execution -> HCS publish，每步有 pending/success/error 和真实引用。
3. **Verify**：点击或自动验证刚生成的 correlation；展示 claimed/actual/allowed、R1-R5 与最终状态。
4. **Adversarial check**：明确标识为演示攻击场景；启动仅修改 claimed response hash 的第二次真实 run，显示 claimed/replayed hash 差异；请求 verifier 裁决并展示 evidenceHash、slash tx 与 stake 变化。
5. **Emergency stop**：owner 钱包签署 kill transaction；确认后点击 Test blocked action，展示真实 `REJECTED / NotActive` 交易。

页面刷新后只需允许粘贴已完成 correlation ID 并重新验证，不恢复进行中的内存 job。状态不只靠颜色；按钮防重复；长 hash 可读；320/768/1440 px 无页面级溢出。

### S6.4 验收与录制 Gate（3 小时）

- API 单测：非法 mode/ID、并发 run、重复裁决、VERIFIED 禁止 slash、密钥脱敏和外部超时。
- Web 交互：real context 加载、normal -> VERIFIED、forged -> MISMATCH -> slash、owner kill -> NotActive；自动化测试可注入 fake transport，但最终 testnet smoke 的展示数据必须为 live。
- CLI 与 Web 对同一两个 correlation ID 的 `VerificationReport` 深度一致。
- 浏览器 Network、生产 bundle、服务日志和截图中没有私钥、Graph key 或付款头。
- 最终视频从打开工作台开始，全程由页面发起；可剪掉 testnet 等待，但不得替换响应或手改状态。

### 两日时间盒

| 时间 | 唯一目标 | 失败处理 |
|---|---|---|
| 第 1 天上午 | S6.0：R1/R5 live normal 全绿 | 不写 UI，继续修真实性 |
| 第 1 天下午 | S6.1-S6.2：固定 Demo API 跑通 normal/verify | 砍实时动画，只保留阶段状态 |
| 第 2 天上午 | S6.3：Web 完成 normal/forged/slash/kill | 砍移动端细节，不砍真实流程 |
| 第 2 天下午 | S6.4：全检、testnet smoke、换新 Vault、录制 | Bazantic 只在已有真实证据时加入 |

Bazantic Recipe 不阻塞核心用户 Demo；若第 2 天上午前没有真实可运行 Recipe，就从视频主流程和奖项声明中移除，不使用截图或静态响应冒充。

当前可复用证据：`d665132` 已跑通真实 x402 付款与 live loop，`28731d5` 记录了已部署并注资的 testnet Vault、stake、HCS topic 和 Graph target，`21a8cdf` 提供现有响应式 UI 壳。

## 11. S7：端到端交付

按以下顺序收口：

1. 运行 format、lint、typecheck、unit、contract、integration 和 build。
2. 从空环境执行 README setup，修正不可复现步骤。
3. 从全新浏览器会话执行一次完整用户流程：连接 owner 钱包 -> 打开真实预部署 mandate -> normal run -> Web 验证。
4. 继续在同一工作台执行 adversarial run -> mismatch -> 请求 verifier 裁决 -> slash -> owner kill-switch -> 后续动作被拒绝。
5. 用独立 CLI 重验 Web 刚生成的两个 correlation ID，保存一致性输出。
6. 保存合约地址、topic ID、Graph deployment、交易、付款和 Recipe 证据。
7. 更新 README 的用户操作、架构、可信边界、AI 使用范围与复验命令。
8. 用 loopback Demo 控制器和生产 Web build 排练；公开部署只提供只读证据页，不公开带服务密钥的写操作控制器。
9. 按 3-4 分钟用户视角脚本录制视频，并预留真实交易失败时的重新录制时间；终端只可在结尾用作独立复验证据。
10. 对照 PRD 提交清单逐项签收，9/13 20:00 后不再增加功能。

最终完成标准：评委能在录屏中看到用户仅通过 Web 与钱包操作一个真实 testnet Vault 的完整闭环，也能只根据 README、CLI 和公开基础设施分别复验一个正常 correlation ID 和一个作弊 correlation ID。明确披露 Vault 是预部署 Demo 环境，不宣称任意用户自助创建。

## 12. 每次开发循环

单 Agent 每次只推进一个可验收切片：

1. 从本路线图选择当前未完成的最小条目。
2. 阅读对应 PRD、现有实现和测试。
3. 写下本次可观察的完成条件。
4. 实现最小改动并补充必要测试。
5. 运行相关检查，检查 diff 和敏感信息。
6. 更新 README、部署证据、路线图状态和 `AGENTS.md` 中已经稳定的命令。
7. 按 `AGENTS.md` 创建聚焦的 Conventional Commit，并立即 push 当前分支到 `origin`。
8. 记录 commit 和验证证据，交付本次结果与剩余风险，再开始下一切片。

禁止同时展开多个半成品阶段。外部证据未得到前，不把任务标记为完成。

## 13. 明确不进入当前路线

以下项目只有在 S0-S7 全部通过后才重新评估：

- 多资产统一计价。
- 调用者任意提供价格的止损。
- 生产级 oracle、keeper 或无许可 fraud proof。
- 自部署 subgraph。
- Hedera Agent Kit 插件。
- TEE、跨链、保险、复杂治理和非必要 UI 动效。

砍功能顺序保持为：自部署 subgraph -> Agent Kit 插件 -> 价格止损 -> 非必要 UI。P0 的单场景闭环不得为了增加功能而削弱。
