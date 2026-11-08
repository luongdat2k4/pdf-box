package vn.alf.pdftoolbox;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;
import android.util.Base64;
import android.util.Size;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import androidx.annotation.NonNull;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageCapture;
import androidx.camera.core.ImageCaptureException;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;
import androidx.lifecycle.LifecycleOwner;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import com.google.common.util.concurrent.ListenableFuture;
import java.io.*;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Native preview occupies only the viewport supplied by the custom scan UI. */
@CapacitorPlugin(name = "ScanCamera", permissions = {
    @Permission(alias = "camera", strings = { Manifest.permission.CAMERA })
})
public class ScanCameraPlugin extends Plugin {
    private PreviewView previewView;
    private ProcessCameraProvider provider;
    private ImageCapture imageCapture;
    private Preview preview;
    private PluginCall pendingStart;
    private volatile boolean capturing;
    private final ExecutorService io = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void start(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            cleanup();
            pendingStart = call;
            if (getPermissionState("camera") != PermissionState.GRANTED) {
                requestPermissionForAlias("camera", call, "cameraPermissionResult");
            } else openPreview(call);
        });
    }

    @PermissionCallback
    private void cameraPermissionResult(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (pendingStart != call) return;
            if (getPermissionState("camera") != PermissionState.GRANTED) {
                pendingStart = null;
                call.reject("Camera permission denied", "PERMISSION_DENIED");
            } else openPreview(call);
        });
    }

    private void openPreview(PluginCall call) {
        ListenableFuture<ProcessCameraProvider> future = ProcessCameraProvider.getInstance(getContext());
        future.addListener(() -> {
            if (pendingStart != call) return;
            try {
                provider = future.get();
                previewView = new PreviewView(getContext());
                // TextureView composes predictably inside a hybrid app.
                previewView.setImplementationMode(PreviewView.ImplementationMode.COMPATIBLE);
                previewView.setScaleType(PreviewView.ScaleType.FILL_CENTER);
                FrameLayout content = getActivity().findViewById(android.R.id.content);
                content.addView(previewView, bounds(call, content));
                preview = new Preview.Builder().build();
                preview.setSurfaceProvider(previewView.getSurfaceProvider());
                imageCapture = new ImageCapture.Builder()
                    .setTargetResolution(new Size(1650, 2200)).setJpegQuality(92)
                    .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY).build();
                provider.bindToLifecycle((LifecycleOwner) getActivity(), CameraSelector.DEFAULT_BACK_CAMERA, preview, imageCapture);
                pendingStart = null;
                call.resolve();
            } catch (Exception e) {
                pendingStart = null;
                cleanup();
                call.reject("Unable to start camera", "CAMERA_UNAVAILABLE", e);
            }
        }, ContextCompat.getMainExecutor(getContext()));
    }

    private FrameLayout.LayoutParams bounds(PluginCall call, FrameLayout content) {
        double viewportWidth = call.getDouble("viewportWidth", 1.0);
        double scale = getBridge().getWebView().getWidth() / Math.max(1.0, viewportWidth);
        int[] webLocation = new int[2], contentLocation = new int[2];
        getBridge().getWebView().getLocationOnScreen(webLocation);
        content.getLocationOnScreen(contentLocation);
        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
            Math.max(1, (int) Math.round(call.getDouble("width", 1.0) * scale)),
            Math.max(1, (int) Math.round(call.getDouble("height", 1.0) * scale)));
        params.leftMargin = webLocation[0] - contentLocation[0] + (int) Math.round(call.getDouble("x", 0.0) * scale);
        params.topMargin = webLocation[1] - contentLocation[1] + (int) Math.round(call.getDouble("y", 0.0) * scale);
        return params;
    }

    @PluginMethod
    public void resize(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (previewView != null) {
                previewView.setLayoutParams(bounds(call, getActivity().findViewById(android.R.id.content)));
                if (previewView.getDisplay() != null && imageCapture != null)
                    imageCapture.setTargetRotation(previewView.getDisplay().getRotation());
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void capture(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (imageCapture == null || capturing) {
                call.reject("Camera is not ready", "CAMERA_NOT_READY");
                return;
            }
            try {
                File photo = File.createTempFile("scan-", ".jpg", getContext().getCacheDir());
                capturing = true;
                imageCapture.takePicture(new ImageCapture.OutputFileOptions.Builder(photo).build(), io,
                    new ImageCapture.OnImageSavedCallback() {
                        @Override public void onImageSaved(@NonNull ImageCapture.OutputFileResults result) {
                            try (InputStream input = new FileInputStream(photo); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                                byte[] buffer = new byte[8192];
                                int count;
                                while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
                                JSObject response = new JSObject();
                                response.put("base64", Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP));
                                call.resolve(response);
                            } catch (Exception e) {
                                call.reject("Unable to read photo", "CAPTURE_FAILED", e);
                            } finally { photo.delete(); capturing = false; }
                        }
                        @Override public void onError(@NonNull ImageCaptureException e) {
                            photo.delete(); capturing = false;
                            call.reject("Unable to capture photo", "CAPTURE_FAILED", e);
                        }
                    });
            } catch (IOException e) { call.reject("Unable to create photo", "CAPTURE_FAILED", e); }
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getActivity().runOnUiThread(() -> { cleanup(); call.resolve(); });
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        getActivity().startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
            Uri.parse("package:" + getContext().getPackageName())));
        call.resolve();
    }

    private void cleanup() {
        if (pendingStart != null) { pendingStart.reject("Camera closed", "CANCELLED"); pendingStart = null; }
        if (provider != null && preview != null && imageCapture != null) provider.unbind(preview, imageCapture);
        if (previewView != null && previewView.getParent() instanceof ViewGroup)
            ((ViewGroup) previewView.getParent()).removeView(previewView);
        previewView = null; preview = null; imageCapture = null;
    }

    @Override protected void handleOnDestroy() { cleanup(); io.shutdown(); }
}
