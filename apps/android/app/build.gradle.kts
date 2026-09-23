/*
 * :app — the AISE field client shell (AISE-002).
 *
 * Scope (deliberately minimal): single-activity Compose app, placeholder
 * navigation (Home / Settings / About), bottom navigation, and proof that
 * the :core persistence abstraction is wired into the app (the in-memory
 * store is created at app start; Home shows entry counts in debug builds).
 *
 * NOT in scope (owned by later work items): camera, sensors, capture UI,
 * mission logic, network/sync code. The manifest requests ZERO permissions.
 */
plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "org.payswap.aise.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "org.payswap.aise.app"
        val apiBaseUrl = providers.environmentVariable("AISE_API_BASE_URL")
            .orElse("https://aise-tan.vercel.app")
            .get()
            .trimEnd('/')
        buildConfigField("String", "AISE_API_BASE_URL", """ + apiBaseUrl + """)
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            isMinifyEnabled = false // nothing to shrink yet; revisit when real code lands
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true // About screen + debug-only diagnostics read BuildConfig
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        // Bytecode stays 17 (D8-safe) while compilation itself runs on the
        // JDK 21 toolchain declared below.
        jvmTarget = "17"
    }

    testOptions {
        unitTests.all { it ->
            it.useJUnitPlatform()
        }
    }

    buildToolsVersion = "35.0.0"
}

kotlin {
    // JDK 21 toolchain (auto-provisioned via the foojay resolver on
    // JRE-only machines). :app additionally needs the Android SDK.
    jvmToolchain(21)
}

dependencies {
    // The foundation: pure-Kotlin persistence abstraction.
    implementation(project(":core"))

    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)

    // AISE-005 capture runtime: coroutines (session controller concurrency)
    // + CameraX (stills, video segments, preview).
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.androidx.camera.core)
    implementation(libs.androidx.camera.camera2)
    implementation(libs.androidx.camera.lifecycle)
    implementation(libs.androidx.camera.video)
    implementation(libs.androidx.camera.view)

    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons.core)
    implementation(libs.androidx.compose.material.icons.extended)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.runtime.compose) // non-deprecated LocalLifecycleOwner

    // Pure-JVM unit tests (no Robolectric, no emulator).
    testImplementation(libs.junit.jupiter)
    testImplementation(libs.kotlinx.coroutines.test)
    testRuntimeOnly(libs.junit.platform.launcher)

    // Instrumented tests: declared in structure only. Running them requires
    // an emulator and is NOT part of the `test` harness or the required CI
    // commands; they exist so AISE-005+ has a place to grow into.
    androidTestImplementation(libs.androidx.test.core)
    androidTestImplementation(libs.androidx.test.ext.junit)
    androidTestImplementation(libs.androidx.test.runner)
}
