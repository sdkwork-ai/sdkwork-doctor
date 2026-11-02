import 'package:flutter/material.dart';
import 'triage.dart';

void main() => runApp(const DoctorApp());

class DoctorApp extends StatelessWidget {
  const DoctorApp({super.key});
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'SDKWork Doctor',
      theme: ThemeData(colorSchemeSeed: const Color(0xFF2563EB), useMaterial3: true),
      home: const DoctorHome(),
    );
  }
}

class DoctorHome extends StatefulWidget {
  const DoctorHome({super.key});
  @override
  State<DoctorHome> createState() => _DoctorHomeState();
}

class _DoctorHomeState extends State<DoctorHome> {
  int _index = 0;
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('SDKWork Doctor')),
      body: IndexedStack(index: _index, children: const <Widget>[ChatTab(), DoctorTab(), MeTab()]),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (int value) => setState(() => _index = value),
        destinations: const <NavigationDestination>[
          NavigationDestination(icon: Icon(Icons.chat_bubble_outline), label: '对话'),
          NavigationDestination(icon: Icon(Icons.medical_information_outlined), label: '医生'),
          NavigationDestination(icon: Icon(Icons.person_outline), label: '我的'),
        ],
      ),
    );
  }
}

class ChatTab extends StatefulWidget {
  const ChatTab({super.key});
  @override
  State<ChatTab> createState() => _ChatTabState();
}

class _ChatTabState extends State<ChatTab> {
  final List<Map<String, String>> _messages = <Map<String, String>>[];
  final TextEditingController _controller = TextEditingController();

  void _send() {
    final String text = _controller.text.trim();
    if (text.isEmpty) return;
    final TriageResult triage = triageSymptoms(text);
    final String reply = triage.level == TriageLevel.emergency
        ? 'Emergency red flag. Call local emergency services now.'
        : 'No red flag found. ${triage.actions.join(' ')}';
    setState(() {
      _messages.add(<String, String>{'role': 'you', 'text': text, 'level': triage.level.name});
      _messages.add(<String, String>{'role': 'doctor', 'text': reply, 'level': triage.level.name});
      _controller.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Column(children: <Widget>[
      Expanded(
        child: ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: _messages.length,
          itemBuilder: (BuildContext context, int index) {
            final Map<String, String> message = _messages[index];
            return Card(
              child: ListTile(
                title: Text(message['role'] == 'you' ? 'You' : 'Doctor'),
                subtitle: Text(message['text'] ?? ''),
                trailing: message['level'] == 'emergency' ? const Chip(label: Text('emergency')) : null,
              ),
            );
          },
        ),
      ),
      Padding(
        padding: const EdgeInsets.all(12),
        child: Row(children: <Widget>[
          Expanded(child: TextField(controller: _controller, decoration: const InputDecoration(hintText: 'Describe a symptom'))),
          const SizedBox(width: 8),
          FilledButton(onPressed: _send, child: const Text('Send')),
        ]),
      ),
    ]);
  }
}

class DoctorTab extends StatelessWidget {
  const DoctorTab({super.key});
  @override
  Widget build(BuildContext context) {
    return ListView(padding: const EdgeInsets.all(16), children: const <Widget>[
      Card(child: ListTile(title: Text('Health record'), subtitle: Text('Me (self)'))),
      Card(child: ListTile(title: Text('Allergies'), subtitle: Text('none recorded'))),
      Card(child: ListTile(title: Text('Conditions'), subtitle: Text('none recorded'))),
      Card(child: ListTile(title: Text('Medications'), subtitle: Text('none recorded'))),
    ]);
  }
}

class MeTab extends StatelessWidget {
  const MeTab({super.key});
  @override
  Widget build(BuildContext context) {
    return ListView(padding: const EdgeInsets.all(16), children: const <Widget>[
      Card(child: ListTile(title: Text('Me (self)'), subtitle: Text('Family member'), trailing: Chip(label: Text('active')))),
      Card(child: ListTile(title: Text('Privacy'), subtitle: Text('Diagnostics run on-device; health data never leaves this app.'))),
    ]);
  }
}
