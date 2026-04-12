package com.iptv.tauri.kotlin

import java.io.File
import javax.inject.Inject
import org.apache.tools.ant.taskdefs.condition.Os
import org.gradle.api.DefaultTask
import org.gradle.api.GradleException
import org.gradle.api.logging.LogLevel
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.TaskAction
import org.gradle.process.ExecOperations
import org.gradle.process.ExecResult

open class BuildTask @Inject constructor(
    private val execOperations: ExecOperations
) : DefaultTask() {
    @Input
    var rootDirRel: String? = null
    @Input
    var target: String? = null
    @Input
    var release: Boolean? = null

    @TaskAction
    fun assemble() {
        val target = target ?: throw GradleException("target cannot be null")
        val release = release ?: throw GradleException("release cannot be null")
        val rootDirRel = rootDirRel ?: throw GradleException("rootDirRel cannot be null")
        
        val rustTarget = when (target) {
            "armv7" -> "armv7-linux-androideabi"
            "aarch64" -> "aarch64-linux-android"
            "i686" -> "i686-linux-android"
            "x86_64" -> "x86_64-linux-android"
            else -> throw GradleException("Unknown target: $target")
        }
        
        val androidAbi = when (target) {
            "armv7" -> "armeabi-v7a"
            "aarch64" -> "arm64-v8a"
            "i686" -> "x86"
            "x86_64" -> "x86_64"
            else -> throw GradleException("Unknown target: $target")
        }
        
        val profile = if (release == true) "release" else "debug"
        val workingDir = File(project.projectDir, rootDirRel)
        val sourceFile = File(workingDir, "target/$rustTarget/$profile/libiptv_thunder_tauri_lib.so")
        val jniLibsDir = File(project.projectDir, "src/main/jniLibs/$androidAbi")
        val targetFile = File(jniLibsDir, "libiptv_thunder_tauri_lib.so")
        
        // Skip build if .so file already exists and is not empty
        if (targetFile.exists() && targetFile.length() > 0) {
            project.logger.lifecycle("Rust library already built at $targetFile, skipping build")
            return
        }
        
        // Build the library
        runCargoBuild()
        copySoFile()
    }
    
    fun copySoFile() {
        val target = target ?: throw GradleException("target cannot be null")
        val release = release ?: throw GradleException("release cannot be null")
        val rootDirRel = rootDirRel ?: throw GradleException("rootDirRel cannot be null")
        
        val rustTarget = when (target) {
            "armv7" -> "armv7-linux-androideabi"
            "aarch64" -> "aarch64-linux-android"
            "i686" -> "i686-linux-android"
            "x86_64" -> "x86_64-linux-android"
            else -> throw GradleException("Unknown target: $target")
        }
        
        val androidAbi = when (target) {
            "armv7" -> "armeabi-v7a"
            "aarch64" -> "arm64-v8a"
            "i686" -> "x86"
            "x86_64" -> "x86_64"
            else -> throw GradleException("Unknown target: $target")
        }
        
        val profile = if (release == true) "release" else "debug"
        val workingDir = File(project.projectDir, rootDirRel)
        val sourceFile = File(workingDir, "target/$rustTarget/$profile/libiptv_thunder_tauri_lib.so")
        val jniLibsDir = File(project.projectDir, "src/main/jniLibs/$androidAbi")
        
        if (!sourceFile.exists()) {
            project.logger.warn("Source .so file not found at $sourceFile, skipping copy")
            return
        }
        
        jniLibsDir.mkdirs()
        val targetFile = File(jniLibsDir, "libiptv_thunder_tauri_lib.so")
        
        sourceFile.copyTo(targetFile, overwrite = true)
        project.logger.lifecycle("Copied $sourceFile to $targetFile")
    }

    fun runTauriCli(executable: String) {
        val rootDirRel = rootDirRel ?: throw GradleException("rootDirRel cannot be null")
        val target = target ?: throw GradleException("target cannot be null")
        val release = release ?: throw GradleException("release cannot be null")
        
        // Use android build which works with NDK without WebSocket requirement
        val baseArgs = listOf("run", "--", "tauri", "android", "build", "--ci")

        val allArgs = baseArgs.toMutableList()
        allArgs.add("--target")
        allArgs.add(target)
        if (project.logger.isEnabled(LogLevel.DEBUG)) {
            allArgs.add("-vv")
        } else if (project.logger.isEnabled(LogLevel.INFO)) {
            allArgs.add("-v")
        }
        if (release == false) {
            allArgs.add("--debug")
        }

        val workingDir = File(project.projectDir, rootDirRel)
        val command = listOf(executable) + allArgs

        val result: ExecResult = execOperations.exec {
            this.workingDir = workingDir
            this.commandLine = command
            environment["TAURI_ANDROID_STUDIO_SCRIPT"] = "1"
            environment["CI"] = "true"
            environment["NDK_HOME"] = "C:\\Users\\rafal\\AppData\\Local\\Android\\Sdk\\ndk\\30.0.14904198"
            environment["ANDROID_NDK_HOME"] = "C:\\Users\\rafal\\AppData\\Local\\Android\\Sdk\\ndk\\30.0.14904198"
        }

        if (result.exitValue != 0) {
            throw GradleException("Tauri CLI failed with exit code ${result.exitValue}")
        }
    }

    fun runCargoBuild() {
        val rootDirRel = rootDirRel ?: throw GradleException("rootDirRel cannot be null")
        val target = target ?: throw GradleException("target cannot be null")
        val release = release ?: throw GradleException("release cannot be null")
        
        // Map target names to Rust triple targets
        val rustTarget = when (target) {
            "armv7" -> "armv7-linux-androideabi"
            "aarch64" -> "aarch64-linux-android"
            "i686" -> "i686-linux-android"
            "x86_64" -> "x86_64-linux-android"
            else -> throw GradleException("Unknown target: $target")
        }
        
        // Map target names to Android ABI names
        val androidAbi = when (target) {
            "armv7" -> "armeabi-v7a"
            "aarch64" -> "arm64-v8a"
            "i686" -> "x86"
            "x86_64" -> "x86_64"
            else -> throw GradleException("Unknown target: $target")
        }
        
        val baseArgs = listOf("build", "--target", rustTarget)
        val allArgs = baseArgs.toMutableList()
        if (release == true) {
            allArgs.add("--release")
        }

        val workingDir = File(project.projectDir, rootDirRel)
        val profile = if (release == true) "release" else "debug"
        val ndkPath = "C:\\Users\\rafal\\AppData\\Local\\Android\\Sdk\\ndk\\30.0.14904198"
        
        // Set CC and AR environment variables to point to NDK clang and llvm-ar
        val clangPath = when (target) {
            "armv7" -> "$ndkPath\\toolchains\\llvm\\prebuilt\\windows-x86_64\\bin\\armv7a-linux-androideabi21-clang.cmd"
            "aarch64" -> "$ndkPath\\toolchains\\llvm\\prebuilt\\windows-x86_64\\bin\\aarch64-linux-android21-clang.cmd"
            "i686" -> "$ndkPath\\toolchains\\llvm\\prebuilt\\windows-x86_64\\bin\\i686-linux-android21-clang.cmd"
            "x86_64" -> "$ndkPath\\toolchains\\llvm\\prebuilt\\windows-x86_64\\bin\\x86_64-linux-android21-clang.cmd"
            else -> throw GradleException("Unknown target: $target")
        }
        
        val arPath = when (target) {
            "armv7" -> "$ndkPath\\toolchains\\llvm\\prebuilt\\windows-x86_64\\bin\\llvm-ar.cmd"
            "aarch64" -> "$ndkPath\\toolchains\\llvm\\prebuilt\\windows-x86_64\\bin\\llvm-ar.cmd"
            "i686" -> "$ndkPath\\toolchains\\llvm\\prebuilt\\windows-x86_64\\bin\\llvm-ar.cmd"
            "x86_64" -> "$ndkPath\\toolchains\\llvm\\prebuilt\\windows-x86_64\\bin\\llvm-ar.cmd"
            else -> throw GradleException("Unknown target: $target")
        }
        
        // Try cargo executable
        val cargoExecutables = listOf("cargo", "cargo.exe", "cargo.cmd")
        var lastException: Exception? = null
        
        for (executable in cargoExecutables) {
            try {
                val result: ExecResult = execOperations.exec {
                    this.workingDir = workingDir
                    this.commandLine = listOf(executable) + allArgs
                    environment["NDK_HOME"] = ndkPath
                    environment["ANDROID_NDK_HOME"] = ndkPath
                    environment["CC"] = clangPath
                    environment["AR"] = arPath
                    environment["CARGO_TARGET_${rustTarget.replace("-", "_").uppercase()}_LINKER"] = clangPath
                }
                if (result.exitValue == 0) {
                    // Symlink the compiled .so file to jniLibs
                    val sourceFile = File(workingDir, "target/$rustTarget/$profile/libiptv_thunder_tauri_lib.so")
                    val jniLibsDir = File(project.projectDir, "src/main/jniLibs/$androidAbi")
                    jniLibsDir.mkdirs()
                    
                    val targetFile = File(jniLibsDir, "libiptv_thunder_tauri_lib.so")
                    
                    // Copy the file (Windows doesn't support symlinks well)
                    sourceFile.copyTo(targetFile, overwrite = true)
                    
                    project.logger.lifecycle("Copied $sourceFile to $targetFile")
                    return
                }
            } catch (e: Exception) {
                lastException = e
            }
        }
        
        throw GradleException("Cargo build failed", lastException)
    }
}
