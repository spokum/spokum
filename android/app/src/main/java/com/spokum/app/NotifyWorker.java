package com.spokum.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;

public class NotifyWorker extends Worker {

  public static final String CHANNEL = "spokum-alerts";
  private static final String PREFS = "spokum";

  public NotifyWorker(@NonNull Context context, @NonNull WorkerParameters params) {
    super(context, params);
  }

  static void ensureChannel(Context context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return;
    }
    NotificationManager manager = context.getSystemService(NotificationManager.class);
    if (manager == null || manager.getNotificationChannel(CHANNEL) != null) {
      return;
    }
    NotificationChannel channel = new NotificationChannel(CHANNEL, "Уведомления СпокУма", NotificationManager.IMPORTANCE_DEFAULT);
    channel.setDescription("Сообщения, звонки, жалобы и всё важное");
    manager.createNotificationChannel(channel);
  }

  private static String read(HttpURLConnection connection) throws Exception {
    StringBuilder builder = new StringBuilder();
    try (InputStream stream = connection.getInputStream()) {
      byte[] chunk = new byte[4096];
      int size;
      while ((size = stream.read(chunk)) > 0) {
        builder.append(new String(chunk, 0, size, "UTF-8"));
      }
    }
    return builder.toString();
  }

  private String freshToken(String base, String key, String refresh) {
    HttpURLConnection connection = null;
    try {
      connection = (HttpURLConnection) new URL(base + "/auth/v1/token?grant_type=refresh_token").openConnection();
      connection.setRequestMethod("POST");
      connection.setConnectTimeout(10000);
      connection.setReadTimeout(15000);
      connection.setDoOutput(true);
      connection.setRequestProperty("Content-Type", "application/json");
      connection.setRequestProperty("apikey", key);
      byte[] payload = new JSONObject().put("refresh_token", refresh).toString().getBytes("UTF-8");
      try (OutputStream stream = connection.getOutputStream()) {
        stream.write(payload);
      }
      if (connection.getResponseCode() != 200) {
        return null;
      }
      JSONObject body = new JSONObject(read(connection));
      SharedPreferences prefs = getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
      String next = body.optString("refresh_token", "");
      if (!next.isEmpty()) {
        prefs.edit().putString("refresh", next).apply();
      }
      return body.optString("access_token", null);
    } catch (Exception ignored) {
      return null;
    } finally {
      if (connection != null) {
        connection.disconnect();
      }
    }
  }

  @NonNull
  @Override
  public Result doWork() {
    Context context = getApplicationContext();
    SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);

    String base = prefs.getString("sb_url", "");
    String key = prefs.getString("sb_key", "");
    String refresh = prefs.getString("refresh", "");
    if (base.isEmpty() || key.isEmpty() || refresh.isEmpty()) {
      return Result.success();
    }
    if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) {
      return Result.success();
    }

    String token = freshToken(base, key, refresh);
    if (token == null) {
      return Result.success();
    }

    long lastSeen = prefs.getLong("last_note", 0);
    HttpURLConnection connection = null;
    try {
      String query = base + "/rest/v1/notifications?select=id,kind,title,body&read_at=is.null&id=gt."
          + lastSeen + "&order=id.asc&limit=" + URLEncoder.encode("10", "UTF-8");
      connection = (HttpURLConnection) new URL(query).openConnection();
      connection.setConnectTimeout(10000);
      connection.setReadTimeout(15000);
      connection.setRequestProperty("apikey", key);
      connection.setRequestProperty("Authorization", "Bearer " + token);
      if (connection.getResponseCode() != 200) {
        return Result.success();
      }

      JSONArray rows = new JSONArray(read(connection));
      long newest = lastSeen;
      for (int i = 0; i < rows.length(); i++) {
        JSONObject row = rows.getJSONObject(i);
        long id = row.optLong("id", 0);
        if (id > newest) {
          newest = id;
        }
        show(context, (int) (id % 100000), row.optString("title", "СпокУм"), row.optString("body", ""));
      }
      if (newest != lastSeen) {
        prefs.edit().putLong("last_note", newest).apply();
      }
    } catch (Exception ignored) {
    } finally {
      if (connection != null) {
        connection.disconnect();
      }
    }
    return Result.success();
  }

  static void show(Context context, int id, String title, String body) {
    ensureChannel(context);
    Intent intent = new Intent(context, MainActivity.class);
    intent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    int flags = PendingIntent.FLAG_UPDATE_CURRENT;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      flags |= PendingIntent.FLAG_IMMUTABLE;
    }
    PendingIntent open = PendingIntent.getActivity(context, id, intent, flags);

    Notification notification = new NotificationCompat.Builder(context, CHANNEL)
        .setSmallIcon(android.R.drawable.ic_dialog_email)
        .setContentTitle(title == null || title.isEmpty() ? "СпокУм" : title)
        .setContentText(body)
        .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
        .setPriority(NotificationCompat.PRIORITY_DEFAULT)
        .setAutoCancel(true)
        .setContentIntent(open)
        .build();

    try {
      NotificationManagerCompat.from(context).notify(id, notification);
    } catch (SecurityException ignored) {
    }
  }
}
