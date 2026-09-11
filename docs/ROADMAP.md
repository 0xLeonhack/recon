# RECON 实现路线图

> 状态：用户可用闭环重排
> 日期：2026-09-11
> 执行方式：单 Agent 串行推进
> 产品基准：`docs/prd.md` v1.2

本文只定义实现顺序、目录落位、阶段门槛和交付证据。产品范围、验收标准与对外口径仍以 `docs/prd.md` 为准。

## 1. 当前状态

仓库已完成最小工程骨架，并提前实现了大量 S1-S6 代码：

- S0.1 骨架完成；S0.2/S0.3 spike 代码就绪，S0.4 完成 facilitator 支持发现。
- Evidence/Verification v1 类型、canonicalization、hash、R1/R2/R4 对账核心已实现并有单元测试。
- `PolicyVault` 已实现单资产 HBAR 版本（HTS 探针稳定后仍可评估切回），合约测试通过。
- Agent 确定性工作流、verifier 演示快照、CLI（`demo:verify` / `demo:verify:forged`）与 Web 视觉壳已就位。
- Web 当前只能切换 `LOCAL_FIXTURE`，没有钱包、控制 API 或真实运行入口，不能视为用户可用产品，也不能作为视频主流程。
- 全部演示数据仍为 `LOCAL_FIXTURE`；实网证据被凭据阻塞：缺 testnet 私钥、`GRAPH_API_KEY`、deployment ID 与 Blocky402 付款。
- Gate 0 未通过前，新工作只允许 spike 代码、工程基础和文档。

### 阶段状态

| 阶段 | 目标 | 当前状态 | 完成证据 |
|---|---|---|---|
| S0 | 工程骨架与三个 Gate 0 spike | 进行中 | S0.1 已完成；S0.2 RPC 已实测、合约测试通过；S0.3 重放代码就绪；S0.4 facilitator 发现已实测。实网部署/付款待凭据 |
| S1 | 冻结 Evidence、Verification、PolicyVault v1 契约 | 进行中 | Evidence/Verification v1 与 canonicalization 有实现和单测（`fb9a9f7`-`96d1a8c`）；PolicyVault v1 接口落地（`c8f4092`）。冻结签收待 Gate 0 |
| S2 | PolicyVault 与共享 Core | 进行中 | PolicyVault 合约与 11 个合约测试通过（`c8f4092`、`b401a1e`）；R1/R2/R4 对账核心已实现。testnet 部署待凭据 |
| S3 | 外部适配器与正常 Agent 闭环 | 进行中 | hedera vault 读/执行适配器（`56d96b3`）、HCS 读（`0e5c062`）+ 发布（`cdb6e61`）、live runner（`994988a`）完成；`run:live` 真实闭环与 x402 程序化付款待凭据 |
| S4 | Verifier Core 与独立 CLI | 进行中 | R1-R5 全部实现并有单测（`a4d61e2`）；`verify:live` CLI 从 HCS+vault+Graph 真实证据出报告（`9ca0157`）。R5 结算回单查询待 facilitator 接口 |
| S5 | 作弊、罚没与冻结演示 | 进行中 | fixture 级 forged 检测完成；`slash:forged`（确定性 evidenceHash → slash）与 `kill:switch`（冻结 → NotActive 拒绝）脚本就绪（`8a45d23`）。实网执行待凭据 |
| S6 | 控制 API、用户工作台与 Bazantic Recipe | 进行中 | Web 视觉壳与 fixture 对账视图完成（`f0e9f4f`-`21a8cdf`），但用户闭环为 0%；钱包、签名会话、程序化付款、真实 run/verify/respond API 与 Bazantic Recipe 均未完成 |
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
│   ├── api/                   # x402 公共验证服务 + 同源用户控制 API
│   └── generated/             # 从 Hardhat artifact 生成的 ABI/bytecode 客户端
├── web/                       # Vite + React 用户工作台：连接、委托、运行、验证、处置
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
x402 程序化付款 + 可复用 Agent/Verifier 应用服务
    ↓
签名会话 + 控制 API + 浏览器钱包
    ↓
React 用户工作台 + Bazantic Recipe：Connect -> Mandate -> Run -> Verify -> Respond
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
| M2 | 9/11 | S4-S5 | CLI 对账、作弊检测、罚没、程序化真实 x402 付款与控制 API 契约 |
| M3 | 9/12 上午 | S6 | 用户从 Web 连接钱包、部署/注资、启动真实 run 并得到对账结果 |
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

状态：进行中。`c886c77`、`6c52b42` 已实现 facilitator 支持发现（scheme exact / hedera:testnet / x402 v2），`c57c79f` 提供实网探测命令。`3643a52`、`b16c9f5` 补充 facilitator verify/settle 适配器与 402 门禁 verify-query 服务；`npm run probe:x402` 已实测：facilitator 支持 VERIFIED（feePayer `0.0.7162784`）、服务 402 合约 VERIFIED。`994988a` 起真实 402→付款→重试闭环支持 out-of-band 付款头（`X402_PAYMENT_HEADER`），程序化付款人仍待 Blocky402 付款 schema 实测，Gate 保持 OPEN。

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

## 10. S6：控制 API、用户工作台与 Bazantic

S6 的完成定义不是“页面能展示 fixture”，而是一个真实用户能从全新浏览器会话走完 `Connect -> Mandate -> Run -> Verify -> Respond`。开发和测试可保留 fixture，但生产入口与视频主流程必须连接真实 Hedera testnet、HCS、The Graph 和 x402 服务。

### S6.0 用户闭环前置 Gate

以下前置项按顺序完成，任何一项未通过时都不进入视频录制：

1. 用真实凭据跑通 S0 的 Graph 固定区块重放、Hedera testnet 部署/转账和 Blocky402 结算。
2. 将 `run-live` 的人工 `X402_PAYMENT_HEADER` 替换为服务端程序化 payer；保存 402、付款、重试和结算引用。
3. 将 `scripts/run-live.ts`、`verify-live.ts`、`slash-forged.ts` 的可复用逻辑下沉到 `src/agent/`、`src/verifier/` 和应用服务；API 不得 shell-out 执行脚本。
4. 固定公开运行配置：chain ID、RPC、mirror node、HCS topic、Graph deployment、agent/operator/verifier/beneficiary 地址和默认动作参数。私钥只从服务端环境读取。

完成标准：服务层可在不依赖 CLI 进程和人工付款头的情况下完成一条真实正常 run；缺少任一外部凭据时明确返回 `UNVERIFIABLE`，不回退 fixture。

### S6.1 控制 API 与签名会话

在 x402 公共服务之外建立同源控制 API，使用版本化 Zod schema：

| 端点 | 用途 | 权限与约束 |
|---|---|---|
| `GET /api/config` | 返回公开网络、角色、topic 和合约版本 | 不返回 URL 中的密钥、私钥或支付载荷 |
| `POST /api/session/challenge` | 为钱包地址生成短时一次性 nonce | 有 TTL、一次性消费和速率限制 |
| `POST /api/session` | 验签并建立 HttpOnly、SameSite 会话 | 签名文案包含 origin、chain ID、nonce 和过期时间 |
| `DELETE /api/session` | 注销当前钱包会话 | 清除服务端会话和 cookie；账户/网络变化时调用 |
| `POST /api/vaults/:address/prepare` | 校验链上 owner/mandate，并由 operator 存入固定演示 stake | 调用者必须是 vault owner；金额服务端固定；按 vault 幂等 |
| `POST /api/vaults/:address/probe-frozen` | kill-switch 后提交固定 1 tinybar 探测动作 | 仅 Frozen vault；受限 agent 签名；必须得到链上 `NotActive` 拒绝 |
| `POST /api/runs` | 启动 normal 或 adversarial Agent run | 调用者必须是 vault owner；recipient/amount 由 mandate 与确定性函数约束 |
| `GET /api/runs/:correlationId` | 获取步骤状态与公开引用 | owner 可看运行态；完成证据可公开读取 |
| `POST /api/verifications` | 从真实外部证据运行共享 verifier | 输入 vault + correlation ID；输出统一 `VerificationReport` |
| `POST /api/adjudications/:correlationId/slash` | 请求 verifier 裁决罚没 | 服务端重新验证；仅 `MISMATCH`；固定金额；幂等 |

长任务使用内存 job 状态 + HCS 权威完成记录。`POST /api/runs` 立即返回 `correlationId`；Web 每 1-2 秒轮询。服务重启后，已完成 run 必须可从 HCS/mirror node 重建；进行中的 run 可以诚实标记 `UNVERIFIABLE / SERVICE_RESTARTED`，不得伪造完成状态。

所有 mutation 端点校验 `Origin`、会话与 CSRF token。测试至少覆盖 nonce 重放、过期签名、错误 chain/origin、非 owner、任意 amount/recipient 注入、重复 run、重复 slash、VERIFIED 禁止 slash、非 Frozen 探测、外部超时和响应脱敏。

### S6.2 钱包与合约交互层

Web 使用当前已安装的 viem 和浏览器 EIP-1193 provider：

1. 检测钱包；请求账户；添加或切换 Hedera testnet chain ID 296。
2. 创建短时签名会话；监听 `accountsChanged` / `chainChanged` 并立即失效旧会话。
3. 从 Hardhat artifact 自动生成只读 ABI/bytecode 模块，并由 stale-check 保证与合约一致；不维护手写第二份 ABI。
4. 用户填写 HBAR budget cap、单个 recipient 和 deadline。agent/operator/verifier/beneficiary 为只读公开配置，签名前完整确认。
5. owner 钱包部署 `PolicyVault`，等待 receipt，确认链上 owner 与 mandate；随后单独调用 payable `fund()` 注资。
6. owner 钱包调用 `kill(reasonHash)`；前端等待 receipt 后从链上刷新状态。

所有金额在表单层以 HBAR 展示、在边界转换为整数字符串 tinybar；禁止浮点运算。拒签、余额不足、网络错误和交易失败保留用户输入并提供明确重试，不允许前端代签或上传私钥。

### S6.3 单工作台产品流

保留一个工作台而非增加营销页，按以下状态机呈现：

1. **Connect**：钱包、账户、Hedera testnet、服务健康与凭据就绪状态。
2. **Mandate**：表单、角色确认、Deploy、Fund、operator stake 和链上状态；每个交易提供 HashScan 链接。
3. **Run**：一个主按钮启动 normal run；步骤时间线实时展示 Graph query、x402 payment、proposal、vault execution 与 HCS publish。高级 Demo 控制中可启动唯一的 forged-hash adversarial run。
4. **Verify**：自动加载刚完成的 correlation ID，也允许粘贴其他 ID；展示 claimed / actual / allowed、R1-R5、evidenceHash 和原始公开引用。
5. **Respond**：`MISMATCH` 时显示“Request verifier adjudication”，清楚标注受信任 verifier；owner 可执行 kill-switch。交易确认后，“Test blocked action”让受限 agent 提交固定 1 tinybar 探测动作，并展示 stake 变化与链上 `NotActive` 拒绝结果。

页面刷新时从 URL/localStorage 恢复 vault 与 correlation ID，但所有状态以链上、HCS 和 verifier API 为准。生产入口不得自动调用 `createDemoSnapshot()`；fixture 只能通过显式开发开关进入并持续标注。

可访问性和响应式验收：键盘可完成除钱包弹窗外的操作；pending 按钮防重复提交；错误与状态不只靠颜色；320 / 768 / 1440 px 无页面级横向溢出；长 hash、地址和 reason code 可读且不遮挡。

### S6.4 Web / CLI 契约与证据链接

- API、CLI 和 Web 共用 `VerificationReport` 与 run-status schema；添加同一 live fixture/录制输入的契约测试，禁止前端推导第二套结论。
- Hedera 交易、合约和 HCS topic 指向 HashScan 或 mirror node；Graph 展示 deployment、final block、query/variables hash 和可复验命令；x402 展示不含签名载荷的付款与 settlement 引用。
- 外部链接必须根据公开 reference 结构化生成并校验协议/网络，不能把任意服务端字符串直接注入 `href`。
- 生产构建扫描 `HEDERA_*_PRIVATE_KEY`、`GRAPH_API_KEY`、付款头和授权头；命中即失败。

### S6.5 Bazantic Recipe

Recipe 串联 The Graph 与同一个 RECON x402 API，最终 Agent 动作必须依赖两个服务的真实输出。只在实际可运行后记录 Gateway、Recipe、账户和完整录屏证据；Bazantic 失败不得阻止 Web 对 Hedera/The Graph 的错误状态如实呈现。

### S6.6 S6 完成 Gate

必须一次性满足：

- 从全新浏览器会话开始，不打开终端，用户通过钱包完成 deploy、fund、normal run 和验证，最终为 `VERIFIED`。
- 同一用户启动 adversarial run，10 秒内看到 `MISMATCH`；请求裁决后 60 秒内看到相同 `evidenceHash` 的真实 slash 交易和 stake 变化。
- owner 触发 kill-switch，随后一次 agent 动作在链上被拒绝并显示 `REJECTED / NotActive`。
- 页面展示真实可点击证据；刷新后可恢复完成记录；断网/拒签/服务失败不显示成功。
- CLI 对同一 normal/adversarial correlation ID 给出与 Web 相同的逐项结果。
- 自动检查、浏览器交互测试、合约测试和一次 testnet smoke 全部通过，且浏览器 bundle/网络响应/日志无密钥或支付签名材料。

当前证据（仅视觉层，不计入 S6 完成）：

- `21a8cdf`：重构 fixture Evidence Console 的状态总览、三栏对账、规则输出和证据时间线。
- `npm run check`：format、lint、typecheck、109 个单测、合约编译和 Web 生产构建通过。
- Chrome 无头实测：320 / 768 / 1440 px fixture 页面无横向溢出；Normal/Forged 状态切换正确。

## 11. S7：端到端交付

按以下顺序收口：

1. 运行 format、lint、typecheck、unit、contract、integration 和 build。
2. 从空环境执行 README setup，修正不可复现步骤。
3. 从全新浏览器会话执行一次完整用户流程：连接钱包 -> 创建委托 -> 部署与注资 -> normal run -> Web 验证。
4. 继续在同一工作台执行 adversarial run -> mismatch -> 请求 verifier 裁决 -> slash -> owner kill-switch -> 后续动作被拒绝。
5. 用独立 CLI 重验 Web 刚生成的两个 correlation ID，保存一致性输出。
6. 保存合约地址、topic ID、Graph deployment、交易、付款和 Recipe 证据。
7. 更新 README 的用户操作、架构、可信边界、AI 使用范围与复验命令。
8. 部署公开 Demo，使用无缓存浏览器检查钱包、刷新恢复、所有链接和网络标识。
9. 按 3-4 分钟用户视角脚本录制视频，并预留真实交易失败时的重新录制时间；终端只可在结尾用作独立复验证据。
10. 对照 PRD 提交清单逐项签收，9/13 20:00 后不再增加功能。

最终完成标准：评委既能仅通过 Web 与钱包亲自走完一次用户闭环，也能只根据 README、CLI 和公开基础设施分别复验一个正常 correlation ID 和一个作弊 correlation ID。

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
