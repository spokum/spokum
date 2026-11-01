const admin = require("/home/z/my-project/spokum-work/server/node_modules/firebase-admin");

const serviceAccount = require("/home/z/my-project/upload/spokum-firebase-adminsdk-fbsvc-d2a101d079.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

async function sendToAll(title, body) {
  const message = {
    notification: { title, body },
    data: { title, body },
    android: {
      notification: {
        channelId: "spokum_push",
        priority: "high",
        sound: "default",
      },
    },
    topic: "spokum_all",
  };

  try {
    const response = await admin.messaging().send(message);
    console.log("Push sent:", response);
  } catch (error) {
    console.error("Push error:", error.message);
  }
}

const title = process.argv[2] || "СпокУм";
const body = process.argv[3] || "Новое уведомление";
console.log(`Sending: "${title}" / "${body}"`);
sendToAll(title, body);
