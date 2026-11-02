# Component Spec Index

Machine contract: [component.spec.json](component.spec.json).

This module owns the diagnostics vocabulary and runner only. Platform adapters (browser facts, storage, locale, connectivity) live in the checks and receive everything through `DoctorRuntimeContext`.
