require("dotenv").config();
const express = require("express");
const fs = require("fs");
const path = require("path");
const P = require("pino");
const bodyParser = require("body-parser");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  jidNormalizedUser
} = require("@whiskeysockets/baileys");

const app = express();
const PORT = process.env.PORT || 3000;

let sock; // global bot socket
let botReady = false;
let latestPairCode = "";

app.use(express.static("public"));
app.use(bodyParser.json());

// 🟢 API: Start bot & generate pairing code
app.post("/start", async (req, res) => {
  const phoneNumber = req.body.phone;
  if (!phoneNumber) {
    return res.json({ success: false, message: "⚠️ Weka namba kwanza" });
  }

  try {
    const { state, saveCreds } = await useMultiFileAuthState("./session");
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: P({ level: "silent" })
    });

    if (!sock.authState.creds.registered) {
      const code = await sock.requestPairingCode(phoneNumber);
      latestPairCode = code;
    }

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection } = update;
      if (connection === "open") {
        botReady = true;
        console.log("✅ Bot imeunganishwa!");

        // Save session.json
        const sessionDir = path.resolve("./session");
        const sessionFiles = fs.readdirSync(sessionDir);

        let sessionData = {};
        for (let file of sessionFiles) {
          sessionData[file] = fs.readFileSync(path.join(sessionDir, file), "utf8");
        }

        const sessionJson = JSON.stringify(sessionData, null, 2);
        fs.writeFileSync("session.json", sessionJson);

        // Tuma kwa owner
        const ownerJid = jidNormalizedUser(phoneNumber + "@s.whatsapp.net");
        await sock.sendMessage(ownerJid, {
          document: fs.readFileSync("session.json"),
          fileName: "session.json",
          mimetype: "application/json",
          caption: "✅ Session ID yako iko tayari – upload hii Render/Heroku ili kuepuka kuscan tena."
        });
      }
    });

    res.json({ success: true, code: latestPairCode });
  } catch (err) {
    console.error("❌ Error:", err);
    res.json({ success: false, message: "Imeshindikana kuanzisha bot!" });
  }
});

// 🟢 API: Check status
app.get("/status", (req, res) => {
  res.json({ connected: botReady });
});

app.listen(PORT, () => console.log(`🌐 Web UI running on http://localhost:${PORT}`));
