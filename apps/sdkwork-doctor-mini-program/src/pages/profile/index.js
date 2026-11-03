// Me tab: patient files (create / switch / edit / delete), the family doctor
// summary, the visit-record entry, the conversation mode, and the device check.
// Copy comes from the generated care catalog.
const { careText } = require('../../lib/i18n.js');
const { createCareAgent } = require('../../lib/agent.js');
const {
  PATIENT_BLOOD_TYPES,
  PATIENT_PROFILE_LIMIT,
  PATIENT_RELATIONS,
  PATIENT_SEXES,
  patientProfileCompleteness,
  splitProfileField,
} = require('../../lib/patient-profiles.js');
const {
  CATALOG_DOCTOR_ROSTER,
  doctorInitial,
  isDoctorEmploymentType,
  primaryAffiliation,
  resolveDoctorAvatarSrc,
  resolvePrimaryDoctor,
} = require('../../lib/doctors.js');

function profileLabel(profile) {
  return careText('platform.care.profile.relation.' + profile.relation) + ' · ' + profile.displayName;
}

function employmentLabel(employmentType) {
  return isDoctorEmploymentType(employmentType)
    ? careText('platform.care.doctors.employment.' + employmentType)
    : '';
}

function emptyForm() {
  return {
    displayName: '',
    relationIndex: 0,
    sexIndex: 2,
    birthYear: String(new Date().getFullYear() - 30),
    bloodTypeIndex: 0,
    allergies: '',
    chronicConditions: '',
    medications: '',
    notes: '',
  };
}

Page({
  data: {
    title: '',
    subtitle: '',
    patientsTitle: '',
    patientsSubtitle: '',
    addLabel: '',
    emptyLabel: '',
    limitLabel: '',
    currentLabel: '',
    activeLabel: '',
    activeName: '',
    selectLabel: '',
    editLabel: '',
    deleteLabel: '',
    saveLabel: '',
    cancelLabel: '',
    fieldName: '',
    fieldRelation: '',
    fieldBirthYear: '',
    fieldSex: '',
    fieldBloodType: '',
    fieldAllergies: '',
    fieldConditions: '',
    fieldMedications: '',
    fieldNotes: '',
    relationLabels: [],
    sexLabels: [],
    bloodTypeLabels: [],
    patients: [],
    formOpen: false,
    formTitle: '',
    formError: '',
    form: emptyForm(),
    doctorsTitle: '',
    doctorsHint: '',
    doctorEmpty: '',
    doctorName: '',
    doctorSite: '',
    doctorEmployment: '',
    employmentTitle: '',
    doctorCount: '',
    primaryLabel: '',
    chooseDoctorsLabel: '',
    recordsTitle: '',
    recordsCount: '',
    recordsOpenLabel: '',
    modeTitle: '',
    modeLabel: '',
    deviceTitle: '',
    deviceHint: '',
    deviceStatus: '',
    rerunLabel: '',
    runningLabel: '',
    checking: false,
    privacy: '',
  },

  onLoad() {
    const app = getApp();
    this.store = app.globalData.patients;
    this.editingId = '';
    this.setData({
      title: careText('platform.care.me.title'),
      subtitle: careText('platform.care.me.subtitle'),
      patientsTitle: careText('platform.care.me.patients'),
      patientsSubtitle: careText('platform.care.profile.subtitle'),
      addLabel: careText('platform.care.profile.add'),
      emptyLabel: careText('platform.care.profile.empty'),
      limitLabel: careText('platform.care.profile.limit', { count: String(PATIENT_PROFILE_LIMIT) }),
      currentLabel: careText('platform.care.profile.current'),
      activeLabel: careText('platform.care.active'),
      selectLabel: careText('platform.care.profile.select'),
      editLabel: careText('platform.care.profile.edit'),
      deleteLabel: careText('platform.care.profile.delete'),
      saveLabel: careText('platform.care.profile.save'),
      cancelLabel: careText('platform.care.profile.cancel'),
      fieldName: careText('platform.care.profile.field.name'),
      fieldRelation: careText('platform.care.profile.field.relation'),
      fieldBirthYear: careText('platform.care.profile.field.birthYear'),
      fieldSex: careText('platform.care.profile.field.sex'),
      fieldBloodType: careText('platform.care.profile.field.bloodType'),
      fieldAllergies: careText('platform.care.profile.field.allergies'),
      fieldConditions: careText('platform.care.profile.field.conditions'),
      fieldMedications: careText('platform.care.profile.field.medications'),
      fieldNotes: careText('platform.care.profile.field.notes'),
      relationLabels: PATIENT_RELATIONS.map(
        (relation) => careText('platform.care.profile.relation.' + relation),
      ),
      sexLabels: PATIENT_SEXES.map((sex) => careText('platform.care.profile.sex.' + sex)),
      bloodTypeLabels: [careText('platform.care.value.none')].concat(PATIENT_BLOOD_TYPES),
      doctorsTitle: careText('platform.care.me.doctors'),
      doctorsHint: careText('platform.care.doctors.chooseHint'),
      doctorEmpty: careText('platform.care.me.noDoctor'),
      employmentTitle: careText('platform.care.doctors.employment.label'),
      primaryLabel: careText('platform.care.doctors.primary'),
      chooseDoctorsLabel: careText('platform.care.doctors.choose'),
      recordsTitle: careText('platform.care.me.records'),
      recordsOpenLabel: careText('platform.care.records.title'),
      modeTitle: careText('platform.care.me.mode'),
      deviceTitle: careText('platform.care.me.device'),
      deviceHint: careText('platform.care.me.deviceHint'),
      rerunLabel: careText('platform.care.me.rerun'),
      runningLabel: careText('platform.care.me.running'),
      privacy: careText('platform.care.privacy.local'),
      modeLabel: careText(
        createCareAgent(app.globalData.careAgentOptions).mode === 'hosted'
          ? 'platform.care.mode.hosted'
          : 'platform.care.mode.offline',
      ),
    });
    this.render();
    this.runChecks();
  },

  onShow() {
    this.render();
  },

  render() {
    const app = getApp();
    const active = this.store ? this.store.getActive() : null;
    const profiles = this.store ? this.store.list() : [];
    const selection = app.globalData.doctors
      ? app.globalData.doctors.state()
      : { selectedIds: [], primaryId: null };
    const roster = app.globalData.doctorRoster || CATALOG_DOCTOR_ROSTER;
    const primary = resolvePrimaryDoctor(roster, selection);
    const primarySite = primary ? primaryAffiliation(primary) : null;
    const records = app.globalData.records ? app.globalData.records.list() : [];
    this.setData({
      patients: profiles.map((profile) => ({
        id: profile.id,
        label: profileLabel(profile),
        active: Boolean(active && active.id === profile.id),
        completeness: careText('platform.care.profile.completeness', {
          percent: String(patientProfileCompleteness(profile)),
        }),
      })),
      activeName: active ? profileLabel(active) : careText('platform.care.profile.empty'),
      doctorEmpty: careText('platform.care.me.noDoctor'),
      doctorAvatar: primary && primary.avatarUrl ? resolveDoctorAvatarSrc(primary.avatarUrl) : '',
      doctorInitial: primary ? doctorInitial(primary.displayName) : '',
      doctorName: primary
        ? primary.displayName + (primarySite && primarySite.department ? ' · ' + primarySite.department : '')
        : '',
      doctorSite: primarySite
        ? primarySite.hospitalName + (primarySite.title ? ' · ' + primarySite.title : '')
        : '',
      doctorEmployment: primarySite ? employmentLabel(primarySite.employmentType) : '',
      doctorCount: careText('platform.care.doctors.count', {
        count: String(selection.selectedIds.length),
      }),
      recordsCount: careText('platform.care.me.recordsCount', { count: String(records.length) }),
    });
  },

  onSelectPatient(event) {
    const id = event && event.currentTarget ? event.currentTarget.dataset.id : '';
    if (!this.store || !id) return;
    this.store.select(id);
    this.render();
  },

  onAddPatient() {
    if (!this.store) return;
    if (this.store.list().length >= PATIENT_PROFILE_LIMIT) {
      this.setData({ formError: this.data.limitLabel });
      return;
    }
    this.editingId = '';
    this.setData({
      formOpen: true,
      formTitle: this.data.addLabel,
      formError: '',
      form: emptyForm(),
    });
  },

  onEditPatient(event) {
    const id = event && event.currentTarget ? event.currentTarget.dataset.id : '';
    const profile = this.store ? this.store.list().filter((entry) => entry.id === id)[0] : null;
    if (!profile) return;
    this.editingId = profile.id;
    const relationIndex = PATIENT_RELATIONS.indexOf(profile.relation);
    const sexIndex = PATIENT_SEXES.indexOf(profile.sex);
    const bloodTypeIndex = profile.bloodType ? PATIENT_BLOOD_TYPES.indexOf(profile.bloodType) + 1 : 0;
    this.setData({
      formOpen: true,
      formTitle: this.data.editLabel,
      formError: '',
      form: {
        displayName: profile.displayName,
        relationIndex: relationIndex >= 0 ? relationIndex : 0,
        sexIndex: sexIndex >= 0 ? sexIndex : 2,
        birthYear: String(profile.birthYear),
        bloodTypeIndex: bloodTypeIndex >= 0 ? bloodTypeIndex : 0,
        allergies: profile.allergies.join(', '),
        chronicConditions: profile.chronicConditions.join(', '),
        medications: profile.medications.join(', '),
        notes: profile.notes || '',
      },
    });
  },

  onDeletePatient(event) {
    const id = event && event.currentTarget ? event.currentTarget.dataset.id : '';
    if (!this.store || !id) return;
    try {
      wx.showModal({
        title: this.data.deleteLabel,
        content: careText('platform.care.profile.deleteConfirm'),
        confirmText: this.data.deleteLabel,
        cancelText: this.data.cancelLabel,
        success: (result) => {
          if (!result.confirm) return;
          this.store.remove(id);
          if (this.editingId === id) this.setData({ formOpen: false, formError: '' });
          this.render();
        },
      });
    } catch (error) {
      // A host without dialogs keeps the file untouched.
    }
  },

  onCancelForm() {
    this.editingId = '';
    this.setData({ formOpen: false, formError: '' });
  },

  onFieldInput(event) {
    const field = event && event.currentTarget ? event.currentTarget.dataset.field : '';
    if (!field) return;
    const patch = {};
    patch['form.' + field] = event.detail.value;
    this.setData(patch);
  },

  onRelationChange(event) {
    this.setData({ 'form.relationIndex': Number(event.detail.value) || 0 });
  },

  onSexChange(event) {
    this.setData({ 'form.sexIndex': Number(event.detail.value) || 0 });
  },

  onBloodTypeChange(event) {
    this.setData({ 'form.bloodTypeIndex': Number(event.detail.value) || 0 });
  },

  onSavePatient() {
    if (!this.store) return;
    const form = this.data.form;
    const displayName = String(form.displayName || '').trim();
    if (!displayName) {
      this.setData({ formError: careText('platform.care.profile.required.name') });
      return;
    }
    const birthYear = Number(form.birthYear);
    const maxYear = new Date().getFullYear();
    if (!Number.isInteger(birthYear) || birthYear < 1900 || birthYear > maxYear) {
      this.setData({ formError: careText('platform.care.profile.invalid.birthYear') });
      return;
    }
    const input = {
      displayName: displayName,
      relation: PATIENT_RELATIONS[form.relationIndex] || 'other',
      birthYear: birthYear,
      sex: PATIENT_SEXES[form.sexIndex] || 'unspecified',
      bloodType: form.bloodTypeIndex > 0 ? PATIENT_BLOOD_TYPES[form.bloodTypeIndex - 1] : '',
      allergies: splitProfileField(form.allergies),
      chronicConditions: splitProfileField(form.chronicConditions),
      medications: splitProfileField(form.medications),
      notes: form.notes,
    };
    try {
      if (this.editingId) {
        this.store.update(this.editingId, input);
      } else {
        this.store.add(input);
      }
      this.editingId = '';
      this.setData({ formOpen: false, formError: '' });
      this.render();
    } catch (error) {
      this.setData({
        formError: careText('platform.care.profile.failed', {
          message: (error && error.message) || String(error),
        }),
      });
    }
  },

  onOpenDoctors() {
    try {
      wx.switchTab({ url: '/pages/doctor/index' });
    } catch (error) {
      // The doctor tab remains reachable from the tab bar.
    }
  },

  onOpenRecords() {
    try {
      wx.switchTab({ url: '/pages/records/index' });
    } catch (error) {
      // The records tab remains reachable from the tab bar.
    }
  },

  runChecks() {
    let available = false;
    try {
      if (typeof wx !== 'undefined' && typeof wx.getSystemInfoSync === 'function') {
        wx.getSystemInfoSync();
        available = true;
      }
      if (available && typeof wx.getStorageInfoSync === 'function') {
        wx.getStorageInfoSync();
      }
    } catch (error) {
      available = false;
    }
    this.setData({
      checking: false,
      deviceStatus: careText(available ? 'platform.care.available' : 'platform.care.value.unknown'),
    });
  },

  onRerunChecks() {
    this.setData({ checking: true });
    this.runChecks();
  },
});
