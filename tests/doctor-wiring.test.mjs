import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
const directoryContract = JSON.parse(read('specs/doctor-directory.contract.json'));

test('every runtime-env example binds the doctor-directory key', () => {
  for (const surface of ['pc', 'h5']) {
    const dir = path.join(repoRoot, 'apps', 'sdkwork-doctor-' + surface, 'config', 'browser');
    const files = fs.readdirSync(dir).filter((name) => name.endsWith('.json'));
    assert.ok(files.length >= 10, surface + ' must keep every deployment profile');
    for (const name of files) {
      const document = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
      assert.equal(
        document[directoryContract.runtimeKey],
        '',
        surface + '/' + name + ' must declare ' + directoryContract.runtimeKey,
      );
    }
  }
});

test('the doctor-directory contract names the same fallback and storage keys the domain uses', () => {
  assert.equal(directoryContract.kind, 'sdkwork.doctor.doctor-directory-dependency');
  assert.equal(directoryContract.runtimeKey, 'careDoctorDirectoryUrl');
  assert.equal(directoryContract.document.kind, 'sdkwork.doctor.doctor-roster');
  assert.ok(fs.existsSync(path.join(repoRoot, directoryContract.fallback.document)), 'the fallback roster must exist');
  assert.equal(directoryContract.fallback.source, 'catalog');
  assert.equal(directoryContract.selection.storageKey, 'sdkwork.doctor.doctor-selection.v1');
  assert.equal(directoryContract.selection.limit, 5);
  for (const client of ['pc', 'h5', 'flutter', 'mini_program']) {
    assert.ok(directoryContract.clients[client], 'the contract must name the ' + client + ' port');
  }
});

test('both browser cores build the roster port, the selection store, and the agent catalogue', () => {
  for (const surface of ['pc', 'h5']) {
    const core = read('apps/sdkwork-doctor-' + surface + '/packages/sdkwork-doctor-' + surface + '-core/src/doctors/index.ts');
    assert.match(core, /createDoctor\w+DoctorDirectoryPort/u, surface);
    assert.match(core, /createDoctor\w+DoctorSelectionStore/u, surface);
    assert.match(core, /parseDoctorRoster/u, surface);
    assert.match(core, /CATALOG_DOCTOR_ROSTER/u, surface);
    assert.match(core, /DOCTOR_SELECTION_STORAGE_KEY/u, surface);
    assert.doesNotMatch(core, /Authorization|Bearer/u, surface + ' sends no credential to the directory');

    const patients = read('apps/sdkwork-doctor-' + surface + '/packages/sdkwork-doctor-' + surface + '-core/src/patients/index.ts');
    assert.match(patients, /PATIENT_PROFILES_STORAGE_KEY/u, surface);
    assert.match(patients, /createPatientProfileStore/u, surface);

    const agent = read('apps/sdkwork-doctor-' + surface + '/packages/sdkwork-doctor-' + surface + '-core/src/agent/index.ts');
    assert.match(agent, /createCareAgentCatalog/u, surface);
    assert.match(agent, /CareAgentCatalogPort/u, surface);
  }
});

test('the care packages expose the patient, doctor, and human-consultation actions', () => {
  for (const surface of ['pc', 'h5']) {
    const care = read('apps/sdkwork-doctor-' + surface + '/packages/sdkwork-doctor-' + surface + '-care/src/index.tsx');
    assert.match(care, /preferredDoctorChannel/u, surface);
    assert.match(care, /mode: 'human'/u, surface);
    assert.match(care, /selection\.toggle\(/u, surface);
    assert.match(care, /selection\.setPrimary\(/u, surface);
    assert.match(care, /selection\.prune\(/u, surface);
    assert.match(care, /platform\.care\.doctors\.source\.catalog/u, surface);
    assert.doesNotMatch(care, /\bfetch\(/u, surface + ' UI must not call fetch');
    assert.doesNotMatch(care, /careDoctorDirectoryUrl/u, surface + ' UI must not read runtime config');

    const patients = read('apps/sdkwork-doctor-' + surface + '/packages/sdkwork-doctor-' + surface + '-care/src/patients.tsx');
    assert.match(patients, /patients\.add\(/u, surface);
    assert.match(patients, /patients\.update\(/u, surface);
    assert.match(patients, /patients\.remove\(/u, surface);
    assert.match(patients, /patients\.select\(/u, surface);
    assert.match(patients, /PATIENT_PROFILE_LIMIT/u, surface);
  }
});

test('the browser shells load the roster once and pass it to both doctor surfaces', () => {
  for (const surface of ['pc', 'h5']) {
    const routes = read('apps/sdkwork-doctor-' + surface + '/packages/sdkwork-doctor-' + surface + '-shell/src/Doctor' + surface.toUpperCase() + 'Routes.tsx');
    assert.match(routes, /useDoctorRoster\(doctorDirectory\)/u, surface);
    assert.match(routes, /useCareAgentCatalog\(agentCatalog\)/u, surface);
    assert.match(routes, /<DoctorPage[\s\S]*roster=\{rosterState\.roster\}/u, surface);
    assert.match(routes, /<MePage[\s\S]*roster=\{rosterState\.roster\}/u, surface);
  }
});

test('the browser runtime keeps the doctor directory and patient stores out of UI packages', () => {
  for (const surface of ['pc', 'h5']) {
    const runtime = read('apps/sdkwork-doctor-' + surface + '/src/bootstrap/runtime.ts');
    assert.match(runtime, /createDoctor\w+DoctorDirectoryPort/u, surface);
    assert.match(runtime, /createDoctor\w+DoctorSelectionStore/u, surface);
    assert.match(runtime, /createDoctor\w+PatientProfileStore/u, surface);
    assert.match(runtime, /createDoctor\w+AgentCatalog/u, surface);
    assert.match(runtime, /careDoctorDirectoryUrl/u, surface);
  }
});
