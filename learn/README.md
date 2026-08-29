# witr 学习与技术研究资料库

本目录（`learn/`）存放针对 **witr (Why Is This Running?)** 项目的深度技术报告与架构解析文档。

## 📑 文档索引

- [**witr 深度解析与实现原理报告 (`witr_architecture_and_implementation_report.md`)**](./witr_architecture_and_implementation_report.md)
  - **第 1 章：项目背景与核心价值** —— 传统运维工具瓶颈与 "Everything as a Process Question" 因果溯源理念
  - **第 2 章：总体架构设计与核心数据流** —— 从 CLI/TUI 到 Target 解析、Proc 祖先追踪、Source 仲裁、Warnings 告警、Output 渲染的完整流水线
  - **第 3 章：核心数据模型定义** —— `Process`、`Source`、`Result`、`ContainerMatch` 等核心领域模型
  - **第 4 章：核心模块深度剖析与实现原理** —— 详尽剖析 target、proc、source、pipeline、output、tui 以及基于 `native-ai-ui` 的全新 **Web UI (`witr web`)** 模块代码机制
  - **第 5 章：四大操作系统跨平台实现矩阵** —— Linux、macOS、Windows、FreeBSD 底层实现对比
  - **第 6 章：关键工程亮点与设计模式** —— 零外部重依赖、终端安全防转义注入、自适应刷新、退出码体系
  - **第 7 章：总结与学习借鉴价值** —— 系统编程与 CLI 架构的最佳实践启示

## 🚀 Web UI 快速启动

```bash
# 启动 Web UI 并在浏览器中打开 (http://127.0.0.1:7070)
witr web

# 指定自定义端口启动
witr web --port 8080
```

