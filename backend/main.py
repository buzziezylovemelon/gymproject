from fastapi import FastAPI, WebSocket
import cv2
import numpy as np
import base64
from ultralytics import YOLO
import json

app = FastAPI()

# Load YOLOv8 Pose Estimation model
model = YOLO('yolov8n-pose.pt')

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("UI Connected!")
    
    reps = 0
    is_hands_up = False

    try:
        while True:
            # 1. Receive Base64 image from React
            data = await websocket.receive_text()

            # Remove Base64 Header (data:image/jpeg;base64,...)
            encoded_data = data.split(',')[1] if ',' in data else data

            # 2. Convert Base64 back to image (OpenCV)
            img_data = base64.b64decode(encoded_data)
            np_arr = np.frombuffer(img_data, np.uint8)
            frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

            # 3. Process image through YOLOv8 model
            results = model(frame, verbose=False)

            result_data = {"keypoints": [], "boxes": [], "reps": reps}

            for r in results:
                # Extract Bounding Boxes exactly as [x1, y1, x2, y2]
                if r.boxes:
                    for box in r.boxes.xyxy:
                        x1, y1, x2, y2 = map(int, box[:4])
                        result_data["boxes"].append([x1, y1, x2, y2])

                # Extract 17 Keypoints exactly as [x, y], appending [0, 0] for invisible points
                if r.keypoints and r.keypoints.xy.shape[1] > 0:
                    for kp in r.keypoints.xy[0]:
                        x, y = int(kp[0]), int(kp[1])
                        result_data["keypoints"].append([x, y])
            # 4. Send coordinates back to React
            await websocket.send_text(json.dumps(result_data))

    except Exception as e:
        print(f"Connection closed: {e}")