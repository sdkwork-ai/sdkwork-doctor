// Authored mini program shell: locale selection and the shared care-agent options.
const { detectLocale, setLocale } = require('./lib/i18n.js');
const { readAgentsApiBaseUrl, getAccessToken } = require('./lib/runtime-config.js');
const { createVisitRecordStore } = require('./lib/visit-records.js');

App({
  globalData: {
    locale: 'zh-CN',
    member: {
      id: 'member-self',
      displayName: 'Me',
      relation: 'self',
      birthYear: 1990,
      allergies: [],
      chronicConditions: [],
      medications: [],
    },
    careAgentOptions: null,
    records: null,
  },
  onLaunch() {
    this.globalData.locale = setLocale(detectLocale());
    this.globalData.careAgentOptions = {
      agentsApiBaseUrl: readAgentsApiBaseUrl(),
      getAccessToken,
      entrySurface: 'mini_program',
    };
    this.globalData.records = createVisitRecordStore();
  },
});
