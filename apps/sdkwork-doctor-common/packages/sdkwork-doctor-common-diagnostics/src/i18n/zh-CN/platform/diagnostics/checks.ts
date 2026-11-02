import type { enUS } from '../../../en-US/platform/diagnostics/checks';

export const zhCN: Record<keyof typeof enUS, string> = {
  'platform.diagnostics.check.runtimeProfile.title': '运行时配置档',
  'platform.diagnostics.check.runtimeProfile.description': '客户端构建 SDK 之前必须解析出唯一的部署档位与生命周期环境。',
  'platform.diagnostics.check.runtimeProfile.ok': '运行时配置档一致。',
  'platform.diagnostics.check.runtimeProfile.unknownEnvironment': '未知的生命周期环境：{{environment}}。',
  'platform.diagnostics.check.runtimeProfile.profileMismatch': '配置档标识与所选部署档位、环境不匹配。',

  'platform.diagnostics.check.browserCapabilities.title': '浏览器能力',
  'platform.diagnostics.check.browserCapabilities.description': '渲染器启动前必须具备必要的 Web API。',
  'platform.diagnostics.check.browserCapabilities.ok': '必要的浏览器能力均已具备。',
  'platform.diagnostics.check.browserCapabilities.missing': '浏览器缺少必要能力：{{capabilities}}。',
  'platform.diagnostics.check.browserCapabilities.skipped': '当前运行环境没有浏览器窗口。',

  'platform.diagnostics.check.secureContext.title': '安全上下文',
  'platform.diagnostics.check.secureContext.description': '剪贴板、crypto.subtle、Service Worker 等浏览器能力要求安全上下文。',
  'platform.diagnostics.check.secureContext.ok': '页面运行于安全上下文。',
  'platform.diagnostics.check.secureContext.insecure': '页面不在安全上下文中。',
  'platform.diagnostics.check.secureContext.skipped': '当前运行环境没有浏览器窗口。',

  'platform.diagnostics.check.storage.title': '本地持久化',
  'platform.diagnostics.check.storage.description': '检查 localStorage 能否完成一次读写往返；会话与缓存依赖它。',
  'platform.diagnostics.check.storage.ok': 'localStorage 读写往返成功。',
  'platform.diagnostics.check.storage.roundTripMismatch': 'localStorage 写入成功但读回的值不一致。',
  'platform.diagnostics.check.storage.blocked': 'localStorage 被阻止或已写满：{{reason}}。',
  'platform.diagnostics.check.storage.skipped': '当前运行环境不提供 localStorage。',

  'platform.diagnostics.check.locale.title': '语言元数据',
  'platform.diagnostics.check.locale.description': '校验文档语言与协商出的浏览器语言是否一致。',
  'platform.diagnostics.check.locale.ok': '语言元数据一致（{{language}}）。',
  'platform.diagnostics.check.locale.missingDocumentLanguage': '文档元素未声明语言。',
  'platform.diagnostics.check.locale.mismatch': '文档语言与浏览器语言不一致。',
  'platform.diagnostics.check.locale.skipped': '当前运行环境没有文档对象。',

  'platform.diagnostics.check.clock.title': '时钟与时区',
  'platform.diagnostics.check.clock.description': '正确的本地时钟与可用的 Intl 时区数据决定令牌过期与审计时间戳是否可靠。',
  'platform.diagnostics.check.clock.ok': '时钟正常（时区 {{timeZone}}）。',
  'platform.diagnostics.check.clock.invalid': '运行时时钟返回了非法日期。',
  'platform.diagnostics.check.clock.stale': '设备时钟明显偏旧（年份 {{year}}）。',
  'platform.diagnostics.check.clock.timeZoneUnavailable': '时区数据不可用。',

  'platform.diagnostics.check.apiSurface.title': 'API 基础地址',
  'platform.diagnostics.check.apiSurface.description': '构造任何 SDK 客户端之前，浏览器必须解析出同源或云端 API 基础地址。',
  'platform.diagnostics.check.apiSurface.ok': 'API 基础地址已配置。',
  'platform.diagnostics.check.apiSurface.notConfigured': '当前客户端未配置 API 基础地址。',
  'platform.diagnostics.check.apiSurface.plainHttp': '存在使用明文 HTTP 的非回环 API 地址。',

  'platform.diagnostics.check.connectivity.title': '运行时文档可达性',
  'platform.diagnostics.check.connectivity.description': '同源 runtime-env 文档必须可达，部署后基础地址才能生效。',
  'platform.diagnostics.check.connectivity.ok': '运行时文档返回 HTTP {{status}}。',
  'platform.diagnostics.check.connectivity.notServed': '运行时文档未被提供（HTTP {{status}}）。',
  'platform.diagnostics.check.connectivity.offline': '浏览器报告当前处于离线状态。',
  'platform.diagnostics.check.connectivity.requestFailed': '运行时文档请求失败。',
  'platform.diagnostics.check.connectivity.skipped': '当前运行环境不提供浏览器 fetch。',

  'platform.diagnostics.runner.failed': '检查未能完成。',

  'platform.diagnostics.hint.environments': '请使用 development、test、staging、demo 或 production。',
  'platform.diagnostics.hint.browserCapabilities': '请使用较新的常青浏览器；不支持陈旧内核。',
  'platform.diagnostics.hint.secureContext': '通过 HTTPS 提供页面，开发环境可使用 localhost。',
  'platform.diagnostics.hint.storage': '退出无痕模式，或允许该源使用站点数据。',
  'platform.diagnostics.hint.locale': '在首屏渲染前依据解析出的语言设置 <html lang="...">。',
  'platform.diagnostics.hint.clock': '同步操作系统时钟；时钟偏移会导致令牌校验与缓存新鲜度失效。',
  'platform.diagnostics.hint.apiSurface': '部署 runtime-env 文档，或为该配置档设置 Vite 环境变量。',
  'platform.diagnostics.hint.apiSurfacePlainHttp': '所有非回环 API 源都应使用 HTTPS。',
  'platform.diagnostics.hint.runtimeDocument': 'Vite 的 runtime-env 插件在开发期提供 /runtime-env.json，并在构建时输出该文档。',
};
