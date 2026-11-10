package vn.alf.pdftoolbox;

import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.LayerDrawable;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Paints the strip behind the status bar. On Android 15+ StatusBar.setBackgroundColor is ignored and
 * Capacitor pads the WebView below the bars, so the strip shows the window background; this recolours it
 * to the current view's title-bar colour. The rest of the window (behind the navigation bar) takes the
 * optional `background` colour, so it matches the app theme; white when it is not given.
 */
@CapacitorPlugin(name = "WindowColor")
public class WindowColorPlugin extends Plugin {

    @PluginMethod
    public void setStatusBarColor(PluginCall call) {
        final String hex = call.getString("color");
        final String backgroundHex = call.getString("background", "#ffffff");
        if (hex == null) {
            call.reject("color is required");
            return;
        }
        getActivity().runOnUiThread(() -> {
            try {
                int color = Color.parseColor(hex);
                int background = Color.parseColor(backgroundHex);
                int id = getContext().getResources().getIdentifier("status_bar_height", "dimen", "android");
                int statusH = id > 0 ? getContext().getResources().getDimensionPixelSize(id) : 0;
                int screenH = getContext().getResources().getDisplayMetrics().heightPixels;
                LayerDrawable bg = new LayerDrawable(new Drawable[] { new ColorDrawable(background), new ColorDrawable(color) });
                bg.setLayerInset(1, 0, 0, 0, Math.max(0, screenH - statusH)); // top strip only
                getActivity().getWindow().getDecorView().setBackground(bg);
                call.resolve();
            } catch (IllegalArgumentException e) {
                call.reject("invalid color: " + hex + " / " + backgroundHex);
            }
        });
    }
}
