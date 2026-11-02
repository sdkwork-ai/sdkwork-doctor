import { enUS } from './en-US/platform/diagnostics/shell';
import { zhCN } from './zh-CN/platform/diagnostics/shell';

export type DoctorPcShellMessageKey = keyof typeof enUS;

export const doctorPcShellI18n = Object.freeze({ 'en-US': enUS, 'zh-CN': zhCN });
