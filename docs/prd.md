# RECON - 产品需求文档（PRD）

> 版本：v1.3（2026-09-11）
> 配套文档：project-brief.md（对外版）、features-flow-highlights.md（讲稿）、learning-checklist.md（学习清单）
> 本文件是开发执行基准。当前目标是先完成可验证的单场景闭环，再扩展约束和自动处置。

---

## 1. 概述

**一句话**：RECON 是 AI Agent 的委托对账工作台；Demo 用户从浏览器打开真实受限委托、启动 agent，并核对 agent「声称做了什么 / 实际做了什么 / 委托允许什么」，把不一致变成可复验的证据。

**问题**：用户可以给 agent 设置限额、白名单和期限，但仍难以回答三个问题：约束是否真的执行、agent 是否漏报行为、agent 声称使用的数据能否重验。

**方案**：策略金库在执行时实施硬约束；HCS 记录带共识顺序的证据索引；公开验证器重放 The Graph 查询并核对链上动作；发现异常后，由明确标识的 verifier 在黑客松版本中执行冻结或罚没。

**Demo 主线**：一个量化 agent 使用 The Graph 的实时链上数据，购买一次 x402 验证服务，向单资产策略金库提交转账动作；正常证据全绿，伪造查询结果时被验证器标红并触发有证据哈希的罚没。

---

## 2. 目标、边界与成功标准

### 目标（G）

- G1：agent 使用受限执行身份自主提交动作，但不能绕过 PolicyVault 转移金库资产，也不持有 owner/admin 密钥。
- G2：第三方无需信任 RECON 后端，即可从 HCS、Hedera mirror node 和固定版本的 The Graph 数据源重验 Demo 证据。
- G3：自动发现「声称 / 实际 / 允许」之间的不一致，并留下可查询的处置记录。
- G4：受邀 Demo 用户不依赖终端，从 Web 打开一个真实预部署 mandate，完成 Agent 运行、对账、作弊检测和链上处置；CLI 只作为独立复验入口。
- G5：只申报已有真实证据支持的目标子赛道，不用品牌层面的 SDK 集成或静态响应占位。

### 黑客松版本的可信边界

- PolicyVault 对预算、收款方和期限做链上强制校验。
- The Graph 返回的数据通过固定 deployment、最终区块和规范化响应进行重放校验。
- HCS 证明消息内容、顺序和共识时间，不证明 agent 的内部推理。
- `verifier` 在黑客松版本中是受信任裁决者；罚没不是无许可、完全链上的欺诈证明。
- x402 facilitator、The Graph gateway/indexer 和 Hedera mirror node 是外部依赖，第三方验证不依赖 RECON 自有服务器，但仍依赖公开基础设施。

### 非目标

- 防抢跑 / MEV。
- TEE、强制代理网关和无许可欺诈证明。
- 多资产统一计价和多链部署。
- 保险或承保功能。
- 生产级隐私保护、治理和申诉系统。
- 任意用户注册、通用多租户控制 API、在浏览器创建/注资新 Vault 和持久化任务队列。
- 面板视觉过度打磨。

### Demo 成功标准

- 从全新浏览器会话开始，用户通过 Web 连接预部署 Vault 的真实 owner 钱包，页面从 Hedera testnet 读取 mandate、principal 和 stake；视频不得用 fixture 或预置 JSON 替代网络读取。
- 一条正常动作从数据查询到链上执行再到验证，全流程有真实可点击证据。
- 一条伪造 `responseHash` 的记录稳定显示为 `MISMATCH`。
- 验证器可以通过独立 CLI 运行，前端使用同一验证逻辑。
- 至少完成一次真实 x402 付费请求，并保存支付和结算证据。
- 所有外部服务在录制前完成实网/测试网探测，不以 mock 数据冒充赛道集成。
- 页面刷新后可按 `correlationId` 从 HCS 和链上重新读取已完成运行；外部服务失败或用户拒签时显示真实错误和可重试边界。

---

## 3. 用户与核心场景

### MVP 主用户

**DAO 金库操作员**：希望给自动化 agent 一笔受限预算，并能快速判断 agent 的数据声明和资金动作是否一致。

### 次要用户

- **审计者 / 评委**：使用网页或 CLI 独立重验一条记录。
- **Agent 运营方**：为 agent 提供质押，并接受 Demo 版 verifier 的裁决。

### 核心用户故事

- US1：委托人连接预部署 Vault 的 owner 浏览器钱包并切换到 Hedera testnet；Web 从链上读取真实 mandate、余额和角色，不接收、存储或传输私钥。
- US2：委托人检查预部署 Vault 的总额度、白名单、截止时间、principal、stake 与创建/注资交易链接，并明确看到“Prepared testnet vault”边界。
- US3：委托人从 Web 启动固定参数的 agent；agent 查询实时链上数据，并根据结果提交唯一一种动作：向既定白名单地址转移确定性计算的数量。
- US4：委托人或审计者在 Web 输入 `correlationId`，查看 claimed / actual / allowed 对账结果、运行进度及原始证据链接。
- US5：第三方通过 CLI 重验 Graph 查询、HCS 消息和 Hedera 交易。
- US6：伪造数据声明被检测后，委托人在 Web 请求 verifier 裁决；verifier 独立复验后提交带 `evidenceHash` 的罚没交易。
- US7：委托人用 owner 钱包触发 kill-switch，并在 Web 看到受限 agent 的固定最小探测动作被合约拒绝。

---

## 4. 开工门槛（Gate 0，2026-09-09）

以下核心 spike 未跑通前，不扩大 UI 或合约范围；Bazantic 使用独立 timebox：

| Spike | 通过标准 | 失败后的处理 |
|---|---|---|
| Hedera HTS | 合约在 testnet 持有并转出一种 HTS token | 改用合约持有 HBAR；不再宣称 HTS 转账已完成 |
| Graph 重放 | 对固定 deployment 和最终 block hash 查询两次，规范化结果 hash 一致 | 更换支持历史查询且未裁剪数据的 subgraph |
| x402/Blocky402 | Blocky402 完成一次 Hedera 真实结算，付款回单可用于 R5 | 真实付款未通过则不录制核心 Demo，不用静态回单代替 |
| Bazantic | 确认同一服务可接入 Gateway/Recipe 并产生真实输出 | 不阻塞核心 Demo；若 9/12 上午仍未跑通，从视频与奖项声明中移除 |

每个 spike 必须有代码、运行说明和单独提交，不能只保留截图或口头结论。

---

## 5. 功能需求

优先级：P0 为提交所需闭环；P1 为闭环稳定后增加；P2 为路线图或时间富余项。

### F1 单资产策略金库（PolicyVault）- P0

MVP 每个 vault 只管理一种资产，金额统一使用该资产最小单位，避免跨 token 估值和 decimals 歧义。

| 约束 | 说明 | 验收标准 |
|---|---|---|
| 总预算 | `spent + amount <= budgetCap` | 超限动作不执行，并产生 `ActionRejected` |
| 收款方白名单 | 仅允许预设 recipient | 非白名单动作不执行，并记录原因码 |
| 截止时间 | `block.timestamp <= deadline` | 过期动作不执行 |
| 紧急冻结 | owner 可冻结后续执行 | 冻结后所有 agent 动作失败 |

接口草案：

```solidity
contract PolicyVault {
    enum Status { Active, Frozen, Closed }
    struct Mandate {
        address asset;
        uint256 budgetCap;
        uint256 deadline;
    }
    struct Action {
        bytes32 evidenceId;
        address recipient;
        uint256 amount;
    }

    function execute(Action calldata action) external onlyAgent returns (bool executed);
    function depositStake(uint256 amount) external onlyAgentOperator;
    function kill(bytes32 reasonHash) external onlyOwner;
    function slash(uint256 amount, bytes32 evidenceHash) external onlyVerifier;
    function withdrawAfterClose(address recipient) external onlyOwner;

    // MandateCreated / ActionExecuted / ActionRejected / Frozen / Slashed / Closed
}
```

说明：agent 持有用于鉴权和支付 gas 的受限签名身份，但该身份没有 admin/withdraw 权限。Agent 运营方使用同一种资产存入独立记账的 stake，不能把用户本金当作罚没对象。策略拒绝路径不得通过整体 revert 丢失业务事件；若底层 HTS 调用失败，则保留失败交易和对应错误信息。

**验收**：部署到 Hedera testnet；真实完成一次资产转移；预算、白名单、期限和冻结各有成功/拒绝测试；agent 身份无法调用治理和提款函数；罚没只减少 agent stake，并把资产转给预设 beneficiary。

### F2 Agent 运行时 - P0

- TypeScript tool loop：`graphQuery`、`paidVerify`、`executeVaultAction`、`publishEvidence`。
- LLM 只选择工具和生成可公开的简短说明；金额、地址、hash 和策略判断由确定性代码生成。
- agent signer 只保留少量 gas 和受限调用权限，不保管 vault 资产或 owner 密钥。
- 所有工具调用使用同一个 `correlationId`。
- Web 通过异步运行 API 启动流程并轮询结构化状态；不得 shell-out 调用 CLI，也不得把服务密钥或支付载荷返回浏览器。
- 运行参数中的收款方和金额必须由已部署 mandate 与确定性决策函数约束，不能信任浏览器任意提交。

**验收**：用户在 Web 点击一次启动后，端到端完成「Graph 实时查询 -> x402 程序化付费验证 -> 金库动作 -> HCS 证据 -> 独立对账」；页面逐步显示每一步的 `PENDING / VERIFIED / MISMATCH / UNVERIFIABLE / REJECTED` 状态。

### F3 证据时间线（HCS）- P0

HCS 消息只保存最小公开元数据和 hash，不上传私有 API 内容、完整 prompt 或敏感策略。

```ts
type EvidenceEvent = {
  schemaVersion: "1";
  eventId: string;
  correlationId: string;
  type: "DATA_QUERY" | "API_PAYMENT" | "RATIONALE" | "ACTION_PROPOSED" | "ACTION_EXECUTED";
  actor: string;
  subjectRef: string;
  payloadHash: string;
  evidence: Record<string, string>;
};
```

- 共识时间戳和 sequence number 以 mirror node 返回值为准，不接受客户端自报 `ts`。
- DATA_QUERY 记录：network、subgraph deployment ID、final block number/hash、query hash、variables hash、canonical response hash、canonicalization version。
- ACTION_PROPOSED 记录 action/evidence hash；ACTION_EXECUTED 在执行后记录 Hedera transaction ID/hash。两者通过 `correlationId` 关联。
- API_PAYMENT 记录 facilitator、asset、amount、payment reference 和结算交易。

**验收**：mirror node 能按 sequence number 读回全部消息；任一动作可以从 `correlationId` 找到提案、执行和支付证据。

### F4 用户工作台、对账引擎与 CLI - P0

对账规则：

- R1：按固定 deployment 和 final block 重放 Graph 查询，规范化响应后比较 hash。
- R2：从 PolicyVault 事件读取实际动作，并与动作发生时生效的 mandate 比较。
- R3：claimed 的已执行动作集合与 PolicyVault 成功事件集合一致；失败提案单独显示，不混入实际动作。
- R4：检查 HCS sequence number 和 `correlationId` 状态机顺序，不声称 HCS 给外部链事件提供全局排序。
- R5：支付收据中的金额、资产、服务和结算交易相互一致。

状态固定为：`PENDING | VERIFIED | MISMATCH | UNVERIFIABLE | REJECTED`。

- Web 首屏是可操作工作台，不是 landing page 或 fixture viewer。主流程固定为 `Open live mandate -> Run -> Verify -> Respond`。
- Demo 环境：使用一个在 Hedera testnet 预先部署、注资并存入 operator stake 的一次性 Vault。页面必须从 RPC/mirror node 读取其当前状态并展示部署、注资和 stake 交易链接，不能把静态配置显示成实时状态。
- 钱包边界：使用浏览器 EIP-1193 provider 连接预部署 Vault 的真实 owner 地址和 Hedera testnet（chain ID 296）。正常运行不需要 owner 签名；kill-switch 由 owner 钱包直接签名。Web 和 Demo 控制器永不接收 owner 私钥。
- 服务边界：agent、agent operator、verifier 和 HCS 提交身份只存在于本地 Demo 控制器进程；前端只接收公开地址、结构化状态和公开证据引用。控制器只监听 loopback、校验 Origin、一次只运行一个 job，不能接收任意命令、地址、金额、付款头或私钥。
- 运行步骤：Web 只能选择 `normal` 或唯一的 `forged-response-hash` 场景；vault、recipient、amount、Graph target、topic 和角色全部来自服务端固定环境。API 立即返回 `correlationId`，前端轮询 DATA_QUERY、API_PAYMENT、ACTION_PROPOSED、ACTION_EXECUTED 和 HCS 发布状态。
- 对账步骤：claimed / actual / allowed 三栏；每行展示状态、原因和原始证据链接。Web 与 CLI 都消费 verifier core 的同一输出 schema，前端不得复制验证规则。
- 处置步骤：只有 `MISMATCH` 可请求 verifier 裁决；服务端必须重新验证、使用固定罚没额度并按 `correlationId` 幂等。kill-switch 由 owner 钱包直接调用。
- CLI：一条命令输入 topic ID、vault address 和 correlation ID，输出逐项验证结果，作为不依赖 Web 控制 API 的独立复验路径。
- fixture 只允许在测试或显式开发开关下使用，并持续显示 `LOCAL FIXTURE`；生产构建和视频主流程不得默认进入 fixture。

**验收**：从无连接状态开始，用户仅通过 Web 与钱包打开真实预部署 mandate、完成正常运行和验证，结果全部 `VERIFIED`；再启动一次明确标识的 adversarial run，伪造 hash 为 `MISMATCH` 并可请求裁决；最后用 owner 钱包冻结 vault，受限 agent 的固定 1 tinybar 探测动作显示链上 `REJECTED / NotActive`。任一步外部服务不可用时为 `UNVERIFIABLE`，不得误显示为通过或作弊。

### F5 作弊检测与 verifier 处置 - P0

- 内置作弊模式只修改 DATA_QUERY 的 `canonicalResponseHash`，其余流程与正常 agent 相同。
- 验证器输出确定性的 mismatch 证据和 `evidenceHash`。
- 黑客松版本由受信任 verifier 调用 `slash(amount, evidenceHash)`。
- 用户只能从 Web 请求裁决，不能指定任意 `amount` 或 `evidenceHash`；服务端重新验证后才允许 verifier 签名，并返回 stake 前后值与公开交易引用。
- 罚没对象是 Agent 运营方预存的 stake，不得从委托人的 vault 本金扣除。
- UI 和讲稿统一使用“verifier-mediated slashing / verifier 裁决罚没”，不宣称 permissionless slashing。

**验收**：从伪造记录到标红不超过 10 秒；从标红到罚没交易可查询不超过 60 秒；罚没事件包含同一个 `evidenceHash`。

### F6 赛道集成闭环 - P0

#### Hedera：AI & Agentic Payments

- 托管一个真实 x402-gated RECON 验证服务。
- 在 Hedera testnet 通过 Blocky402 结算。
- agent 使用服务端付款身份完成至少一次程序化真实付费请求；依赖人工粘贴 `X402_PAYMENT_HEADER` 的流程不算用户可用闭环。
- README 描述服务发现、402 响应、付款、重试、服务响应和链上结算。
- HCS 保存可验证的支付审计索引。

#### The Graph：Best AI Tooling or AI Use Case（From Scratch）

- 使用 live Graph provider 和 API key，禁止 mock/static 数据作为参赛演示。
- Graph 数据必须参与 agent 决策和后续重放验证。
- README 给出使用的 deployment、查询、变量、最终区块和复验命令。

#### Bazantic：Best Recipe that uses ETHGlobal Hackathon Sponsor APIs（独立 timebox）

- 创建 Bazantic 账户和项目的 x402/MPP Gateway。
- Recipe 同时使用 The Graph 数据服务和 RECON 验证服务。
- 最终动作必须依赖两个服务的输出。
- 录屏展示完整流程，并在提交中提供 Bazantic 用户名。

同一实现也可申报 **Agentify a new API**：将此前未进入 Bazantic、且不属于其他赞助商的 RECON 验证 API 添加为新服务，创建可工作的 Gateway，并让 Recipe 同时使用该服务与 The Graph。若提交页面允许选择同一赞助商的多个子赛道，则一并申报；不为此增加第二套产品流程。

时间盒：Bazantic 只在核心 Web live flow 通过后占用剩余时间；若没有真实可运行 Recipe、账户和录屏证据，则删除对应奖项声明，不以截图或静态响应占位。

**验收**：每个子赛道的资格条件都有对应的 URL、交易、配置或录屏证据；不能用“已集成 SDK”替代。

### F7 Kill-switch - P0

并入 F1，由 owner 在 Web 中通过钱包签名触发；页面等待链上 receipt 并刷新 vault 状态。Demo 中随后启动一次最小 agent 动作，必须展示链上 `NotActive` 拒绝结果及交易链接。

### F8 价格止损 - P2

只有在以下条件全部满足时实现：价格由授权数据签名或可信 oracle 提供；合约校验资产、价格、小数位、时间戳和最大陈旧时间；keeper 负责触发。禁止保留 `checkStopLoss(uint256 currentPrice)` 这种由调用者任意报价格的接口。

### F9 Hedera Agent Kit 插件 - P2

仅在 F1-F7 完成后，将 `executeVaultAction` 封装为可复用插件。

### F10 自部署 subgraph - P2

当前 The Graph 子赛道允许使用实时现有 subgraph。自部署索引不是 MVP 必需项。

---

## 6. 架构与技术栈

```text
Browser workbench
  |-- public RPC / mirror ------> read prepared PolicyVault mandate and evidence
  |-- EIP-1193 owner wallet ----> kill PolicyVault
  |-- fixed demo actions -------> loopback Demo controller (no owner key)
  `-- correlation ID -----------> run progress / verification / evidence links

Demo controller + Agent（server-side restricted identities）
  |-- The Graph live query -----> fixed deployment + final block evidence
  |-- x402 programmatic payer --> RECON verification API / Blocky402
  |-- execute ------------------> PolicyVault on Hedera
  `-- publish ------------------> HCS evidence topic

Public verifier core
  |-- Hedera mirror node
  |-- The Graph gateway
  `-- payment / vault evidence --> Web report + independent CLI
```

| 层 | 选型 |
|---|---|
| 链与合约 | Hedera testnet、Solidity、Hardhat、JSON-RPC Relay、HTS precompile |
| 证据顺序 | HCS topic + Hedera mirror node |
| 链上数据 | The Graph live Subgraph，固定 deployment 与 final block |
| 付费服务 | x402 + Blocky402；Bazantic Gateway/Recipe 作为组合工作流入口 |
| Agent / 验证器 | TypeScript，共享 canonicalization 和 verification core |
| 前端 | Vite + React + viem EIP-1193 wallet client；loopback-only Demo controller |

---

## 7. 目标赛道

赞助商总奖池不是本项目实际对应的子赛道奖池。提交时以具体子赛道为准。

| 赞助商 | 目标子赛道 | 对应奖池 | RECON 的承重实现 | 当前状态 |
|---|---|---:|---|---|
| Hedera | AI & Agentic Payments on Hedera | $6,000 | Blocky402 结算的 x402 服务、真实付费请求、HTS/PolicyVault、HCS 支付审计 | Gate 0 待验证 |
| The Graph | Best AI Tooling or AI Use Case（From Scratch） | $5,000 | live Graph 数据参与 agent 决策，并作为可重放证据 | Gate 0 待验证 |
| Bazantic | Best Recipe using Sponsor APIs；Agentify a new API | $1,000 + $1,000 | Gateway + Recipe 串联 The Graph 与新接入的 RECON 验证 API | Gate 0 待验证 |

三个赞助商中，与当前实现直接相关的子赛道奖池最多为 **$13,000**。若只能选择一个 Bazantic 子赛道，则按完成度优先选择 Sponsor API Recipe，对应合计为 $12,000。Hedera、The Graph、Bazantic 的赞助商总池合计 $33,000，但不能作为本项目直接对应奖池宣传。

---

## 8. 威胁模型

| 攻击者 / 故障 | 手段 | 当前防护 | 剩余信任或限制 |
|---|---|---|---|
| Agent | 超预算、向非白名单地址付款、过期执行 | PolicyVault 执行前拒绝 | 仅保护 vault 内资产 |
| Agent | 绕过 vault 转移金库资产 | agent 无 owner/withdraw 权限 | agent 自有账户行为不在审计范围 |
| Agent | 伪造 Graph 查询结果 | 固定区块重放并比较 canonical hash | subgraph 历史数据必须可用 |
| Agent | 漏报成功动作 | vault 成功事件与 claimed 集合求差 | 仅覆盖指定 vault |
| Agent | 先执行、后编理由 | proposal hash、执行事件和 HCS 顺序关联 | 不证明内部思考过程 |
| Verifier | 恶意罚没 | 事件公开保存 evidenceHash | Demo 版仍需信任 verifier |
| 调用者 | 伪造低价触发止损 | P2 必须校验签名和 freshness | MVP 不启用自动止损 |
| 前端 | 隐藏红旗 | 独立 CLI 和公开证据 | 依赖公共节点和 Graph provider 可用性 |
| 外部服务 | 超时或历史数据被裁剪 | `UNVERIFIABLE` 状态和录制备份 | 不把不可验证误判为作弊 |

---

## 9. 里程碑（北京时间，截止 9/14 00:00）

| 日期 | 里程碑 | 必须交付 |
|---|---|---|
| 9/9 | M0 风险清零 | Hedera/Graph/x402 核心 spike；评估独立 Bazantic Gate；代码进入 repo |
| 9/10 | M1 单场景闭环 | 单资产 PolicyVault、Graph 查询、HCS 证据、agent 一次真实动作 |
| 9/11 | M2 可验证闭环 | 冻结预部署 Vault；把已跑通的 live 脚本提取为可复用函数；固定最小 Demo API 契约 |
| 9/12 上午 | M3 用户可用闭环 | Web 读取真实 mandate、启动异步 Agent run、显示真实验证报告和原始证据链接 |
| 9/12 下午 | M4 处置与提交物 | Web 作弊裁决、owner kill-switch、拒绝结果；README、架构图、赛道证据清单与 3-4 分钟预录 |
| 9/13 20:00 | M5 提交 | 完成平台提交，保留 4 小时缓冲；不再增加功能 |

砍功能顺序：F10 -> F9 -> F8 -> 非必要 UI。F1-F7 只保留本文定义的单场景范围。

---

## 10. 风险与预案

| 风险 | 概率 | 影响 | 预案 |
|---|---|---|---|
| Blocky402 与 Bazantic 不能复用同一网关 | 高 | 两个赛道集成重复 | 同一验证 API 提供两个薄适配器；9/9 完成兼容性判断 |
| HTS precompile 转账不稳定 | 中 | PolicyVault 关键路径阻塞 | 降级为 HBAR 单资产，明确展示其他 Hedera 承重能力 |
| Graph 历史响应无法重放 | 中 | 核心证据失效 | 固定 deployment + final block hash；选择保留历史状态的数据源 |
| verifier 权限被质疑 | 高 | “自动罚没”叙事失真 | 主动展示信任模型，称为 verifier-mediated slashing |
| 外部网络导致 Demo 超时 | 中 | 视频流程中断 | 预先录制真实交易；UI 显示明确 pending/unverifiable；不得用缓存冒充实时赛道调用 |
| 浏览器钱包网络或签名错误 | 中 | 用户无法完成 kill-switch | 启动前检测 EIP-1193 provider、chain ID 和 owner 地址；拒签保持 Vault Active 并允许重试 |
| Demo 控制器泄漏服务密钥或被滥用 | 高 | 资金与证据真实性受损 | 只监听 loopback、校验 Origin、固定 vault/amount/recipient、单 job 锁和幂等；不公开部署写操作端点 |
| 长运行或页面刷新丢失状态 | 中 | Demo 中断且用户无法判断结果 | POST 立即返回 correlation ID；轮询状态；完成记录可从 HCS/mirror node 按 ID 恢复 |
| 开发时间不足 | 高 | 无完整闭环 | 使用单资产、单查询、单动作、单作弊案例；不做止损和自建 subgraph |

---

## 11. 提交自查清单

- [ ] public repo 有持续、可解释的提交历史。
- [ ] README 写明 setup、架构、支付流、可信边界和 AI 使用范围。
- [ ] 合约地址、topic ID、Graph deployment 和 Blocky402 付款均可访问；仅在申报 Bazantic 时要求 Recipe 与账户证据。
- [ ] 合约在 HashScan 可查；关键外部调用有真实结果。
- [ ] CLI 可独立重验一个正常 correlation ID 和一个作弊 correlation ID。
- [ ] Web 主入口不默认加载 fixture；用户不打开终端即可打开真实预部署 mandate、运行、对账和处置。
- [ ] 浏览器 bundle、网络响应和日志均不包含 owner、agent、operator、verifier 或 HCS 私钥及 x402 签名支付载荷。
- [ ] 3-4 分钟视频从全新浏览器会话出发，以用户身份覆盖委托、正常动作、三方对账、作弊标红、罚没、kill-switch 和赛道证据。
- [ ] 若申报 Bazantic，提交包含账号标识、真实 Recipe 和完整录屏；否则从视频与奖项选择中删除。
- [ ] 9/13 20:00 前完成提交。
