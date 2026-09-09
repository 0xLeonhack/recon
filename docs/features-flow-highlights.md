# RECON - 功能、流程与演示重点

> 配合 project-brief.md 使用。本文只保留已经进入 v1.1 PRD 的功能与讲稿口径。

---

## 主要功能

| # | 功能 | 一句话 |
|---|---|---|
| 1 | 单资产策略金库 | 用户将总预算、收款方白名单和截止时间写入合约，由合约在执行时检查 |
| 2 | 受限执行 agent | agent 有 gas 与受限 signer，但没有 owner/admin 权限，不能绕过 vault 动用金库资产 |
| 3 | 三方自动对账 | 同屏比较 claimed / actual / allowed，不一致时给出明确原因 |
| 4 | 独立重放验证 | 固定 Graph deployment 和最终区块，网页与 CLI 复用同一个验证核心 |
| 5 | 作弊检测与裁决罚没 | 伪造 response hash 会被标红，受信任 verifier 使用相同 evidence hash 发起 Demo 版罚没 |
| 6 | 付费验证与冻结 | agent 真实购买 Hedera x402 验证服务；委托人可用 kill-switch 冻结后续执行 |

自动价格止损、自建 subgraph 和 Agent Kit 插件均为 P2，不进入基础 Demo。

---

## 使用流程

```text
1. 设置委托
   创建单资产 PolicyVault
   -> 配置总预算、白名单收款方、截止时间
   -> 注入测试资产
   -> agent 获得受限执行身份

2. Agent 执行
   The Graph live query
   -> 固定 deployment、最终区块、query/variables、response hash
   -> 购买一次 Blocky402 / Hedera x402 验证服务
   -> 根据两个服务的结果生成确定性动作参数
   -> PolicyVault 检查并执行
   -> HCS 用 correlation ID 关联全部证据

3. 对账
   CLI 或网页读取 HCS、mirror node、Graph 和付款证据
   -> claimed vs actual vs allowed
   -> VERIFIED / MISMATCH / UNVERIFIABLE / REJECTED / PENDING

4. 处置
   正常记录 -> VERIFIED
   伪造 response hash -> MISMATCH
   verifier -> 带 evidence hash 的罚没交易
   owner -> kill-switch -> 后续动作被拒绝
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

1. 20 秒：问题与三栏对账。
2. 30 秒：创建单资产 mandate。
3. 60 秒：Graph 查询、x402 付款和 vault 执行。
4. 40 秒：正常记录独立验证为绿色。
5. 40 秒：作弊 hash 被标红，展示 mismatch 原因。
6. 30 秒：verifier 罚没与 owner kill-switch。
7. 20 秒：三个具体子赛道的证据链接。

---

## 禁止使用的过度表述

- “agent 完全不持钥”：应说不持有 vault owner/admin 密钥。
- “任何人都能无许可罚没”：Demo 版由受信任 verifier 裁决。
- “Graph 查询就是硬证明”：只有固定 deployment、最终区块和规范化规则后才可稳定重放。
- “HCS 给所有链上和链下事件做全局排序”：HCS 只保证 topic 消息自身的共识顺序。
- “本项目对应 $33k 奖池”：直接相关的子赛道奖池最多为 $13k；若 Bazantic 只能选一个子赛道则为 $12k。
