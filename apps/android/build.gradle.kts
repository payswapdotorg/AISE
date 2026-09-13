/*
 * AISE v2 — Android field client root build (AISE-002).
 *
 * Plugin versions come exclusively from gradle/libs.versions.toml. Nothing is
 * applied at root: :core is a pure Kotlin/JVM module, :app is the Android
 * application module.
 */
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.kotlin.jvm) apply false
}
