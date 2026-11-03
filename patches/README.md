> **2026-11-04 起本目录停用。** 方向改为把 dsh-im 的 qq / weixin 两块收编进 `dsh-life-chat`，不再依赖、也不再补丁 `@xmanrui/dsh-im`。这里的补丁与 `scripts/build-dsh-im.mjs` 保留作历史记录，不要在实现里引用；收编清单见 `不入库/管线规划.md` §8.2。

# patches/

这里放我们对 `@xmanrui/dsh-im` 的改动。**改动属于 dsh-life-pipline，不属于上游。**

## 为什么不是「直接在我们仓库里改」

宿主加载的是 `~/.dsh/profiles/<profile>/node_modules/@xmanrui/dsh-im/lib/index.js`——
那是上游源码经 esbuild 打出来的单文件产物。代码写到我们自己的 `src/` 里不会被执行，
所以差异必须最终落进那个包。补丁的作用是让这件事**可复现、可跟版本、可见**：

- 每个补丁对应一个具体版本（见文件名里的版本号），升级时重打，冲突就是提示。
- 工作台（上游克隆）是**可丢弃**的：删掉它，`scripts/build-dsh-im.mjs` 能从 tag 重来。
- 上游收了这个改动，补丁就可以退役。

## 流程

1. `node scripts/build-dsh-im.mjs --fetch` 拉取指定 tag 的工作台（默认放在 `不入库/.work/dsh-im-<tag>`）。
2. 依次应用本目录的 `.patch`。
3. 用工作台自带的 `npm install && npm run build` 产出 `lib/`。
4. 把构建产物装进 profile 的 `node_modules/@xmanrui/dsh-im`，记下版本与产物哈希。

## 补丁清单

| 文件 | 内容 |
|---|---|
| `0001-shared-external-inbound-consumers.patch` | 新增共享的 `ExclusiveInboundConsumers` 租约注册表与统一事件结构 `textEvidence()`，供 QQ/微信 复用（飞书先有的那份保持不动） |
