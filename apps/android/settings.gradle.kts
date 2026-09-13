/*
 * AISE v2 — Android field client (AISE-002).
 *
 * Self-contained Gradle (Kotlin DSL) build. This directory is GEMINI's owned
 * surface; the repository root is a bun/TypeScript workspace that ignores it
 * (no package.json exists here, so the root workspace glob skips it).
 */

pluginManagement {
    repositories {
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}

plugins {
    // Toolchain resolver: lets a plain JRE-only machine build/test :core by
    // auto-provisioning the JDK 21 toolchain declared in the modules.
    id("org.gradle.toolchains.foojay-resolver-convention") version "0.8.0"
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
    }
}

rootProject.name = "aise-android"

include(":app", ":core")
