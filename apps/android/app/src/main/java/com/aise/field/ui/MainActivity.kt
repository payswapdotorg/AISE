package com.aise.field.ui

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.navigation.compose.rememberNavController
import com.aise.field.AiseApplication
import com.aise.field.ui.navigation.AiseNavGraph
import com.aise.field.ui.theme.AiseTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val app = application as AiseApplication

        setContent {
            AiseTheme {
                val navController = rememberNavController()
                AiseNavGraph(
                    navController = navController,
                    projectStore = app.projectStore,
                    captureStore = app.captureStore
                )
            }
        }
    }
}
