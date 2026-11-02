import { enUS } from './en-US/platform/diagnostics/shell';
import { zhCN } from './zh-CN/platform/diagnostics/shell';

export type DoctorH5ShellMessageKey = keyof typeof enUS;

export const doctorH5ShellI18n = Object.freeze({ 'en-US': enUS, 'zh-CN': zhCN });
