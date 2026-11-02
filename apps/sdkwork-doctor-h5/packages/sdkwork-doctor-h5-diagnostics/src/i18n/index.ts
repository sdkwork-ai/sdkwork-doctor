import { enUS } from './en-US/platform/diagnostics/ui';
import { zhCN } from './zh-CN/platform/diagnostics/ui';

export type DoctorH5DiagnosticsMessageKey = keyof typeof enUS;

export const doctorH5DiagnosticsI18n = Object.freeze({ 'en-US': enUS, 'zh-CN': zhCN });
