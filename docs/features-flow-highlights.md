# RECON - 功能、流程与演示重点

> 配合 project-brief.md 使用。本文只保留已经进入 v1.3 PRD 的功能与讲稿口径。

---

## 主要功能

| # | 功能 | 一句话 |
|---|---|---|
| 1 | 用户工作台 | 用户在 Web 打开真实预部署委托，完成运行、验证和处置，不依赖终端 |
| 2 | 单资产策略金库 | Web 从链上读取真实部署与注资状态；合约在执行时检查总预算、白名单和截止时间 |
| 3 | 受限执行 agent | agent 有 gas 与受限 signer，但没有 owner/admin 权限，不能绕过 vault 动用金库资产 |
| 4 | 三方自动对账 | 同屏比较 claimed / actual / allowed，不一致时给出明确原因和原始证据 |
| 5 | 独立重放验证 | 固定 Graph deployment 和最终区块，Web 与 CLI 复用同一个验证核心 |
| 6 | 作弊检测与裁决罚没 | 伪造 response hash 会被标红，受信任 verifier 使用相同 evidence hash 发起 Demo 版罚没 |
| 7 | 付费验证与冻结 | agent 程序化购买 Hedera x402 验证服务；委托人用钱包触发 kill-switch |

自动价格止损、自建 subgraph 和 Agent Kit 插件均为 P2，不进入基础 Demo。

---

## 使用流程

```text
1. Connect
   浏览器钱包 -> Hedera testnet (chain ID 296)
   -> 确认连接地址是预部署 Vault owner
   -> Web 确认服务状态

2. Open live mandate
   Web 从 Hedera testnet 读取预部署 PolicyVault
   -> 展示总预算、白名单收款方、截止时间与固定角色
   -> 展示 principal 与 operator stake
   -> 展示部署、注资和 stake 的真实交易链接

3. Run
   用户点击 Run Agent
   -> The Graph live query
   -> 固定 deployment、最终区块、query/variables、response hash
   -> 服务端程序化购买一次 Blocky402 / Hedera x402 验证服务
   -> 根据两个服务的结果生成确定性动作参数
   -> PolicyVault 检查并执行
   -> HCS 用 correlation ID 关联全部证据

4. Verify
   Web 读取 HCS、mirror node、Graph 和付款证据
   -> claimed vs actual vs allowed
   -> VERIFIED / MISMATCH / UNVERIFIABLE / REJECTED / PENDING
   -> CLI 可对同一 correlation ID 独立复验

5. Respond
   adversarial run 只伪造 response hash -> MISMATCH
   -> 用户请求受信任 verifier 裁决
   -> verifier 独立复验后提交带 evidence hash 的罚没交易
   -> 用户钱包签署 kill-switch
   -> 后续 agent 动作被链上拒绝
```

---

## 演示重点

### 普通评委

“权限只能阻止违规动作；RECON 还能发现 agent 说的和做的是否一致。”

### 技术评委

- 查询证据固定到 Graph deployment 和最终区块。
- canonicalization 规则保证 response hash 可重复计算。
- proposal、付款、执行和 HCS 消息通过 correlation ID 关联。
- CLI 可脱离 RECON 后端运行。
- Demo 版 verifier 的信任边界被明确披露。

### 赞助商评委

- Hedera：真实 x402 付款、Blocky402 结算、PolicyVault、HCS 审计。
- The Graph：live 数据同时参与决策和重放验证。
- Bazantic：Gateway 与 Recipe 串联 The Graph 和新接入的 RECON API，同一实现覆盖 Sponsor API Recipe，并可兼顾 Agentify a new API。

---

## 3-4 分钟视频顺序

1. 15 秒：一句话问题；立即进入工作台，不展示 landing page。
2. 25 秒：从未连接状态开始，连接 owner 钱包；打开真实预部署 Vault，展示链上 mandate、principal、stake 与交易链接。
3. 55 秒：点击 Run Agent；页面实时走过 Graph 查询、x402 付款、vault 执行与 HCS 发布。
4. 30 秒：同一页面自动显示 VERIFIED 三栏对账、R1-R5 与真实证据链接。
5. 40 秒：启动 adversarial run；展示 forged hash 与重放 hash 不一致、状态变为 MISMATCH。
6. 35 秒：请求 verifier 裁决；展示相同 evidence hash、真实 slash 交易和 operator stake 变化。
7. 25 秒：用户钱包签署 kill-switch；下一次 agent 动作显示 REJECTED / NotActive。
8. 15 秒：用 CLI 重验同一 correlation ID，并收束已有真实赞助商证据；未完成的 Bazantic 不进入声明。

录制规则：所有主流程动作从 Web 发起；可剪去 testnet 等待时间，但不能用 fixture、预置成功状态或终端脚本替代交易。钱包弹窗、交易 hash、网络标识和关键状态变化必须入镜。

范围披露：Demo 使用一次性预部署并注资的 testnet Vault。用户自助创建 Vault、多租户账户系统和公网写操作 API 不在两日交付范围；这不改变运行、付款、验证和处置数据必须全部真实的要求。

---

## 禁止使用的过度表述

- “agent 完全不持钥”：应说不持有 vault owner/admin 密钥。
- “任何人都能无许可罚没”：Demo 版由受信任 verifier 裁决。
- “Graph 查询就是硬证明”：只有固定 deployment、最终区块和规范化规则后才可稳定重放。
- “HCS 给所有链上和链下事件做全局排序”：HCS 只保证 topic 消息自身的共识顺序。
- “本项目对应 $33k 奖池”：直接相关的子赛道奖池最多为 $13k；若 Bazantic 只能选一个子赛道则为 $12k。
