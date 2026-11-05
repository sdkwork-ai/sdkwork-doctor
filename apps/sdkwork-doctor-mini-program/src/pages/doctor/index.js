// Doctor tab: the AI family-doctor status, the family's human doctors, and the
// deployment doctor directory. A doctor is a person with one or more practice
// affiliations; the list shows the primary site and the consult form lets the
// family pick the site for the consultation. Copy comes from the generated care
// catalog; the roster falls back to the authored catalog when no directory is
// configured.
const { careText } = require('../../lib/i18n.js');
const { createCareAgent } = require('../../lib/agent.js');
const { createVisitRecord } = require('../../lib/visit-records.js');
const {
  CATALOG_DOCTOR_ROSTER,
  DOCTOR_SELECTION_LIMIT,
  createDoctorDirectoryPort,
  doctorRecordLabel,
  doctorInitial,
  preferredDoctorChannel,
  primaryAffiliation,
  resolveDoctorAvatarSrc,
  resolvePrimaryDoctor,
  resolveSelectedDoctors,
} = require('../../lib/doctors.js');

function channelLabel(channel) {
  return channel ? careText('platform.care.doctors.channel.' + channel.kind) : '';
}

function patientLabel(profile) {
  return careText('platform.care.profile.relation.' + profile.relation) + ' · ' + profile.displayName;
}

function employmentLabel(employmentType) {
  return careText('platform.care.doctors.employment.' + employmentType);
}

function availabilityLine(affiliation) {
  if (!affiliation) return '';
  return affiliation.availability
    .map((slot) => careText('platform.care.doctors.weekday.' + slot.weekday) + ' ' + slot.startTime + '-' + slot.endTime)
    .join(' · ');
}

function siteLabel(affiliation) {
  if (!affiliation) return '';
  return [affiliation.hospitalName, affiliation.department, affiliation.title]
    .filter((part) => Boolean(part))
    .join(' · ');
}

Page({
  data: {
    title: '',
    subtitle: '',
    aiTitle: '',
    aiStatus: '',
    aiHint: '',
    mineTitle: '',
    mineEmpty: '',
    mine: [],
    primaryLabel: '',
    setPrimaryLabel: '',
    clearLabel: '',
    countLabel: '',
    limitLabel: '',
    chooseTitle: '',
    chooseHint: '',
    sourceLabel: '',
    loadingLabel: '',
    emptyLabel: '',
    selectLabel: '',
    selectedLabel: '',
    consultLabel: '',
    verifiedLabel: '',
    unverifiedLabel: '',
    acceptingLabel: '',
    notAcceptingLabel: '',
    specialtiesLabel: '',
    languagesLabel: '',
    availabilityLabel: '',
    employmentTitle: '',
    affiliationsTitle: '',
    affiliationsHint: '',
    chooseAffiliationLabel: '',
    organizationLabel: '',
    hospitalCodeLabel: '',
    loading: true,
    doctors: [],
    consultOpen: false,
    consultDoctorId: '',
    consultDoctorName: '',
    consultAffiliationIndex: 0,
    consultAffiliationLabels: [],
    consultAffiliationLabel: '',
    consultAffiliationsHint: '',
    consultOrganization: '',
    consultHospitalCode: '',
    consultSince: '',
    consultEmployment: '',
    consultChannelLabel: '',
    consultHint: '',
    consultReason: '',
    consultReasonLabel: '',
    consultStatus: '',
    consultError: '',
    consultHasChannel: false,
    consultHasPatient: false,
    noChannelLabel: '',
    noPatientLabel: '',
    cancelLabel: '',
    consultReady: false,
  },

  onLoad() {
    const app = getApp();
    this.setData({
      title: careText('platform.care.doctors.title'),
      subtitle: careText('platform.care.doctors.subtitle'),
      aiTitle: careText('platform.care.doctors.ai'),
      aiHint: careText('platform.care.doctors.aiHint'),
      mineTitle: careText('platform.care.doctors.mine'),
      mineEmpty: careText('platform.care.doctors.none'),
      primaryLabel: careText('platform.care.doctors.primary'),
      setPrimaryLabel: careText('platform.care.doctors.setPrimary'),
      clearLabel: careText('platform.care.doctors.clear'),
      limitLabel: careText('platform.care.doctors.limit', { count: String(DOCTOR_SELECTION_LIMIT) }),
      chooseTitle: careText('platform.care.doctors.directory'),
      chooseHint: careText('platform.care.doctors.chooseHint'),
      loadingLabel: careText('platform.care.doctors.loading'),
      emptyLabel: careText('platform.care.doctors.empty'),
      selectLabel: careText('platform.care.doctors.select'),
      selectedLabel: careText('platform.care.doctors.selected'),
      consultLabel: careText('platform.care.doctors.consult'),
      verifiedLabel: careText('platform.care.doctors.verified'),
      unverifiedLabel: careText('platform.care.doctors.unverified'),
      acceptingLabel: careText('platform.care.doctors.accepting'),
      notAcceptingLabel: careText('platform.care.doctors.notAccepting'),
      specialtiesLabel: careText('platform.care.doctors.specialties'),
      languagesLabel: careText('platform.care.doctors.languages'),
      availabilityLabel: careText('platform.care.doctors.availability'),
      employmentTitle: careText('platform.care.doctors.employment.label'),
      affiliationsTitle: careText('platform.care.doctors.affiliations'),
      affiliationsHint: careText('platform.care.doctors.affiliationsHint'),
      chooseAffiliationLabel: careText('platform.care.doctors.chooseAffiliation'),
      organizationLabel: careText('platform.care.doctors.organization'),
      hospitalCodeLabel: careText('platform.care.doctors.hospitalCode'),
      consultReasonLabel: careText('platform.care.doctors.consultReason'),
      noChannelLabel: careText('platform.care.doctors.noChannel'),
      noPatientLabel: careText('platform.care.chat.noPatient'),
      cancelLabel: careText('platform.care.profile.cancel'),
    });
    this.agent = createCareAgent(app.globalData.careAgentOptions);
    this.setData({
      aiStatus: careText(
        this.agent.mode === 'hosted'
          ? 'platform.care.doctors.aiHosted'
          : 'platform.care.doctors.aiOffline',
      ),
    });
    this.selection = app.globalData.doctors;
    this.roster = CATALOG_DOCTOR_ROSTER;
    this.render();
    if (this.selection && typeof this.selection.subscribe === 'function') {
      this.unsubscribe = this.selection.subscribe(() => this.render());
    }
    this.port = createDoctorDirectoryPort({ directoryUrl: app.globalData.careDoctorDirectoryUrl });
    this.setData({ loading: true });
    this.port.load().then((roster) => {
      this.roster = roster;
      app.globalData.doctorRoster = roster;
      if (this.selection) this.selection.prune(roster.doctors.map((doctor) => doctor.id));
      this.setData({ loading: false });
      this.render();
    });
  },

  onShow() {
    this.render();
    if (this.data.consultOpen) this.refreshConsultReady();
  },

  onUnload() {
    if (this.unsubscribe) this.unsubscribe();
    this.unsubscribe = null;
  },

  findDoctor(id) {
    const doctors = (this.roster && this.roster.doctors) || [];
    return doctors.filter((doctor) => doctor.id === id)[0] || null;
  },

  currentAffiliation() {
    const doctor = this.findDoctor(this.data.consultDoctorId);
    if (!doctor) return null;
    return doctor.affiliations[this.data.consultAffiliationIndex] || primaryAffiliation(doctor);
  },

  refreshConsultReady() {
    const patients = getApp().globalData.patients;
    const active = patients ? patients.getActive() : null;
    this.setData({
      consultHasPatient: Boolean(active),
      consultReady: Boolean(active),
    });
  },

  render() {
    const roster = this.roster || CATALOG_DOCTOR_ROSTER;
    const selection = this.selection ? this.selection.state() : { selectedIds: [], primaryId: null };
    const primary = resolvePrimaryDoctor(roster, selection);
    const selected = resolveSelectedDoctors(roster, selection);
    const consultDoctor = this.data.consultOpen ? this.findDoctor(this.data.consultDoctorId) : null;
    const consultSite = consultDoctor
      ? (consultDoctor.affiliations[this.data.consultAffiliationIndex] || primaryAffiliation(consultDoctor))
      : null;
    this.setData({
      sourceLabel: careText(
        roster.source === 'directory'
          ? 'platform.care.doctors.source.directory'
          : 'platform.care.doctors.source.catalog',
      ),
      countLabel: careText('platform.care.doctors.count', { count: String(selected.length) }),
      mine: selected.map((doctor) => {
        const site = primaryAffiliation(doctor);
        return {
          id: doctor.id,
          name: doctor.displayName,
          avatar: doctor.avatarUrl ? resolveDoctorAvatarSrc(doctor.avatarUrl) : '',
          initial: doctorInitial(doctor.displayName),
          site: site ? site.hospitalName + ' · ' + site.department : '',
          primary: Boolean(primary && primary.id === doctor.id),
          primaryLabel: careText('platform.care.doctors.primary'),
          setPrimaryLabel: careText('platform.care.doctors.setPrimary'),
        };
      }),
      primaryLabel: careText('platform.care.doctors.primary'),
      doctors: roster.doctors.map((doctor) => {
        const site = primaryAffiliation(doctor);
        const channel = preferredDoctorChannel(site);
        return {
          id: doctor.id,
          name: doctor.displayName,
          avatar: doctor.avatarUrl ? resolveDoctorAvatarSrc(doctor.avatarUrl) : '',
          initial: doctorInitial(doctor.displayName),
          rank: site ? site.title : '',
          department: site ? site.department : '',
          hospital: site ? site.hospitalName : '',
          employment: site ? employmentLabel(site.employmentType) : '',
          specialties: doctor.specialties.join(' · '),
          languages: doctor.languages.join(' · '),
          experience: careText('platform.care.doctors.experience', { count: String(doctor.yearsOfExperience) }),
          availability: availabilityLine(site),
          otherAffiliations: site && doctor.affiliations.length > 1
            ? careText('platform.care.doctors.otherAffiliations', {
              count: String(doctor.affiliations.length - 1),
            })
            : '',
          verified: doctor.verified,
          verifiedLabel: careText(
            doctor.verified
              ? 'platform.care.doctors.verified'
              : 'platform.care.doctors.unverified',
          ),
          accepting: Boolean(site && site.acceptingNewPatients),
          acceptingLabel: careText(
            site && site.acceptingNewPatients
              ? 'platform.care.doctors.accepting'
              : 'platform.care.doctors.notAccepting',
          ),
          selected: selection.selectedIds.indexOf(doctor.id) >= 0,
          primary: Boolean(primary && primary.id === doctor.id),
          hasChannel: Boolean(channel),
          channelLabel: channelLabel(channel),
        };
      }),
      consultHint: consultSite && preferredDoctorChannel(consultSite)
        ? careText('platform.care.doctors.consultHint', {
          doctor: consultDoctor.displayName,
          channel: channelLabel(preferredDoctorChannel(consultSite)),
        })
        : '',
    });
  },

  onToggleDoctor(event) {
    const id = event && event.currentTarget ? event.currentTarget.dataset.id : '';
    if (!this.selection || !id) return;
    const state = this.selection.state();
    if (state.selectedIds.indexOf(id) < 0 && state.selectedIds.length >= DOCTOR_SELECTION_LIMIT) {
      this.toast(this.data.limitLabel);
      return;
    }
    this.selection.toggle(id);
    this.render();
  },

  onSetPrimary(event) {
    const id = event && event.currentTarget ? event.currentTarget.dataset.id : '';
    if (!this.selection || !id) return;
    this.selection.setPrimary(id);
    this.render();
  },

  onClearSelection() {
    if (!this.selection) return;
    try {
      wx.showModal({
        title: careText('platform.care.doctors.mine'),
        content: careText('platform.care.doctors.clearConfirm'),
        confirmText: this.data.clearLabel,
        cancelText: careText('platform.care.profile.cancel'),
        success: (result) => {
          if (!result.confirm) return;
          this.selection.clear();
          this.render();
        },
      });
    } catch (error) {
      // A host without dialogs keeps the selection untouched.
    }
  },

  onOpenConsult(event) {
    const id = event && event.currentTarget ? event.currentTarget.dataset.id : '';
    const doctor = this.findDoctor(id);
    if (!doctor) return;
    const site = primaryAffiliation(doctor);
    const index = doctor.affiliations.indexOf(site);
    this.openConsultAt(doctor, index < 0 ? 0 : index, true);
  },

  onAffiliationChange(event) {
    const doctor = this.findDoctor(this.data.consultDoctorId);
    if (!doctor) return;
    const index = Number(event.detail.value) || 0;
    this.openConsultAt(doctor, index, false);
  },

  openConsultAt(doctor, index, resetReason) {
    const site = doctor.affiliations[index] || primaryAffiliation(doctor);
    const channel = preferredDoctorChannel(site);
    const patients = getApp().globalData.patients;
    const active = patients ? patients.getActive() : null;
    const patch = {
      consultOpen: true,
      consultDoctorId: doctor.id,
      consultDoctorName: doctor.displayName,
      consultAffiliationIndex: doctor.affiliations.indexOf(site),
      consultAffiliationLabels: doctor.affiliations.map(siteLabel),
      consultAffiliationLabel: siteLabel(site),
      consultAffiliationsHint: doctor.affiliations.length > 1 ? this.data.affiliationsHint : '',
      consultOrganization: site ? site.organizationId : '',
      consultHospitalCode: site ? site.hospitalCode : '',
      consultSince: site && site.since
        ? careText('platform.care.doctors.since', { since: site.since })
        : '',
      consultEmployment: site ? employmentLabel(site.employmentType) : '',
      consultChannelLabel: channelLabel(channel),
      consultHasChannel: Boolean(channel),
      consultHasPatient: Boolean(active),
      consultReady: Boolean(active),
      consultStatus: '',
      consultError: '',
    };
    if (resetReason) patch.consultReason = '';
    this.setData(patch);
    this.render();
  },

  onCancelConsult() {
    this.setData({
      consultOpen: false,
      consultDoctorId: '',
      consultStatus: '',
      consultError: '',
    });
  },

  onReasonInput(event) {
    this.setData({ consultReason: event.detail.value });
  },

  onSubmitConsult() {
    if (!this.data.consultOpen) return;
    const doctor = this.findDoctor(this.data.consultDoctorId);
    if (!doctor) return;
    const site = this.currentAffiliation();
    if (!site) {
      this.toast(this.data.noChannelLabel);
      return;
    }
    const reason = (this.data.consultReason || '').trim();
    if (!reason) {
      this.setData({ consultError: careText('platform.care.doctors.consultReasonRequired') });
      return;
    }
    const app = getApp();
    const patients = app.globalData.patients;
    const active = patients ? patients.getActive() : null;
    if (!active) {
      this.setData({ consultHasPatient: false });
      this.toast(this.data.noPatientLabel);
      return;
    }
    const advice = careText('platform.care.doctors.consultStarted', { doctor: doctor.displayName });
    const store = app.globalData.records;
    try {
      // The consultation is a conversation: open the session addressed to this
      // doctor, then land on the conversation home with that session open.
      if (app.globalData.humanConsultations) {
        const session = app.globalData.humanConsultations.start({
          doctor: {
            id: doctor.id,
            displayName: doctor.displayName,
            department: site.department,
            hospitalName: site.hospitalName,
            organizationId: site.organizationId,
            employmentType: site.employmentType,
          },
          memberLabel: patientLabel(active),
          reason: reason,
        });
        app.globalData.openHumanConsultationId = session.id;
      }
      if (store) {
        store.add(createVisitRecord({
          member: active,
          symptom: reason,
          advice: advice,
          level: 'routine',
          mode: 'human',
          doctorId: doctor.id,
          doctorLabel: doctorRecordLabel(doctor, site),
          doctorOrganizationId: site.organizationId,
          doctorHospitalLabel: site.hospitalName,
          doctorEmploymentType: site.employmentType,
        }));
      }
      this.setData({
        consultStatus: advice,
        consultError: '',
        consultReason: '',
        consultOpen: false,
      });
      this.toast(advice);
      try {
        wx.switchTab({ url: '/pages/conversation/index' });
      } catch (error) {
        // A host without the tab bar keeps the status text.
      }
    } catch (error) {
      this.setData({
        consultError: careText('platform.care.doctors.consultFailed', {
          message: (error && error.message) || String(error),
        }),
      });
    }
  },

  toast(title) {
    try {
      wx.showToast({ title: title, icon: 'none' });
    } catch (error) {
      // Toast is decoration; the inline status text still carries the result.
    }
  },
});
