#define NOMINMAX
#include <opencv2/opencv.hpp>
#include <opencv2/dnn.hpp>
#include <iostream>
#include <cmath>
#include <string>
#include <windows.h>
#pragma comment(lib, "Comdlg32.lib")

using namespace std;
using namespace cv;
using namespace cv::dnn;

// --- ฟังก์ชันเปิดหน้าต่างเลือกไฟล์วิดีโอ ---
string openFileDialog() {
    OPENFILENAMEA ofn;
    CHAR szFile[260] = { 0 };
    ZeroMemory(&ofn, sizeof(OPENFILENAME));
    ofn.lStructSize = sizeof(OPENFILENAME);
    ofn.hwndOwner = NULL;
    ofn.lpstrFile = szFile;
    ofn.nMaxFile = sizeof(szFile);
    ofn.lpstrFilter = "Video Files\0*.mp4;*.avi;*.mov;*.mkv\0All Files\0*.*\0";
    ofn.nFilterIndex = 1;
    ofn.Flags = OFN_PATHMUSTEXIST | OFN_FILEMUSTEXIST | OFN_NOCHANGEDIR;
    if (GetOpenFileNameA(&ofn) == TRUE) return string(ofn.lpstrFile);
    return "";
}

// --- ฟังก์ชันหามุมจาก 3 จุด (0-180 องศา) ---
double calculate_angle(Point a, Point b, Point c) {
    double ux = a.x - b.x;
    double uy = a.y - b.y;
    double vx = c.x - b.x;
    double vy = c.y - b.y;

    double dot_product = (ux * vx) + (uy * vy);
    double mag_u = std::sqrt((ux * ux) + (uy * uy));
    double mag_v = std::sqrt((vx * vx) + (vy * vy));

    if (mag_u * mag_v == 0) return 0.0;
    double angle_rad = std::acos(dot_product / (mag_u * mag_v));
    return angle_rad * 180.0 / CV_PI;
}

// --- ฟังก์ชันหามุมเทียบกับแนวดิ่ง (แกน Y) ---
double calculate_vertical_angle(Point top, Point bottom) {
    double dx = std::abs(bottom.x - top.x);
    double dy = std::abs(bottom.y - top.y);
    if (dy == 0) return 90.0;
    double angle_rad = std::atan2(dx, dy);
    return angle_rad * 180.0 / CV_PI;
}

int main() {
    int category = 1;
    int sub_choice = 1;
    int exercise_type = 1;

    // ==========================================
    // ส่วนแสดงผลเมนูที่แก้ไขให้ถูกต้องตามหมวดหมู่
    // ==========================================
    cout << "=== AI Personal Trainer (YOLOv8-Pose) ===" << endl;
    cout << "Select Equipment Category:" << endl;
    cout << "1. Dumbbell" << endl;
    cout << "2. Kettlebell" << endl;
    cout << "3. No Equipment (Bodyweight)" << endl;
    cout << "Choice (1-3): ";
    cin >> category;

    if (category == 1) {
        cout << "\n--- Dumbbell Exercises ---" << endl;
        cout << "1. Bicep Curl" << endl;
        cout << "2. Overhead Triceps Extension" << endl;
        cout << "Select Exercise (1-2): ";
        cin >> sub_choice;
        if (sub_choice == 1) exercise_type = 1;
        else if (sub_choice == 2) exercise_type = 2;
    }
    else if (category == 2) {
        cout << "\n--- Kettlebell Exercises ---" << endl;
        cout << "1. Kettlebell Swing" << endl;
        cout << "2. Sumo Squat" << endl;
        cout << "3. Goblet Squat" << endl;
        cout << "Select Exercise (1-3): ";
        cin >> sub_choice;
        if (sub_choice == 1) exercise_type = 3;
        else if (sub_choice == 2) exercise_type = 4;
        else if (sub_choice == 3) exercise_type = 5;
    }
    else {
        cout << "\n--- No Equipment Exercises ---" << endl;
        cout << "1. Squat" << endl;
        cout << "2. Plank" << endl;
        cout << "3. Push-up" << endl;
        cout << "4. Lunge" << endl;
        cout << "5. Jumping Jack" << endl;
        cout << "Select Exercise (1-5): ";
        cin >> sub_choice;
        exercise_type = sub_choice + 5;
    }

    String modelPath = "yolov8n-pose.onnx";
    Net net = readNetFromONNX(modelPath);
    if (net.empty()) {
        cerr << "Error: ไม่สามารถโหลดไฟล์ yolov8n-pose.onnx ได้" << endl;
        return -1;
    }

    net.setPreferableBackend(DNN_BACKEND_OPENCV);
    net.setPreferableTarget(DNN_TARGET_CPU);

    cout << "Waiting for video file..." << endl;
    string videoPath = openFileDialog();
    if (videoPath.empty()) return 0;

    VideoCapture cap(videoPath);
    if (!cap.isOpened()) {
        cerr << "Error: ไม่สามารถเปิดวิดีโอได้" << endl;
        return -1;
    }
    int fps = cap.get(CAP_PROP_FPS);
    int delay = (fps > 0) ? (int)(1000 / fps) : 30;

    Mat frame, blob;
    int counter = 0;
    string stage = "none";
    string form_feedback = "Good Form";
    Scalar feedback_color = Scalar(0, 255, 0);

    const int INPUT_WIDTH = 640;
    const int INPUT_HEIGHT = 640;

    while (true) {
        cap >> frame;
        if (frame.empty()) break;

        blobFromImage(frame, blob, 1.0 / 255.0, Size(INPUT_WIDTH, INPUT_HEIGHT), Scalar(0, 0, 0), true, false);
        net.setInput(blob);

        vector<Mat> outputs;
        net.forward(outputs, net.getUnconnectedOutLayersNames());

        Mat out(outputs[0].size[1], outputs[0].size[2], CV_32F, outputs[0].ptr<float>());
        out = out.t();

        float max_confidence = 0.0;
        int best_person_row = -1;
        vector<Point> points(17, Point(-1, -1));

        for (int i = 0; i < out.rows; i++) {
            float class_conf = out.at<float>(i, 4);
            if (class_conf > 0.5 && class_conf > max_confidence) {
                max_confidence = class_conf;
                best_person_row = i;
            }
        }

        if (best_person_row >= 0) {
            float* data = out.ptr<float>(best_person_row);
            float x_scale = (float)frame.cols / INPUT_WIDTH;
            float y_scale = (float)frame.rows / INPUT_HEIGHT;

            for (int k = 0; k < 17; k++) {
                float kx = data[5 + k * 3];
                float ky = data[5 + k * 3 + 1];
                float kconf = data[5 + k * 3 + 2];
                if (kconf > 0.5) {
                    points[k] = Point(cvRound(kx * x_scale), cvRound(ky * y_scale));
                }
            }
        }

        Point right_shoulder = points[6]; Point right_elbow = points[8]; Point right_wrist = points[10];
        Point right_hip = points[12]; Point right_knee = points[14]; Point right_ankle = points[16];
        Point left_shoulder = points[5]; Point left_elbow = points[7]; Point left_wrist = points[9];
        Point left_hip = points[11]; Point left_knee = points[13]; Point left_ankle = points[15];

        if (max_confidence > 0) {

            // ==========================================
            // 1 & 2. Bicep Curl & Triceps Extension (Dumbbell)
            // ==========================================
            if (exercise_type == 1 || exercise_type == 2) {
                if (right_shoulder.x != -1 && right_elbow.x != -1 && right_wrist.x != -1) {
                    line(frame, right_shoulder, right_elbow, Scalar(255, 255, 0), 3);
                    line(frame, right_elbow, right_wrist, Scalar(255, 255, 0), 3);
                    circle(frame, right_shoulder, 6, Scalar(0, 0, 255), FILLED);
                    circle(frame, right_elbow, 6, Scalar(0, 0, 255), FILLED);
                    circle(frame, right_wrist, 6, Scalar(0, 0, 255), FILLED);

                    double elbow_angle = calculate_angle(right_shoulder, right_elbow, right_wrist);
                    double upper_arm_angle = calculate_vertical_angle(right_shoulder, right_elbow);

                    if (exercise_type == 1) { // Bicep Curl
                        if (elbow_angle > 140.0) stage = "down";
                        else if (elbow_angle < 50.0 && stage == "down") {
                            stage = "up"; counter++;
                        }
                        if (upper_arm_angle > 20.0) {
                            form_feedback = "WARNING: Keep your elbow still!";
                            feedback_color = Scalar(0, 0, 255);
                        }
                        else {
                            form_feedback = "Good Form"; feedback_color = Scalar(0, 255, 0);
                        }
                    }
                    else if (exercise_type == 2) { // Triceps Ext.
                        if (elbow_angle < 70.0) stage = "down";
                        else if (elbow_angle > 130.0 && stage == "down") {
                            stage = "up"; counter++;
                        }
                        if (right_elbow.y > right_shoulder.y) {
                            form_feedback = "WARNING: Raise your elbows!";
                            feedback_color = Scalar(0, 0, 255);
                        }
                        else if (upper_arm_angle > 25.0) {
                            form_feedback = "WARNING: Keep elbow straight up!";
                            feedback_color = Scalar(0, 0, 255);
                        }
                        else {
                            form_feedback = "Good Form"; feedback_color = Scalar(0, 255, 0);
                        }
                    }
                }
            }

            // ==========================================
            // 3. Kettlebell Swing
            // ==========================================
            else if (exercise_type == 3) {
                if (right_hip.x != -1 && right_knee.x != -1 && right_ankle.x != -1 &&
                    right_shoulder.x != -1 && right_elbow.x != -1 && right_wrist.x != -1 &&
                    left_hip.x != -1 && left_knee.x != -1 && left_ankle.x != -1 &&
                    left_shoulder.x != -1 && left_elbow.x != -1 && left_wrist.x != -1) {

                    line(frame, right_shoulder, right_hip, Scalar(255, 0, 255), 3);
                    line(frame, right_hip, right_knee, Scalar(255, 0, 255), 3);
                    line(frame, right_knee, right_ankle, Scalar(255, 0, 255), 3);
                    line(frame, right_shoulder, right_elbow, Scalar(255, 0, 255), 3);
                    line(frame, right_elbow, right_wrist, Scalar(255, 0, 255), 3);

                    circle(frame, right_hip, 6, Scalar(0, 255, 255), FILLED);
                    circle(frame, right_knee, 6, Scalar(0, 255, 255), FILLED);
                    circle(frame, right_elbow, 6, Scalar(0, 255, 255), FILLED);
                    circle(frame, right_wrist, 6, Scalar(0, 255, 255), FILLED);

                    line(frame, left_shoulder, left_hip, Scalar(255, 255, 0), 3);
                    line(frame, left_hip, left_knee, Scalar(255, 255, 0), 3);
                    line(frame, left_knee, left_ankle, Scalar(255, 255, 0), 3);
                    line(frame, left_shoulder, left_elbow, Scalar(255, 255, 0), 3);
                    line(frame, left_elbow, left_wrist, Scalar(255, 255, 0), 3);

                    circle(frame, left_hip, 6, Scalar(0, 200, 255), FILLED);
                    circle(frame, left_knee, 6, Scalar(0, 200, 255), FILLED);
                    circle(frame, left_elbow, 6, Scalar(0, 200, 255), FILLED);
                    circle(frame, left_wrist, 6, Scalar(0, 200, 255), FILLED);

                    double avg_hip_angle = (calculate_angle(right_shoulder, right_hip, right_knee) + calculate_angle(left_shoulder, left_hip, left_knee)) / 2.0;
                    double avg_knee_angle = (calculate_angle(right_hip, right_knee, right_ankle) + calculate_angle(left_hip, left_knee, left_ankle)) / 2.0;
                    double avg_elbow_angle = (calculate_angle(right_shoulder, right_elbow, right_wrist) + calculate_angle(left_shoulder, left_elbow, left_wrist)) / 2.0;
                    double avg_shoulder_flexion = (calculate_angle(right_hip, right_shoulder, right_wrist) + calculate_angle(left_hip, left_shoulder, left_wrist)) / 2.0;

                    if (avg_hip_angle < 140.0 && avg_shoulder_flexion < 50.0) stage = "down";
                    else if (avg_hip_angle > 160.0 && avg_shoulder_flexion > 60.0 && stage == "down") {
                        stage = "up"; counter++;
                    }

                    if (avg_knee_angle < 110.0 && avg_hip_angle < 140.0) {
                        form_feedback = "WARNING: Too much knee bend! Hinge hips."; feedback_color = Scalar(0, 0, 255);
                    }
                    else if (avg_elbow_angle < 140.0 && avg_shoulder_flexion > 45.0) {
                        form_feedback = "WARNING: Keep arms straight! Don't pull."; feedback_color = Scalar(0, 165, 255);
                    }
                    else if (avg_shoulder_flexion > 120.0) {
                        form_feedback = "WARNING: Swinging too high!"; feedback_color = Scalar(0, 165, 255);
                    }
                    else if (avg_shoulder_flexion > 70.0 && avg_hip_angle < 150.0) {
                        form_feedback = "WARNING: Squeeze glutes! Extend hips."; feedback_color = Scalar(0, 0, 255);
                    }
                    else {
                        form_feedback = "Good Form"; feedback_color = Scalar(0, 255, 0);
                    }
                }
            }

            // ==========================================
            // 4 & 5. Sumo Squat และ Goblet Squat (Kettlebell)
            // ==========================================
            else if (exercise_type == 4 || exercise_type == 5) {
                if (right_hip.x != -1 && right_knee.x != -1 && right_ankle.x != -1 &&
                    left_hip.x != -1 && left_knee.x != -1 && left_ankle.x != -1) {

                    line(frame, right_shoulder, right_hip, Scalar(255, 0, 255), 3);
                    line(frame, right_hip, right_knee, Scalar(255, 0, 255), 3);
                    line(frame, right_knee, right_ankle, Scalar(255, 0, 255), 3);
                    circle(frame, right_hip, 6, Scalar(0, 255, 255), FILLED);
                    circle(frame, right_knee, 6, Scalar(0, 255, 255), FILLED);
                    circle(frame, right_ankle, 6, Scalar(0, 255, 255), FILLED);

                    line(frame, left_shoulder, left_hip, Scalar(255, 255, 0), 3);
                    line(frame, left_hip, left_knee, Scalar(255, 255, 0), 3);
                    line(frame, left_knee, left_ankle, Scalar(255, 255, 0), 3);
                    circle(frame, left_hip, 6, Scalar(0, 200, 255), FILLED);
                    circle(frame, left_knee, 6, Scalar(0, 200, 255), FILLED);
                    circle(frame, left_ankle, 6, Scalar(0, 200, 255), FILLED);

                    if (exercise_type == 5 && right_elbow.x != -1 && right_wrist.x != -1 && left_elbow.x != -1 && left_wrist.x != -1) {
                        line(frame, right_shoulder, right_elbow, Scalar(255, 0, 255), 3);
                        line(frame, right_elbow, right_wrist, Scalar(255, 0, 255), 3);
                        circle(frame, right_elbow, 6, Scalar(0, 255, 255), FILLED);
                        circle(frame, right_wrist, 6, Scalar(0, 255, 255), FILLED);

                        line(frame, left_shoulder, left_elbow, Scalar(255, 255, 0), 3);
                        line(frame, left_elbow, left_wrist, Scalar(255, 255, 0), 3);
                        circle(frame, left_elbow, 6, Scalar(0, 200, 255), FILLED);
                        circle(frame, left_wrist, 6, Scalar(0, 200, 255), FILLED);
                    }

                    double right_knee_angle = calculate_angle(right_hip, right_knee, right_ankle);
                    double left_knee_angle = calculate_angle(left_hip, left_knee, left_ankle);
                    double torso_angle = calculate_vertical_angle(right_shoulder, right_hip);
                    double avg_knee_angle = (right_knee_angle + left_knee_angle) / 2.0;

                    if (avg_knee_angle < 115.0) stage = "down";
                    else if (avg_knee_angle > 150.0 && stage == "down") {
                        stage = "up"; counter++;
                    }

                    double angle_diff = std::abs(right_knee_angle - left_knee_angle);
                    double knee_dist = std::abs(right_knee.x - left_knee.x);
                    double ankle_dist = std::abs(right_ankle.x - left_ankle.x);

                    if (exercise_type == 4) { // Sumo Squat 
                        if (angle_diff > 25.0 && avg_knee_angle < 150.0) {
                            form_feedback = "WARNING: Imbalance! Keep weight even."; feedback_color = Scalar(0, 0, 255);
                        }
                        else if (knee_dist < ankle_dist * 0.8 && avg_knee_angle < 140.0) {
                            form_feedback = "WARNING: Knees caving in! Push knees out."; feedback_color = Scalar(0, 165, 255);
                        }
                        else {
                            double arm_angle = calculate_vertical_angle(right_shoulder, right_elbow);
                            if (arm_angle > 30.0) {
                                form_feedback = "WARNING: Let arms hang straight down!"; feedback_color = Scalar(0, 165, 255);
                            }
                            else if (torso_angle > 45.0) {
                                form_feedback = "WARNING: Keep chest up!"; feedback_color = Scalar(0, 0, 255);
                            }
                            else {
                                form_feedback = "Good Form"; feedback_color = Scalar(0, 255, 0);
                            }
                        }
                    }
                    else if (exercise_type == 5) { // Goblet Squat
                        double avg_elbow_angle = (calculate_angle(right_shoulder, right_elbow, right_wrist) + calculate_angle(left_shoulder, left_elbow, left_wrist)) / 2.0;

                        if (right_wrist.y > right_elbow.y || left_wrist.y > left_elbow.y || avg_elbow_angle > 110.0) {
                            form_feedback = "WARNING: Hold KB up at your chest! Elbows in."; feedback_color = Scalar(0, 0, 255);
                        }
                        else if (torso_angle > 45.0) {
                            form_feedback = "WARNING: Flat back, chest up!"; feedback_color = Scalar(0, 0, 255);
                        }
                        else if (knee_dist < ankle_dist * 0.7 && right_knee_angle < 140.0) {
                            form_feedback = "WARNING: Knees tracking inline with toes!"; feedback_color = Scalar(0, 165, 255);
                        }
                        else {
                            form_feedback = "Good Form"; feedback_color = Scalar(0, 255, 0);
                        }
                    }
                }
            }

            // ==========================================
            // 6. Bodyweight Squat
            // ==========================================
            else if (exercise_type == 6 && right_hip.x != -1 && right_knee.x != -1 && right_ankle.x != -1 && left_knee.x != -1) {
                line(frame, right_shoulder, right_hip, Scalar(255, 0, 255), 3);
                line(frame, right_hip, right_knee, Scalar(255, 0, 255), 3);
                line(frame, right_knee, right_ankle, Scalar(255, 0, 255), 3);
                circle(frame, right_hip, 6, Scalar(0, 255, 255), FILLED);
                circle(frame, right_knee, 6, Scalar(0, 255, 255), FILLED);

                double right_knee_angle = calculate_angle(right_hip, right_knee, right_ankle);
                double left_knee_angle = calculate_angle(left_hip, left_knee, left_ankle);
                double avg_knee_angle = (right_knee_angle + left_knee_angle) / 2.0;

                if (avg_knee_angle < 115.0) stage = "down";
                else if (avg_knee_angle > 150.0 && stage == "down") {
                    stage = "up"; counter++;
                }

                if (std::abs(right_knee_angle - left_knee_angle) > 20.0 && avg_knee_angle < 150.0) {
                    form_feedback = "WARNING: Imbalance! Weight not centered."; feedback_color = Scalar(0, 0, 255);
                }
                else {
                    form_feedback = "Good Form"; feedback_color = Scalar(0, 255, 0);
                }
            }

            // ==========================================
            // 7. Plank
            // ==========================================
            else if (exercise_type == 7 && right_shoulder.x != -1 && right_hip.x != -1 && right_knee.x != -1) {
                line(frame, right_shoulder, right_hip, Scalar(255, 165, 0), 3);
                line(frame, right_hip, right_knee, Scalar(255, 165, 0), 3);
                circle(frame, right_shoulder, 6, Scalar(0, 255, 255), FILLED);
                circle(frame, right_hip, 6, Scalar(0, 255, 255), FILLED);
                circle(frame, right_knee, 6, Scalar(0, 255, 255), FILLED);

                double body_angle = calculate_angle(right_shoulder, right_hip, right_knee);
                if (body_angle < 150.0) {
                    form_feedback = "WARNING: Hips too high or sagging! Keep body straight."; feedback_color = Scalar(0, 0, 255);
                }
                else {
                    form_feedback = "Good Plank! Hold it."; feedback_color = Scalar(0, 255, 0);
                }
                stage = "holding";
            }

            // ==========================================
            // 8. Push-up
            // ==========================================
            else if (exercise_type == 8 && right_shoulder.x != -1 && right_elbow.x != -1 && right_wrist.x != -1 && right_hip.x != -1) {
                line(frame, right_shoulder, right_elbow, Scalar(0, 255, 255), 3);
                line(frame, right_elbow, right_wrist, Scalar(0, 255, 255), 3);
                line(frame, right_shoulder, right_hip, Scalar(255, 165, 0), 3);
                circle(frame, right_elbow, 6, Scalar(0, 0, 255), FILLED);

                double elbow_angle = calculate_angle(right_shoulder, right_elbow, right_wrist);
                double body_angle = calculate_angle(right_shoulder, right_hip, right_knee);

                if (elbow_angle < 90.0) stage = "down";
                else if (elbow_angle > 150.0 && stage == "down") {
                    stage = "up"; counter++;
                }

                if (body_angle < 150.0) {
                    form_feedback = "WARNING: Keep your back straight!"; feedback_color = Scalar(0, 0, 255);
                }
                else {
                    form_feedback = "Good Form"; feedback_color = Scalar(0, 255, 0);
                }
            }

            // ==========================================
            // 9. Lunge
            // ==========================================
            else if (exercise_type == 9 && right_hip.x != -1 && right_knee.x != -1 && left_knee.x != -1) {
                line(frame, right_hip, right_knee, Scalar(255, 0, 255), 3);
                line(frame, right_knee, right_ankle, Scalar(255, 0, 255), 3);
                line(frame, left_hip, left_knee, Scalar(255, 255, 0), 3);

                double right_knee_angle = calculate_angle(right_hip, right_knee, right_ankle);
                double left_knee_angle = calculate_angle(left_hip, left_knee, left_ankle);
                double min_knee_angle = std::min(right_knee_angle, left_knee_angle);

                if (min_knee_angle < 100.0) stage = "down";
                else if (right_knee_angle > 150.0 && left_knee_angle > 150.0 && stage == "down") {
                    stage = "up"; counter++;
                }

                double torso_angle = calculate_vertical_angle(right_shoulder, right_hip);
                if (torso_angle > 30.0) {
                    form_feedback = "WARNING: Keep your chest up!"; feedback_color = Scalar(0, 0, 255);
                }
                else {
                    form_feedback = "Good Form"; feedback_color = Scalar(0, 255, 0);
                }
            }

            // ==========================================
            // 10. Jumping Jack
            // ==========================================
            else if (exercise_type == 10 && right_wrist.x != -1 && left_wrist.x != -1 && right_ankle.x != -1) {
                line(frame, right_shoulder, right_wrist, Scalar(0, 255, 0), 2);
                line(frame, left_shoulder, left_wrist, Scalar(0, 255, 0), 2);

                double ankle_dist = std::abs(right_ankle.x - left_ankle.x);
                double shoulder_dist = std::abs(right_shoulder.x - left_shoulder.x);

                bool arms_up = (right_wrist.y < right_shoulder.y && left_wrist.y < left_shoulder.y);
                bool legs_apart = (ankle_dist > shoulder_dist * 1.5);

                if (arms_up && legs_apart) {
                    stage = "up";
                }
                else if (!arms_up && !legs_apart && stage == "up") {
                    stage = "down"; counter++;
                }

                if (stage == "up" && !arms_up) {
                    form_feedback = "WARNING: Raise hands higher!"; feedback_color = Scalar(0, 165, 255);
                }
                else {
                    form_feedback = "Good Pace!"; feedback_color = Scalar(0, 255, 0);
                }
            }
        }

        // --- แสดงผล UI บนหน้าจอ ---
        string ex_name = "Exercise";
        if (exercise_type == 1) ex_name = "DB Bicep Curl";
        else if (exercise_type == 2) ex_name = "DB Triceps Ext.";
        else if (exercise_type == 3) ex_name = "KB Swing";
        else if (exercise_type == 4) ex_name = "KB Sumo Squat";
        else if (exercise_type == 5) ex_name = "KB Goblet Squat";
        else if (exercise_type == 6) ex_name = "BW Squat";
        else if (exercise_type == 7) ex_name = "Plank";
        else if (exercise_type == 8) ex_name = "Push-up";
        else if (exercise_type == 9) ex_name = "Lunge";
        else if (exercise_type == 10) ex_name = "Jumping Jack";

        rectangle(frame, Point(10, 10), Point(750, 120), Scalar(0, 0, 0), FILLED);

        if (exercise_type == 7) {
            putText(frame, ex_name + " - Hold Position", Point(20, 50), FONT_HERSHEY_SIMPLEX, 1.2, Scalar(255, 255, 255), 3);
        }
        else {
            putText(frame, ex_name + " Reps: " + to_string(counter), Point(20, 50), FONT_HERSHEY_SIMPLEX, 1.2, Scalar(255, 255, 255), 3);
        }

        putText(frame, form_feedback, Point(20, 100), FONT_HERSHEY_SIMPLEX, 0.8, feedback_color, 2);

        imshow("AI Personal Trainer - YOLOv8", frame);
        if (waitKey(delay) == 27) break;
    }

    cap.release();
    destroyAllWindows();
    return 0;
}