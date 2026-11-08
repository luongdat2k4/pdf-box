package vn.alf.pdftoolbox;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import vn.alf.pdftoolbox.library.bridge.LibraryPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WindowColorPlugin.class);
        registerPlugin(ScanCameraPlugin.class);
        registerPlugin(LibraryPlugin.class); // SQLite library + file storage; see design-note/native-api.md
        super.onCreate(savedInstanceState);
    }
}
