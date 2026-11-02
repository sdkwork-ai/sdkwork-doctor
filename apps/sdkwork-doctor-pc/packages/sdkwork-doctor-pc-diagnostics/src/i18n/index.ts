import { enUS } from './en-US/platform/diagnostics/ui';
import { zhCN } from './zh-CN/platform/diagnostics/ui';

export type DoctorPcDiagnosticsMessageKey = keyof typeof enUS;

export const doctorPcDiagnosticsI18n = Object.freeze({ 'en-US': enUS, 'zh-CN': zhCN });
