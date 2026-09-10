---
name: codebase-design
description: 在真实需求和因果责任已经清楚后设计或改进 module interface。用于消除错误抽象、重复 owner 和下游补偿，决定 seam，或让复杂行为在一个小 interface 后形成 leverage 与 locality。
---

# Codebase Design

使用 module、interface、seam、adapter、depth、leverage 与 locality 提高设计精度，不把它们当作固定模板或必须采用的项目语言。Interface 包含调用方为正确使用 module 必须知道的不变量、顺序、错误与性能语义；depth 表示较少的调用方知识获得较完整的行为。

从真实行为和责任推导结构。沿数据与控制路径找到状态第一次可能出错的可控位置，先考虑删除需求、复用能力或恢复现有 owner，再决定是否增加 layer。边界由状态、身份、生命周期、失败、恢复和真实变化共同塑造；仅为测试方便不构成生产 seam。

好的形状减少调用方共同维护的知识与非法状态，使变化和验证集中在拥有职责的位置。模型可以自由探索不同组织方式，并按总系统复杂度选择，不需要逐项完成设计清单。

测试通过稳定 surface 观察职责，但不替产品选择结构。复杂依赖改变边界判断时读取 [DEEPENING.md](DEEPENING.md)；多个实质不同的 interface 都有现实可能时读取 [DESIGN-IT-TWICE.md](DESIGN-IT-TWICE.md)。
