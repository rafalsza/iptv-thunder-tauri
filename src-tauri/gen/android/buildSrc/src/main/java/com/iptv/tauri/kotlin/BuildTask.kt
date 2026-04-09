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
        val executable = """npm""";
        try {
            runTauriCli(executable)
        } catch (e: Exception) {
            if (Os.isFamily(Os.FAMILY_WINDOWS)) {
                val fallbacks = listOf(
                    "$executable.exe",
                    "$executable.cmd",
                    "$executable.bat",
                )
                
                var lastException: Exception = e
                for (fallback in fallbacks) {
                    try {
                        runTauriCli(fallback)
                        return
                    } catch (fallbackException: Exception) {
                        lastException = fallbackException
                    }
                }
                throw lastException
            } else {
                throw e;
            }
        }
    }

    fun runTauriCli(executable: String) {
        val rootDirRel = rootDirRel ?: throw GradleException("rootDirRel cannot be null")
        val target = target ?: throw GradleException("target cannot be null")
        val release = release ?: throw GradleException("release cannot be null")
        val baseArgs = listOf("run", "--", "tauri", "android", "android-studio-script")

        val allArgs = baseArgs.toMutableList()
        if (project.logger.isEnabled(LogLevel.DEBUG)) {
            allArgs.add("-vv")
        } else if (project.logger.isEnabled(LogLevel.INFO)) {
            allArgs.add("-v")
        }
        if (release == true) {
            allArgs.add("--release")
        }
        allArgs.add("--target")
        allArgs.add(target)

        val workingDir = File(project.projectDir, rootDirRel)
        val command = listOf(executable) + allArgs

        val result: ExecResult = execOperations.exec {
            this.workingDir = workingDir
            this.commandLine = command
        }

        if (result.exitValue != 0) {
            throw GradleException("Tauri CLI failed with exit code ${result.exitValue}")
        }
    }
}
