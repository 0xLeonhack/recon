# RECON - AI Agent 委托对账协议（项目简介 / 展示用）

> ETHOnline 2026
> 目标子赛道：Hedera AI & Agentic Payments ($6k) + The Graph AI Use Case / From Scratch ($5k) + Bazantic Sponsor API Recipe / Agentify a new API（各 $1k）
> 一人队伍，全程 AI 辅助开发并在提交中披露

---

## 一句话

**所有人都在给 agent 设置权限，RECON 验证这些权限和 agent 的声明是否真的对得上。**

RECON 自动核对 agent「声称做了什么 / 实际做了什么 / 委托允许什么」，把不一致变成任何人都能重验的证据。

---

## 问题

当用户把资金委托给 agent 后，仅有额度、白名单或 session key 仍不能回答：

1. 约束是否在每次执行时真正生效？
2. agent 是否漏报了实际发生的动作？
3. agent 声称使用的数据能否被第三方复验？

RECON 的产品本体是委托对账，不是另一个 agent 钱包。

---

## 产品

| 对账栏 | 内容 | 证据 |
|---|---|---|
| Claimed | agent 声称查询、付款和执行的内容 | HCS 消息与 hash |
| Actual | PolicyVault 实际执行的动作 | Hedera 交易和合约事件 |
| Allowed | 动作发生时有效的委托约束 | PolicyVault 状态 |

三栏不一致时，验证器显示 MISMATCH，生成 evidenceHash。黑客松版本由明确标识的受信任 verifier 执行罚没或冻结。

### 可信边界

- PolicyVault 在链上强制总预算、收款方白名单和期限。
- The Graph 查询固定 deployment、最终区块、query/variables 和规范化响应 hash。
- HCS 证明消息内容、HCS 内部顺序和共识时间，不证明 agent 的内部推理。
- agent 持有只用于鉴权和 gas 的受限 signer，不持有金库 owner/admin 密钥。
- Demo 版罚没由 verifier 裁决；无许可欺诈证明和可信 oracle 止损属于路线图。

---

## Demo 三幕

1. **设置委托**：创建单资产金库，设置总预算、收款方白名单和截止时间。
2. **正常执行**：agent 查询 live Graph 数据，购买一次 Hedera x402 验证服务，提交动作；PolicyVault 执行后，HCS 用同一个 correlation ID 串联查询、支付、提案和交易。
3. **对账与作弊**：网页或 CLI 重放证据，正常流程全部 VERIFIED；作弊模式伪造 response hash，结果变为 MISMATCH，verifier 随后提交带相同 evidence hash 的罚没交易。

最后触发 kill-switch，并展示后续 agent 动作被合约拒绝。

---

## 目标子赛道

| 子赛道 | RECON 的承重实现 | 必须展示 |
|---|---|---|
| Hedera AI & Agentic Payments ($6k) | Blocky402 结算的 x402 验证服务、PolicyVault、HCS 支付审计 | 真实托管服务、真实付费请求、Hedera 测试网结算 |
| The Graph AI Use Case / From Scratch ($5k) | live Graph 数据参与 agent 决策和后续重放 | provider 调用、固定 deployment/block、可运行复验命令 |
| Bazantic Sponsor API Recipe / Agentify a new API（各 $1k） | Gateway + Recipe 串联 The Graph 和新接入的 RECON API | 两个服务共同决定最终动作、完整录屏、Bazantic 用户名 |

三家赞助商中，与当前实现直接相关的子赛道奖池最多为 **$13,000**；若只能选择一个 Bazantic 子赛道，则为 $12,000。三家赞助商总池虽为 $33,000，但不是本项目直接对应的可竞争奖池。

---

## 差异化

1. 策略由合约执行，不依赖 agent 开发者的自觉。
2. 审计同时覆盖声明、实际行为和委托边界。
3. Graph 数据不仅用于决策，也用于第三方重放验证。
4. HCS、PolicyVault 和 x402 支付共同形成一条可展示的证据链。
5. 项目主动展示作弊路径和剩余信任，不把 Demo 版 verifier 包装成完全无需信任的协议。

---

## 提交口径

- 本系统证明可重放的数据声明、付款与链上动作，以及 HCS 消息顺序。
- 本系统不证明 agent 的内部推理，也不审计 agent 自有账户的全部行为。
- 外部服务不可用时显示 UNVERIFIABLE，不把它误判为通过或作弊。
- 视频控制在 3-4 分钟，完整展示 live 数据、真实付款、对账和作弊检测。
