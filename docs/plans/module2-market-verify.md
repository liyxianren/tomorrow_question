# Module 2: 市场系统验证报告

**日期**: 2026-05-01
**修复**: `_normalize_market_submission` saleOrders None容错

## 验证矩阵

| 格式 | saleOrders | phase1Market | 结果 | 收入 |
|------|-----------|--------------|------|------|
| phase1Market only | 缺失 | ✅ | ✅ | domestic=9, overseas=6 |
| saleOrders only | ✅ | 缺失 | ⚠️ | 0 (旧路径不处理phase1_goods) |
| 混合 | ✅ | ✅ | ✅ | phase1Market主导 |
| 空 | 缺失 | 缺失 | ✅ | 0 |

## 关键发现
1. `phase1Market.domesticAllocation` → 国内出售数量
2. `phase1Market.externalAllocations[].marketId` → 海外区域
3. `phase1Market.externalAllocations[].quantity` → 海外出售数量
4. 定价基于supply-demand均衡模型，不是固定价格
5. saleOrders是旧multi-good市场系统，phase1使用统一商品系统

## 下一步
- 验证前端是否使用正确的phase1Market格式
- 测试军事系统（需先积累财政预算）
