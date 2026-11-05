/// Attachment picking for the Flutter conversation.
///
/// The picker copies a chosen file into the application documents directory so
/// the 病历 can still open it after a restart, then returns the metadata row the
/// record persists. Widgets depend on [CareAttachmentPicker], never on a plugin
/// class, so tests and other hosts can inject a fake
/// (`FLUTTER_APP_MOBILE_ARCHITECTURE_SPEC.md` sections 5 and 7).
library;

import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';

import '../records/medical_record_store.dart';

/// Where the composer's "+" popup takes the attachment from.
///
/// The three sources are the three choices the popup offers: a photo captured
/// now, the photo/video library, or the file browser. They stay one enum so
/// every client names the same three actions and a host can inject a fake for
/// any of them.
enum CareAttachmentSource {
  /// The device camera; one photo captured for this conversation.
  camera,

  /// The photo/video library; any number of images and videos.
  media,

  /// The file browser; any file the conversation accepts.
  files,
}

/// File chooser port of the conversation surface.
abstract interface class CareAttachmentPicker {
  /// Copies the files the patient chose from [source] into this device.
  ///
  /// Returns an empty list when the patient cancelled the picker.
  Future<List<MedicalAttachment>> pick(CareAttachmentSource source);
}

/// Files the patient chose, or an empty list when the picker was cancelled.
class FilePickerCareAttachmentPicker implements CareAttachmentPicker {
  const FilePickerCareAttachmentPicker();

  /// Longest edge of a captured photo, and its JPEG quality. A phone photo is
  /// 12–48 MP; the conversation only needs enough detail to read a report.
  static const double _captureMaxEdge = 2048;
  static const int _captureQuality = 85;

  static const Map<String, String> _mimeByExtension = <String, String>{
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'heic': 'image/heic',
    'mp4': 'video/mp4',
    'mov': 'video/quicktime',
    'm4v': 'video/x-m4v',
    'webm': 'video/webm',
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx':
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'txt': 'text/plain',
    'csv': 'text/csv',
  };

  static String _extension(String name) {
    final int dot = name.lastIndexOf('.');
    return dot <= 0 ? '' : name.substring(dot).toLowerCase();
  }

  static String _mime(String name) {
    final String extension = _extension(name).replaceFirst('.', '');
    return _mimeByExtension[extension] ?? 'application/octet-stream';
  }

  @override
  Future<List<MedicalAttachment>> pick(CareAttachmentSource source) {
    switch (source) {
      case CareAttachmentSource.camera:
        return _capturePhoto();
      case CareAttachmentSource.media:
        return _pickFiles(FileType.media);
      case CareAttachmentSource.files:
        return _pickFiles(FileType.any);
    }
  }

  /// Captures one photo through the system camera.
  ///
  /// `image_picker` asks for the camera permission the manifest already
  /// declares, then hands back a file in the cache directory; it is copied into
  /// the attachment directory like every other picked file so the 病历 keeps
  /// working after a restart.
  Future<List<MedicalAttachment>> _capturePhoto() async {
    final XFile? photo = await ImagePicker().pickImage(
      source: ImageSource.camera,
      maxWidth: _captureMaxEdge,
      maxHeight: _captureMaxEdge,
      imageQuality: _captureQuality,
    );
    if (photo == null) {
      return const <MedicalAttachment>[];
    }
    final String name = photo.name.trim().isEmpty ? 'photo.jpg' : photo.name;
    final int sizeBytes = await photo.length();
    final MedicalAttachment? attachment = await _store(
      sourcePath: photo.path,
      name: name,
      sizeBytes: sizeBytes,
    );
    return attachment == null
        ? const <MedicalAttachment>[]
        : <MedicalAttachment>[attachment];
  }

  Future<List<MedicalAttachment>> _pickFiles(FileType type) async {
    final FilePickerResult? result = await FilePicker.platform.pickFiles(
      allowMultiple: true,
      type: type,
      withData: false,
    );
    if (result == null || result.files.isEmpty) {
      return const <MedicalAttachment>[];
    }
    final List<MedicalAttachment> attachments = <MedicalAttachment>[];
    for (final PlatformFile file in result.files) {
      final String? sourcePath = file.path;
      if (sourcePath == null || sourcePath.isEmpty) {
        continue;
      }
      final MedicalAttachment? attachment = await _store(
        sourcePath: sourcePath,
        name: file.name,
        sizeBytes: file.size,
      );
      if (attachment != null) {
        attachments.add(attachment);
      }
    }
    return attachments;
  }

  /// Copies [sourcePath] into the attachment directory and describes it.
  ///
  /// Returns null when the copy fails: one unreadable file must not lose the
  /// files that were readable in the same pick.
  Future<MedicalAttachment?> _store({
    required String sourcePath,
    required String name,
    required int sizeBytes,
  }) async {
    final Directory documents = await getApplicationDocumentsDirectory();
    final Directory target = Directory(
      '${documents.path}${Platform.pathSeparator}care-attachments',
    );
    if (!await target.exists()) {
      await target.create(recursive: true);
    }
    final String id =
        'attachment-${DateTime.now().microsecondsSinceEpoch}-${_storeCounter++}';
    final String destination =
        '${target.path}${Platform.pathSeparator}$id${_extension(name)}';
    try {
      await File(sourcePath).copy(destination);
    } on FileSystemException {
      return null;
    }
    return createMedicalAttachment(
      name: name,
      mimeType: _mime(name),
      sizeBytes: sizeBytes,
      path: destination,
    );
  }

  /// Disambiguates two files copied inside the same microsecond.
  static int _storeCounter = 0;
}

/// Human-readable size for an attachment row.
String careAttachmentSize(int bytes) {
  if (bytes <= 0) return '0 B';
  if (bytes < 1024) return '$bytes B';
  if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
  return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
}
