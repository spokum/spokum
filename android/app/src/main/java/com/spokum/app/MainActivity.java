package com.spokum.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.webkit.ServiceWorkerClientCompat;
import androidx.webkit.ServiceWorkerControllerCompat;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewFeature;

public class MainActivity extends AppCompatActivity {

  private WebView webView;
  private ValueCallback<Uri[]> filePicker;
  private PermissionRequest pendingMicRequest;
  private ActivityResultLauncher<Intent> fileChooser;

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    fileChooser = registerForActivityResult(
        new ActivityResultContracts.StartActivityForResult(),
        result -> {
          if (filePicker == null) {
            return;
          }
          Uri[] uris = null;
          Intent data = result.getData();
          if (result.getResultCode() == RESULT_OK && data != null) {
            if (data.getClipData() != null) {
              int count = data.getClipData().getItemCount();
              uris = new Uri[count];
              for (int i = 0; i < count; i++) {
                uris[i] = data.getClipData().getItemAt(i).getUri();
              }
            } else if (data.getData() != null) {
              uris = new Uri[] { data.getData() };
            }
          }
          filePicker.onReceiveValue(uris);
          filePicker = null;
        });

    webView = new WebView(this);
    setContentView(webView);

    WebSettings settings = webView.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setDatabaseEnabled(true);
    settings.setMediaPlaybackRequiresUserGesture(false);
    settings.setAllowFileAccess(false);
    settings.setAllowContentAccess(false);
    settings.setCacheMode(WebSettings.LOAD_DEFAULT);
    settings.setSupportMultipleWindows(false);
    settings.setTextZoom(100);

    webView.setBackgroundColor(0xFF101318);
    webView.setOverScrollMode(View.OVER_SCROLL_NEVER);

    final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
        .addPathHandler("/", new WebViewAssetLoader.AssetsPathHandler(this))
        .build();

    if (WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_BASIC_USAGE)) {
      ServiceWorkerControllerCompat controller = ServiceWorkerControllerCompat.getInstance();
      if (WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_CONTENT_ACCESS)) {
        controller.getServiceWorkerWebSettings().setAllowContentAccess(false);
      }
      if (WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_FILE_ACCESS)) {
        controller.getServiceWorkerWebSettings().setAllowFileAccess(false);
      }
      if (WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_SHOULD_INTERCEPT_REQUEST)) {
        controller.setServiceWorkerClient(new ServiceWorkerClientCompat() {
          @Override
          public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) {
            return loader.shouldInterceptRequest(request.getUrl());
          }
        });
      }
    }

    webView.setWebViewClient(new WebViewClient() {
      @Override
      public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        return loader.shouldInterceptRequest(request.getUrl());
      }

      @Override
      public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        Uri url = request.getUrl();
        if ("appassets.androidplatform.net".equals(url.getHost())) {
          return false;
        }
        try {
          startActivity(new Intent(Intent.ACTION_VIEW, url));
        } catch (Exception ignored) {
          return true;
        }
        return true;
      }
    });

    webView.setWebChromeClient(new WebChromeClient() {
      @Override
      public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
        if (filePicker != null) {
          filePicker.onReceiveValue(null);
        }
        filePicker = callback;
        Intent intent = params.createIntent();
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        try {
          fileChooser.launch(intent);
        } catch (Exception error) {
          filePicker = null;
          Toast.makeText(MainActivity.this, "Не удалось открыть галерею", Toast.LENGTH_SHORT).show();
          return false;
        }
        return true;
      }

      @Override
      public void onPermissionRequest(final PermissionRequest request) {
        runOnUiThread(() -> {
          boolean wantsAudio = false;
          for (String resource : request.getResources()) {
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
              wantsAudio = true;
            }
          }
          if (!wantsAudio) {
            request.deny();
            return;
          }
          if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.RECORD_AUDIO)
              == PackageManager.PERMISSION_GRANTED) {
            request.grant(request.getResources());
            return;
          }
          pendingMicRequest = request;
          ActivityCompat.requestPermissions(MainActivity.this,
              new String[] { Manifest.permission.RECORD_AUDIO }, 42);
        });
      }
    });

    getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
      @Override
      public void handleOnBackPressed() {
        if (webView.canGoBack()) {
          webView.goBack();
        } else {
          finish();
        }
      }
    });

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
      settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    }

    if (savedInstanceState != null) {
      webView.restoreState(savedInstanceState);
    } else {
      webView.loadUrl("https://appassets.androidplatform.net/www/index.html");
    }
  }

  @Override
  public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
    super.onRequestPermissionsResult(code, permissions, results);
    if (code != 42 || pendingMicRequest == null) {
      return;
    }
    boolean granted = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
    if (granted) {
      pendingMicRequest.grant(pendingMicRequest.getResources());
    } else {
      pendingMicRequest.deny();
      Toast.makeText(this, "Без доступа к микрофону голосовые не записать", Toast.LENGTH_SHORT).show();
    }
    pendingMicRequest = null;
  }

  @Override
  protected void onSaveInstanceState(Bundle outState) {
    super.onSaveInstanceState(outState);
    webView.saveState(outState);
  }

  @Override
  protected void onDestroy() {
    if (webView != null) {
      webView.destroy();
    }
    super.onDestroy();
  }
}
