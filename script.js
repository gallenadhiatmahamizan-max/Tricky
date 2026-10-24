
import {
  FilesetResolver,
  GestureRecognizer
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const statusText = document.getElementById("status");
const gestureText = document.getElementById("gesture");
const handCount = document.getElementById("handCount");
const startButton = document.getElementById("start");
const stopButton = document.getElementById("stop");

let recognizer = null;
let stream = null;
let running = false;
let animationId = null;
let lastVideoTime = -1;

/* hubungan antar-titik kerangka tangan */
const connections = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17]
];

const gestureNames = {
  Open_Palm: "✋ TELAPAK TERBUKA",
  Closed_Fist: "✊ TANGAN MENGEPAL",
  Victory: "✌️ VICTORY / PEACE",
  Pointing_Up: "☝️ MENUNJUK KE ATAS",
  Thumb_Up: "👍 THUMBS UP",
  Thumb_Down: "👎 THUMBS DOWN",
  ILoveYou: "🤟 I LOVE YOU",
  None: "GESTURE BELUM DIKENALI"
};

/* memuat AI */
async function loadAI() {
  if (recognizer) return;

  statusText.textContent = "Memuat model AI...";

  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
  );

  recognizer = await GestureRecognizer.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-tasks/gesture_recognizer/gesture_recognizer.task",
      delegate: "CPU"
    },
    runningMode: "VIDEO",
    numHands: 1,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5
  });
}

/* samakan ukuran canvas dengan resolusi asli video */
function resizeCanvas() {
  if (!video.videoWidth || !video.videoHeight) return;

  if (
    canvas.width !== video.videoWidth ||
    canvas.height !== video.videoHeight
  ) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }
}

/*
  MediaPipe memberi koordinat normal:
  x = 0 di kiri video asli
  x = 1 di kanan video asli

  Karena video ditampilkan seperti selfie,
  koordinat x kerangka juga harus dicerminkan.
*/
function getPosition(point) {
  return {
    x: (1 - point.x) * canvas.width,
    y: point.y * canvas.height
  };
}

/* gambar kerangka tangan */
function drawHand(landmarks) {
  if (!landmarks || landmarks.length !== 21) return;

  ctx.lineWidth = Math.max(2, canvas.width / 220);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  /* gambar garis tulang */
  ctx.strokeStyle = "#00e5ff";

  for (const [start, end] of connections) {
    const a = getPosition(landmarks[start]);
    const b = getPosition(landmarks[end]);

    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  /* gambar 21 titik landmark */
  for (let i = 0; i < landmarks.length; i++) {
    const point = getPosition(landmarks[i]);
    const fingertip = [4, 8, 12, 16, 20].includes(i);

    ctx.beginPath();
    ctx.arc(
      point.x,
      point.y,
      fingertip ? canvas.width / 65 : canvas.width / 110,
      0,
      Math.PI * 2
    );

    ctx.fillStyle = fingertip ? "#00e5ff" : "#ffffff";
    ctx.fill();

    ctx.lineWidth = Math.max(1, canvas.width / 300);
    ctx.strokeStyle = "#111111";
    ctx.stroke();
  }
}

/* proses kamera dan pengenalan gesture */
function loop() {
  if (!running) return;

  try {
    if (video.readyState < 2) {
      animationId = requestAnimationFrame(loop);
      return;
    }

    resizeCanvas();

    /* proses hanya ketika frame video berubah */
    if (video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;

      const result = recognizer.recognizeForVideo(
        video,
        performance.now()
      );

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const landmarks = result.landmarks || [];

      handCount.textContent =
        landmarks.length +
        (landmarks.length === 1 ? " hand" : " hands");

      if (landmarks.length > 0) {
        drawHand(landmarks[0]);

        const detected = result.gestures?.[0]?.[0];
        const label = detected?.categoryName || "None";
        const confidence = detected
          ? Math.round(detected.score * 100)
          : 0;

        gestureText.textContent =
          (gestureNames[label] || label) + " · " + confidence + "%";

        statusText.textContent = "AI aktif · tangan terdeteksi";
      } else {
        gestureText.textContent = "Tangan belum terdeteksi";
        statusText.textContent =
          "AI aktif · arahkan tangan ke kamera";
      }
    }
  } catch (error) {
    stopCamera();
    statusText.textContent =
      "Gagal memproses video: " + error.message;
    return;
  }

  if (running) {
    animationId = requestAnimationFrame(loop);
  }
}

/* nyalakan kamera */
startButton.addEventListener("click", async () => {
  startButton.disabled = true;

  try {
    await loadAI();

    statusText.textContent = "Menyiapkan kamera...";

    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: "user",
        width: { ideal: 480 },
        height: { ideal: 360 },
        frameRate: { ideal: 15, max: 20 }
      }
    });

    video.srcObject = stream;
    await video.play();

    lastVideoTime = -1;
    running = true;

    startButton.hidden = true;
    stopButton.hidden = false;

    statusText.textContent = "Kamera aktif · AI berjalan";

    loop();
  } catch (error) {
    statusText.textContent =
      "Gagal: " + error.name + " — " + error.message;

    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      stream = null;
    }

    video.srcObject = null;
    startButton.disabled = false;
  }
});

/* matikan kamera */
function stopCamera() {
  running = false;

  if (animationId !== null) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }

  video.srcObject = null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  handCount.textContent = "0 hand";
  gestureText.textContent = "Belum ada gesture";
  statusText.textContent = "Kamera dimatikan";

  stopButton.hidden = true;
  startButton.hidden = false;
  startButton.disabled = false;
}

stopButton.addEventListener("click", stopCamera);
