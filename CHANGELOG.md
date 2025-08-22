# Changelog

## [0.0.7] --2025-08-23
## Added
- 新增 sudo 用来分配权限给其他用户
- 新增 exec 用来运行 shell
- 新增 Plugin 监听函数，用来实现如 keyword 以及 sudo 等插件的主要监听部分
- Plugin 调整结构，处理命令行函数不再传入 NewMessageEvent，而是传入 Api.Message，需要调整下插件

## [0.0.6] -- 2025-08-15
## Added
- 新增 alias 重定向插件命令
- 新增 用 。 符号识别插件

## [0.0.5] -- 2025-08-15
## Added
- 新增 上传插件 .npm upload <Plugin>
- 新增 封装 converstation 用来与 bot 持续对话
- 添加 ytdl 依赖

## [0.0.4] -- 2025-08-14
### Fixed
- 修复无法强制更新问题

## [0.0.3] -- 2025-08-13
### Added
- 新增 npm_install，简单封装安装依赖功能，统一外部插件安装依赖方法
- 新增 远程安装插件以及删除插件功能

### Fixed
- 修复装相同插件缓存问题
- 完善 help 插件