# RECON 实现路线图

> 状态：开发前基线
> 日期：2026-09-09
> 执行方式：单 Agent 串行推进
> 产品基准：`docs/prd.md` v1.1

本文只定义实现顺序、目录落位、阶段门槛和交付证据。产品范围、验收标准与对外口径仍以 `docs/prd.md` 为准。

## 1. 当前状态

仓库已完成最小工程骨架，并提前实现了大量 S1-S6 代码：

- S0.1 骨架完成；S0.2/S0.3 spike 代码就绪，S0.4 完成 facilitator 支持发现。
- Evidence/Verification v1 类型、canonicalization、hash、R1/R2/R4 对账核心已实现并有单元测试。
- `PolicyVault` 已实现单资产 HBAR 版本（HTS 探针稳定后仍可评估切回），合约测试通过。
- Agent 确定性工作流、verifier 演示快照、CLI（`demo:verify` / `demo:verify:forged`）与 Web 面板雏形已就位。
- 全部演示数据仍为 `LOCAL_FIXTURE`；实网证据被凭据阻塞：缺 testnet 私钥、`GRAPH_API_KEY`、deployment ID 与 Blocky402 付款。
- Gate 0 未通过前，新工作只允许 spike 代码、工程基础和文档。

### 阶段状态

| 阶段 | 目标 | 当前状态 | 完成证据 |
|---|---|---|---|
| S0 | 工程骨架与三个 Gate 0 spike | 进行中 | S0.1 已完成；S0.2 RPC 已实测、合约测试通过；S0.3 重放代码就绪；S0.4 facilitator 发现已实测。实网部署/付款待凭据 |
| S1 | 冻结 Evidence、Verification、PolicyVault v1 契约 | 进行中 | Evidence/Verification v1 与 canonicalization 有实现和单测（`fb9a9f7`-`96d1a8c`）；PolicyVault v1 接口落地（`c8f4092`）。冻结签收待 Gate 0 |
| S2 | PolicyVault 与共享 Core | 进行中 | PolicyVault 合约与 11 个合约测试通过（`c8f4092`、`b401a1e`）；R1/R2/R4 对账核心已实现。testnet 部署待凭据 |
| S3 | 外部适配器与正常 Agent 闭环 | 进行中 | 确定性 Agent 工作流骨架与时间线校验完成（`444e27e`）；HCS mirror 读适配器完成（`0e5c062`）。hedera 提交、HCS 发布、x402 付款与真实闭环未实现 |
| S4 | Verifier Core 与独立 CLI | 进行中 | R1-R5 全部实现并有单测：R1/R2/R4（`13da70a`-`d97a6f2`）、R3/R5（`a4d61e2`）；CLI `demo:verify` 覆盖 normal/forged。CLI 待接真实链上证据 |
| S5 | 作弊、罚没与冻结演示 | 进行中 | fixture 级 forged 路径已检测为 MISMATCH（`8a61146`、`4dd39e8`）。链上 slash 与 kill-switch 演示待部署 |
| S6 | 付费 API、Bazantic Recipe 与 Web 面板 | 进行中 | Web 面板消费共享 verifier 快照（`f0e9f4f`-`a7e47e2`）。付费 API 与 Bazantic Recipe 未开始 |
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
│   ├── agent/                 # 确定性 Agent 工具循环与流程编排
│   ├── verifier/              # R1-R5 验证流程和 evidenceHash 生成
│   ├── cli/                   # 独立验证 CLI 入口
│   └── api/                   # RECON 付费验证 API
├── web/                       # Vite + React 三栏对账界面
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
Gate 0：Hedera / Graph / x402+Bazantic 三个 spike
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
x402 验证 API + Bazantic Recipe
    ↓
React 三栏面板
    ↓
端到端复验、部署、README、视频与提交
```

任何阶段发现基础假设失败，都先执行该阶段的降级方案并更新 PRD/路线图，再进入下游；禁止让下游代码建立在未验证的假设上。

`S0-S7` 是本文的实现阶段；`docs/prd.md` 中按日期定义的 `M0-M5` 仍是唯一交付里程碑，两者不得混用。

### 与 PRD 里程碑对齐

| PRD 里程碑 | 截止时间（北京时间） | 本文对应阶段 | 当日必须得到的结果 |
|---|---|---|---|
| M0 | 9/9 | S0 | 三个 Gate 0 spike 结论、代码和真实证据 |
| M1 | 9/10 | S1-S3 | 单资产 vault、Graph、HCS 和 Agent 正常闭环 |
| M2 | 9/11 上午 | S4-S5 | CLI 对账、作弊检测、罚没和真实 x402 付款 |
| M3 | 9/11 下午 | S6 | 三栏面板、部署链接和 Check-in #2 |
| M4 | 9/12 | S7 | README、证据清单和 3-4 分钟视频 |
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

状态：进行中。`1368f66` 已实测 testnet chain ID 296 和区块读取；`60fd40a`、`6483a05` 已完成 HTS 探针编译、owner 与参数边界测试。真实部署、association 和 transfer 仍需 testnet ECDSA 私钥与 HTS token。

### S0.3 The Graph 重放 spike

实现最小查询与重放脚本，验证：

- 使用真实 provider 和 live subgraph。
- 固定 deployment、final block number/hash、query 和 variables。
- 定义 JSON canonicalization v1。
- 两次独立查询得到相同 canonical response hash。
- 目标 deployment 能读取固定历史区块。

交付证据：一条命令输出全部固定参数、hash 和 `VERIFIED`。

失败降级：更换保留历史状态的 subgraph；在可稳定重放前，不实现依赖该查询的 Agent 决策。

状态：进行中。`3e65336`、`da84c56`、`482d132` 已完成 deployment-pinned 配置、双重重放与脱敏 CLI，22 个单元测试通过。真实查询仍需 `GRAPH_API_KEY`、deployment ID 和 final block number。

### S0.4 x402 / Blocky402 / Bazantic spike

实现最小 `POST /verify-query` 服务，验证：

- 未支付请求返回可识别的 402 支付要求。
- Agent 在 Hedera testnet 完成一次真实付款并成功重试。
- 付款引用能对应到真实结算交易。
- Bazantic Gateway/Recipe 能调用同一验证服务，并与 The Graph 输出组合。

交付证据：402 响应、支付引用、结算交易、服务响应、Gateway/Recipe 链接和复验命令。

失败降级：若 Blocky402 与 Bazantic 不能共用网关，为同一 API 提供两个薄适配器；若真实支付仍不可用，立即重新评估对应赛道，不用 mock 冒充完成。

状态：进行中。`c886c77`、`6c52b42` 已实现 facilitator 支持发现（scheme exact / hedera:testnet / x402 v2），`c57c79f` 提供实网探测命令。`3643a52`、`b16c9f5` 补充 facilitator verify/settle 适配器与 402 门禁 verify-query 服务；`npm run probe:x402` 已实测：facilitator 支持 VERIFIED（feePayer `0.0.7162784`）、服务 402 合约 VERIFIED，真实 402→付款→重试闭环仍需付款人凭据，Gate 保持 OPEN。

### S0 Gate

三个 spike 都必须有代码、命令和外部证据。Gate 未通过时，只允许修复 spike、工程基础或文档，不进入完整 UI、复杂合约或 P2。

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

## 10. S6：API、Bazantic 与 Web 面板

### S6.1 付费验证 API

将 Gate 0 的最小服务接入正式 verifier core：

- 请求和响应使用版本化 schema。
- 支付成功不等于验证通过。
- 重复请求按幂等键处理。
- 日志不包含授权头、签名支付载荷或私密 API 内容。

### S6.2 Bazantic Recipe

Recipe 串联 The Graph 与 RECON API，最终 Agent 动作必须依赖两个服务的真实输出。只在实际可运行后记录 Gateway、Recipe 和账户证据。

### S6.3 React 面板

最后实现面板，因为它消费已经稳定的 verifier 输出：

- Claimed / Actual / Allowed 三栏对照。
- 状态文字、原因和原始证据链接。
- `MISMATCH`、`UNVERIFIABLE`、`REJECTED`、`PENDING` 明确区分。
- 正常和作弊 correlation ID 可稳定切换展示。
- 桌面与移动端都能阅读长 hash、地址、金额和失败原因。

完成标准：Web 和 CLI 对同一 correlation ID 得到相同结果；前端不自行实现第二套验证规则，也不隐藏失败或不可验证状态。

## 11. S7：端到端交付

按以下顺序收口：

1. 运行 format、lint、typecheck、unit、contract、integration 和 build。
2. 从空环境执行 README setup，修正不可复现步骤。
3. 运行一个真实正常流程和一个只伪造 response hash 的作弊流程。
4. 保存合约地址、topic ID、Graph deployment、交易、付款和 Recipe 证据。
5. 更新 README 的架构、可信边界、AI 使用范围与复验命令。
6. 部署公开 Demo，检查所有链接和网络标识。
7. 按 3-4 分钟脚本录制视频，并预留真实交易失败时的重新录制时间。
8. 对照 PRD 提交清单逐项签收，9/13 20:00 后不再增加功能。

最终完成标准：评委可以只根据 README 和公开基础设施，分别复验一个正常 correlation ID 和一个作弊 correlation ID。

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
