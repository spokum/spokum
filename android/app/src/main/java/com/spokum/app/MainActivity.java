package com.spokum.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.webkit.PermissionRequest;
import android.webkit.JavascriptInterface;
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
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.PeriodicWorkRequest;
import androidx.work.OneTimeWorkRequest;
import androidx.work.ExistingWorkPolicy;
import androidx.work.WorkManager;
import java.util.concurrent.TimeUnit;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.Executors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import androidx.webkit.ServiceWorkerClientCompat;
import androidx.webkit.ServiceWorkerControllerCompat;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewFeature;

public class MainActivity extends AppCompatActivity {

  private static final String UPDATE_BASE = "https://spokum.github.io/spokum/";

  private WebView webView;
  private long lastUpdateCheck = System.currentTimeMillis();
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

    final File updates = new File(getFilesDir(), "web");
    final WebViewAssetLoader.Builder builder = new WebViewAssetLoader.Builder();
    if (new File(updates, "www/index.html").exists()) {
      builder.addPathHandler("/", new WebViewAssetLoader.InternalStoragePathHandler(this, updates));
    }
    builder.addPathHandler("/", new WebViewAssetLoader.AssetsPathHandler(this));
    final WebViewAssetLoader loader = builder.build();

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
          boolean wantsVideo = false;
          for (String resource : request.getResources()) {
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
              wantsAudio = true;
            }
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) {
              wantsVideo = true;
            }
          }
          if (!wantsAudio && !wantsVideo) {
            request.deny();
            return;
          }
          java.util.ArrayList<String> missing = new java.util.ArrayList<>();
          if (wantsAudio && ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.RECORD_AUDIO)
              != PackageManager.PERMISSION_GRANTED) {
            missing.add(Manifest.permission.RECORD_AUDIO);
          }
          if (wantsVideo && ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.CAMERA)
              != PackageManager.PERMISSION_GRANTED) {
            missing.add(Manifest.permission.CAMERA);
          }
          if (missing.isEmpty()) {
            request.grant(request.getResources());
            return;
          }
          pendingMicRequest = request;
          ActivityCompat.requestPermissions(MainActivity.this, missing.toArray(new String[0]), 42);
        });
      }
    });

    webView.addJavascriptInterface(new Object() {
      @JavascriptInterface
      public void apply() {
        runOnUiThread(MainActivity.this::recreate);
      }

      @JavascriptInterface
      public void checkUpdate() {
        checkForUpdate(true);
      }

      @JavascriptInterface
      public String version() {
        return getSharedPreferences("spokum", MODE_PRIVATE).getString("web_version", "");
      }

      @JavascriptInterface
      public void setAuth(String url, String key, String refresh) {
        getSharedPreferences("spokum", MODE_PRIVATE).edit()
            .putString("sb_url", url == null ? "" : url.replaceAll("/+$", ""))
            .putString("sb_key", key == null ? "" : key)
            .putString("refresh", refresh == null ? "" : refresh)
            .apply();
        scheduleNotifications();
      }

      @JavascriptInterface
      public void clearAuth() {
        getSharedPreferences("spokum", MODE_PRIVATE).edit()
            .remove("refresh").remove("last_note").apply();
        WorkManager.getInstance(MainActivity.this).cancelUniqueWork("spokum-notify");
      }

      @JavascriptInterface
      public void notify(String title, String body) {
        NotifyWorker.show(MainActivity.this, (int) (System.currentTimeMillis() % 100000), title, body);
      }

      @JavascriptInterface
      public boolean canNotify() {
        return androidx.core.app.NotificationManagerCompat.from(MainActivity.this).areNotificationsEnabled();
      }

      @JavascriptInterface
      public void askNotify() {
        runOnUiThread(() -> {
          if (androidx.core.app.NotificationManagerCompat.from(MainActivity.this).areNotificationsEnabled()) {
            return;
          }
          boolean missing = Build.VERSION.SDK_INT >= 33
              && ContextCompat.checkSelfPermission(MainActivity.this, "android.permission.POST_NOTIFICATIONS")
                 != PackageManager.PERMISSION_GRANTED;
          android.content.SharedPreferences prefs = getSharedPreferences("spokum", MODE_PRIVATE);
          boolean first = !prefs.getBoolean("notify_asked", false);
          boolean rationale = missing
              && ActivityCompat.shouldShowRequestPermissionRationale(MainActivity.this, "android.permission.POST_NOTIFICATIONS");
          if (missing && (first || rationale)) {
            prefs.edit().putBoolean("notify_asked", true).apply();
            ActivityCompat.requestPermissions(MainActivity.this, new String[] { "android.permission.POST_NOTIFICATIONS" }, 77);
            return;
          }
          openNotifySettings();
        });
      }

      @JavascriptInterface
      public void notifySettings() {
        runOnUiThread(() -> openNotifySettings());
      }

      @JavascriptInterface
      public String deviceId() {
        String id = android.provider.Settings.Secure.getString(getContentResolver(), android.provider.Settings.Secure.ANDROID_ID);
        if (id == null || id.isEmpty() || "9774d56d682e549c".equals(id)) {
          android.content.SharedPreferences prefs = getSharedPreferences("spokum", MODE_PRIVATE);
          id = prefs.getString("hw_id", "");
          if (id.isEmpty()) {
            id = java.util.UUID.randomUUID().toString();
            prefs.edit().putString("hw_id", id).apply();
          }
        }
        return id + "|" + android.os.Build.MODEL + "|" + android.os.Build.DEVICE;
      }

      @JavascriptInterface
      public String deviceName() {
        return android.os.Build.MANUFACTURER + " " + android.os.Build.MODEL;
      }
    }, "SpokumHost");

    getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
      @Override
      public void handleOnBackPressed() {
        webView.evaluateJavascript("(function(){try{return window.__spokumBack?window.__spokumBack():false}catch(e){return false}})()", value -> {
          if ("true".equals(value)) {
            return;
          }
          if (webView.canGoBack()) {
            webView.goBack();
            return;
          }
          webView.evaluateJavascript("window.__spokum&&window.__spokum.openTab&&window.__spokum.openTab('feed')", null);
        });
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

    NotifyWorker.ensureChannel(this);
    checkForUpdate(false);
  }

  private void openNotifySettings() {
    try {
      android.content.Intent intent = new android.content.Intent("android.settings.APP_NOTIFICATION_SETTINGS");
      intent.putExtra("android.provider.extra.APP_PACKAGE", getPackageName());
      intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
      startActivity(intent);
    } catch (Exception error) {
      try {
        android.content.Intent fallback = new android.content.Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        fallback.setData(android.net.Uri.parse("package:" + getPackageName()));
        fallback.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(fallback);
      } catch (Exception ignored) {
      }
    }
  }

  private void scheduleNotifications() {
    PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(NotifyWorker.class, 15, TimeUnit.MINUTES)
        .setInitialDelay(2, TimeUnit.MINUTES)
        .build();
    WorkManager.getInstance(this).enqueueUniquePeriodicWork(
        "spokum-notify", ExistingPeriodicWorkPolicy.UPDATE, request);
  }

  private void quickChecks() {
    if (getSharedPreferences("spokum", MODE_PRIVATE).getString("refresh", "").isEmpty()) {
      return;
    }
    NotifyWorker.chain(this);
    WorkManager manager = WorkManager.getInstance(this);
    int[] minutes = { 1, 3, 6, 10 };
    for (int i = 0; i < minutes.length; i++) {
      OneTimeWorkRequest soon = new OneTimeWorkRequest.Builder(NotifyWorker.class)
          .setInitialDelay(minutes[i], TimeUnit.MINUTES)
          .build();
      manager.enqueueUniqueWork("spokum-soon-" + i, ExistingWorkPolicy.REPLACE, soon);
    }
  }

  @Override
  protected void onPause() {
    super.onPause();
    quickChecks();
  }

  @Override
  protected void onResume() {
    super.onResume();
    long now = System.currentTimeMillis();
    if (now - lastUpdateCheck > 900000L) {
      lastUpdateCheck = now;
      checkForUpdate(false);
    }
  }

  private void checkForUpdate(final boolean loud) {
    Executors.newSingleThreadExecutor().execute(() -> {
      HttpURLConnection connection = null;
      try {
        connection = (HttpURLConnection) new URL(UPDATE_BASE + "version.txt").openConnection();
        connection.setConnectTimeout(8000);
        connection.setReadTimeout(8000);
        if (connection.getResponseCode() != 200) {
          if (loud) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, "Сервер обновлений не ответил", Toast.LENGTH_SHORT).show());
          }
          return;
        }

        StringBuilder builder = new StringBuilder();
        try (InputStream stream = connection.getInputStream()) {
          byte[] chunk = new byte[256];
          int read;
          while ((read = stream.read(chunk)) > 0) {
            builder.append(new String(chunk, 0, read, "UTF-8"));
          }
        }

        String remote = builder.toString().trim();
        if (remote.isEmpty()) {
          return;
        }

        String local = getSharedPreferences("spokum", MODE_PRIVATE).getString("web_version", "");
        if (remote.equals(local)) {
          if (loud) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, "У вас последняя версия", Toast.LENGTH_SHORT).show());
          }
          return;
        }

        if (loud) {
          runOnUiThread(() -> Toast.makeText(MainActivity.this, "Скачиваем обновление", Toast.LENGTH_SHORT).show());
        }

        if (downloadBundle()) {
          getSharedPreferences("spokum", MODE_PRIVATE).edit().putString("web_version", remote).apply();
          runOnUiThread(() -> {
            if (webView != null) {
              webView.evaluateJavascript("window.__spokumUpdateReady && window.__spokumUpdateReady()", null);
            }
          });
        }
      } catch (Exception error) {
        if (loud) {
          runOnUiThread(() -> Toast.makeText(MainActivity.this, "Обновление не скачалось", Toast.LENGTH_SHORT).show());
        }
      } finally {
        if (connection != null) {
          connection.disconnect();
        }
      }
    });
  }

  private boolean downloadBundle() {
    HttpURLConnection connection = null;
    try {
      connection = (HttpURLConnection) new URL(UPDATE_BASE + "web-bundle.zip").openConnection();
      connection.setConnectTimeout(15000);
      connection.setReadTimeout(30000);
      if (connection.getResponseCode() != 200) {
        return false;
      }

      File staging = new File(getFilesDir(), "web-next");
      deleteTree(staging);
      File target = new File(staging, "www");
      if (!target.mkdirs()) {
        return false;
      }

      try (ZipInputStream zip = new ZipInputStream(connection.getInputStream())) {
        ZipEntry entry;
        byte[] buffer = new byte[8192];
        while ((entry = zip.getNextEntry()) != null) {
          File out = new File(target, entry.getName());
          if (!out.getCanonicalPath().startsWith(target.getCanonicalPath())) {
            return false;
          }
          if (entry.isDirectory()) {
            out.mkdirs();
            continue;
          }
          File parent = out.getParentFile();
          if (parent != null) {
            parent.mkdirs();
          }
          try (OutputStream stream = new FileOutputStream(out)) {
            int read;
            while ((read = zip.read(buffer)) > 0) {
              stream.write(buffer, 0, read);
            }
          }
        }
      }

      if (!new File(target, "index.html").exists()) {
        deleteTree(staging);
        return false;
      }

      File live = new File(getFilesDir(), "web");
      deleteTree(live);
      return staging.renameTo(live);
    } catch (Exception error) {
      return false;
    } finally {
      if (connection != null) {
        connection.disconnect();
      }
    }
  }

  private void deleteTree(File file) {
    if (file == null || !file.exists()) {
      return;
    }
    File[] children = file.listFiles();
    if (children != null) {
      for (File child : children) {
        deleteTree(child);
      }
    }
    file.delete();
  }

  @Override
  public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
    super.onRequestPermissionsResult(code, permissions, results);
    if (code == 77) {
      boolean granted = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
      if (webView != null) {
        webView.evaluateJavascript("window.__spokumNotifyAnswer&&window.__spokumNotifyAnswer(" + granted + ")", null);
      }
      return;
    }
    if (code != 42 || pendingMicRequest == null) {
      return;
    }
    boolean granted = results.length > 0;
    for (int result : results) {
      if (result != PackageManager.PERMISSION_GRANTED) {
        granted = false;
      }
    }
    if (granted) {
      pendingMicRequest.grant(pendingMicRequest.getResources());
    } else {
      pendingMicRequest.deny();
      Toast.makeText(this, "Без доступа к микрофону и камере звонки не работают", Toast.LENGTH_SHORT).show();
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
