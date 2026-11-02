import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../i18n/care_i18n.dart';
import '../patients/patient_store.dart';
import '../theme/doctor_theme.dart';

/// Create or edit one patient file.
///
/// Validation failures stay on the screen with the precise copy the catalog
/// carries; a saved profile returns to 我的 through the navigator.
class PatientEditorScreen extends StatefulWidget {
  const PatientEditorScreen({
    super.key,
    required this.locale,
    required this.patients,
    this.profile,
  });

  final String locale;
  final PatientProfileStore patients;

  /// Null creates a new file; a profile edits it in place.
  final PatientProfile? profile;

  @override
  State<PatientEditorScreen> createState() => _PatientEditorScreenState();
}

class _PatientEditorScreenState extends State<PatientEditorScreen> {
  late final TextEditingController _name;
  late final TextEditingController _birthYear;
  late final TextEditingController _bloodType;
  late final TextEditingController _allergies;
  late final TextEditingController _conditions;
  late final TextEditingController _medications;
  late final TextEditingController _notes;
  late PatientRelation _relation;
  late PatientSex _sex;
  String? _error;
  bool _saving = false;

  String get _locale => widget.locale;

  @override
  void initState() {
    super.initState();
    final PatientProfile? profile = widget.profile;
    final PatientProfileInput initial = profile == null
        ? const PatientProfileInput(
            displayName: '',
            relation: PatientRelation.self,
            birthYear: 0,
          )
        : PatientProfileInput.fromProfile(profile);
    _name = TextEditingController(text: initial.displayName);
    _birthYear = TextEditingController(
      text: profile == null ? '' : '${initial.birthYear}',
    );
    _bloodType = TextEditingController(text: initial.bloodType);
    _allergies = TextEditingController(text: initial.allergies.join(', '));
    _conditions =
        TextEditingController(text: initial.chronicConditions.join(', '));
    _medications = TextEditingController(text: initial.medications.join(', '));
    _notes = TextEditingController(text: initial.notes);
    _relation = initial.relation;
    _sex = initial.sex;
  }

  @override
  void dispose() {
    _name.dispose();
    _birthYear.dispose();
    _bloodType.dispose();
    _allergies.dispose();
    _conditions.dispose();
    _medications.dispose();
    _notes.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final String name = _name.text.trim();
    if (name.isEmpty) {
      setState(() => _error = careText(_locale, 'platform.care.profile.required.name'));
      return;
    }
    final int currentYear = DateTime.now().year;
    final int? birthYear = int.tryParse(_birthYear.text.trim());
    if (birthYear == null ||
        birthYear < kMinPatientBirthYear ||
        birthYear > currentYear) {
      setState(() =>
          _error = careText(_locale, 'platform.care.profile.invalid.birthYear'));
      return;
    }
    final PatientProfileInput input = PatientProfileInput(
      displayName: name,
      relation: _relation,
      birthYear: birthYear,
      sex: _sex,
      bloodType: _bloodType.text.trim(),
      allergies: splitProfileField(_allergies.text),
      chronicConditions: splitProfileField(_conditions.text),
      medications: splitProfileField(_medications.text),
      notes: _notes.text,
    );
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final PatientProfile? profile = widget.profile;
      if (profile == null) {
        await widget.patients.add(input);
      } else {
        await widget.patients.update(profile.id, input);
      }
      if (!mounted) return;
      Navigator.of(context).pop();
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = careText(
          _locale,
          'platform.care.profile.failed',
          params: <String, String>{'message': '$error'},
        );
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final bool editing = widget.profile != null;
    return Scaffold(
      appBar: AppBar(
        title: Text(careText(
          _locale,
          editing ? 'platform.care.profile.edit' : 'platform.care.profile.add',
        )),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: <Widget>[
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text(
                _error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ),
          TextField(
            controller: _name,
            decoration: InputDecoration(
              labelText: careText(_locale, 'platform.care.profile.field.name'),
            ),
          ),
          const SizedBox(height: 12),
          Text(
            careText(_locale, 'platform.care.profile.field.relation'),
            style: const TextStyle(fontSize: 12, color: kMuted),
          ),
          const SizedBox(height: 6),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: <Widget>[
              for (final PatientRelation relation in PatientRelation.values)
                ChoiceChip(
                  label: Text(careText(
                    _locale,
                    'platform.care.profile.relation.${relation.name}',
                  )),
                  selected: _relation == relation,
                  onSelected: (_) => setState(() => _relation = relation),
                ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            careText(_locale, 'platform.care.profile.field.sex'),
            style: const TextStyle(fontSize: 12, color: kMuted),
          ),
          const SizedBox(height: 6),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: <Widget>[
              for (final PatientSex sex in PatientSex.values)
                ChoiceChip(
                  label: Text(careText(
                    _locale,
                    'platform.care.profile.sex.${sex.name}',
                  )),
                  selected: _sex == sex,
                  onSelected: (_) => setState(() => _sex = sex),
                ),
            ],
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _birthYear,
            keyboardType: TextInputType.number,
            inputFormatters: <TextInputFormatter>[
              FilteringTextInputFormatter.digitsOnly,
            ],
            decoration: InputDecoration(
              labelText:
                  careText(_locale, 'platform.care.profile.field.birthYear'),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _bloodType,
            decoration: InputDecoration(
              labelText:
                  careText(_locale, 'platform.care.profile.field.bloodType'),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _allergies,
            decoration: InputDecoration(
              labelText:
                  careText(_locale, 'platform.care.profile.field.allergies'),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _conditions,
            decoration: InputDecoration(
              labelText:
                  careText(_locale, 'platform.care.profile.field.conditions'),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _medications,
            decoration: InputDecoration(
              labelText:
                  careText(_locale, 'platform.care.profile.field.medications'),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _notes,
            minLines: 1,
            maxLines: 3,
            decoration: InputDecoration(
              labelText: careText(_locale, 'platform.care.profile.field.notes'),
            ),
          ),
          const SizedBox(height: 16),
          Row(
            children: <Widget>[
              Expanded(
                child: FilledButton(
                  onPressed: _saving ? null : _save,
                  child: Text(
                      careText(_locale, 'platform.care.profile.save')),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: TextButton(
                  onPressed: () => Navigator.of(context).maybePop(),
                  child: Text(
                      careText(_locale, 'platform.care.profile.cancel')),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
