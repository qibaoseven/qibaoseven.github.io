package io.qibaoseven.openstu

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.*
import androidx.lifecycle.viewmodel.compose.viewModel

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            val store = remember { Store(this) }
            var page by remember { mutableStateOf(if (store.configured) 1 else 0) }
            val vm: MainViewModel = viewModel()

            MaterialTheme {
                Surface {
                    when (page) {
                        0 -> ConfigScreen(store) { page = 1 }
                        else -> MainScreen(store, vm) { page = 0 }
                    }
                }
            }
        }
    }
}
