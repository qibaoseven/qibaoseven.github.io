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
            val deviceVm: DeviceViewModel = viewModel()
            val moreVm: MoreViewModel = viewModel()

            MaterialTheme {
                Surface {
                    when (page) {
                        0 -> ConfigScreen(store) { page = 1 }
                        2 -> DevicePage(
                            store = store,
                            vm = deviceVm,
                            roster = vm.state.roster,
                            subjects = vm.state.required?.subjects ?: emptyList(),
                            subjectName = { vm.subjectName(it) },
                            date = vm.state.required?.date ?: java.time.LocalDate.now().toString(),
                            onBack = { page = 1 },
                        )
                        3 -> MoreScreen(store, moreVm, vm.state.roster, onBack = { page = 1 })
                        else -> MainScreen(store, vm, onConfig = { page = 0 }, onDevice = { page = 2 },
                            onMore = { page = 3; moreVm.load(store) })
                    }
                }
            }
        }
    }
}
