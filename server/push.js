// Push notification sender for SpokУm
// Usage: node push.js "Title" "Body"
// Sends to all Android APK users via FCM topic "spokum_all"

const PROJECT_ID = "spokum";
const SERVER_KEY = process.env.FCM_SERVER_KEY || "";

async function sendPush(title, body) {
  const message = {
    to: "/topics/spokum_all",
    notification: {
      title: title,
      body: body,
      sound: "default",
    },
    data: {
      title: title,
      body: body,
    },
    priority: "high",
  };

  const response = await fetch("https://fcm.googleapis.com/fcm/send", {
    method: "POST",
    headers: {
      "Authorization": `key=${SERVER_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(message),
  });

  const result = await response.json();
  console.log("Push result:", JSON.stringify(result, null, 2));
  return result;
}

const title = process.argv[2] || "СпокУм";
const body = process.argv[3] || "Новое уведомление";

sendPush(title, body).catch(console.error);
