import { enUS } from './en-US/platform/diagnostics/checks';
import { zhCN } from './zh-CN/platform/diagnostics/checks';

export type DoctorCommonDiagnosticsMessageKey = keyof typeof enUS;

export const doctorCommonDiagnosticsI18n = Object.freeze({
  'en-US': enUS,
  'zh-CN': zhCN,
});

export { enUS as doctorCommonDiagnosticsEnUS, zhCN as doctorCommonDiagnosticsZhCN };
