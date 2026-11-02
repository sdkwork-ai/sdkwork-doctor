// Authored mini program shell: locale selection, the shared care-agent options,
// the household's patient files, and the family's doctor selection.
const { detectLocale, setLocale } = require('./lib/i18n.js');
const { readAgentsApiBaseUrl, readCareDoctorDirectoryUrl, getAccessToken } = require('./lib/runtime-config.js');
const { createVisitRecordStore } = require('./lib/visit-records.js');
const { createPatientProfileStore } = require('./lib/patient-profiles.js');
const { createDoctorSelectionStore, CATALOG_DOCTOR_ROSTER } = require('./lib/doctors.js');

App({
  globalData: {
    locale: 'zh-CN',
    careAgentOptions: null,
    careDoctorDirectoryUrl: '',
    doctorRoster: CATALOG_DOCTOR_ROSTER,
    records: null,
    patients: null,
    doctors: null,
  },
  onLaunch() {
    this.globalData.locale = setLocale(detectLocale());
    this.globalData.careAgentOptions = {
      agentsApiBaseUrl: readAgentsApiBaseUrl(),
      getAccessToken,
      entrySurface: 'mini_program',
    };
    this.globalData.careDoctorDirectoryUrl = readCareDoctorDirectoryUrl();
    this.globalData.records = createVisitRecordStore();
    this.globalData.patients = createPatientProfileStore();
    this.globalData.doctors = createDoctorSelectionStore();
  },
});
