allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

// `file_picker` 8.3.7 still declares `compileSdkVersion 34` in its own Android
// module, while the resolved `flutter_plugin_android_lifecycle` requires every
// consumer to compile against API 36. Compile that one plugin module against 36
// so `checkDebugAarMetadata` passes; remove this block once `file_picker` is
// upgraded to a release that declares 36 itself.
subprojects {
    if (name == "file_picker") {
        afterEvaluate {
            (extensions.findByName("android") as? com.android.build.gradle.BaseExtension)
                ?.compileSdkVersion(36)
        }
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
subprojects {
    project.evaluationDependsOn(":app")
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
