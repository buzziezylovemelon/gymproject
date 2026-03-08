import React, { useState, useRef, useEffect } from 'react';
import * as ort from 'onnxruntime-web';
import { Pose, POSE_CONNECTIONS } from '@mediapipe/pose';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';
import { Camera } from '@mediapipe/camera_utils';

const EXERCISES = {
    Dumbbell: ['Bicep Curl', 'Overhead Triceps Extension'],
    Kettlebell: ['Kettlebell Swing', 'Sumo Squat', 'Goblet Squat'],
    Bodyweight: ['Squat', 'Plank', 'Push-up', 'Lunge', 'Jumping Jack']
};

function calculateAngle(a, b, c) {
    const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs((radians * 180.0) / Math.PI);
    if (angle > 180.0) {
        angle = 360.0 - angle;
    }
    return angle;
}

function calculateVerticalAngle(top, bottom) {
    const dx = top.x - bottom.x;
    const dy = top.y - bottom.y;
    const radians = Math.atan2(Math.abs(dx), Math.abs(dy));
    return (radians * 180.0) / Math.PI;
}

export default function App() {
    const [view, setView] = useState('home');

    // Phase 3 States
    const [reps, setReps] = useState(0);
    const [exerciseStage, setExerciseStage] = useState('down');
    const [feedback, setFeedback] = useState('Good Form');
    const [feedbackColor, setFeedbackColor] = useState('#00FF00');

    return (
        <div className="min-h-screen bg-black text-white font-sans overflow-hidden">
            {view === 'home' && <HomeScreen onPlay={() => setView('camera')} />}
            {view === 'camera' && (
                <CameraView
                    onStop={() => {
                        setView('home');
                        setReps(0);
                        setExerciseStage('down');
                        setFeedback('Good Form');
                        setFeedbackColor('#00FF00');
                    }}
                    reps={reps} setReps={setReps}
                    exerciseStage={exerciseStage} setExerciseStage={setExerciseStage}
                    feedback={feedback} setFeedback={setFeedback}
                    feedbackColor={feedbackColor} setFeedbackColor={setFeedbackColor}
                />
            )}
        </div>
    );
}

function HomeScreen({ onPlay }) {
    return (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-black to-slate-900">
            <div className="mb-12 text-center animate-fade-in-down">
                <h1 className="text-5xl md:text-6xl font-black bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-cyan-400 tracking-tight drop-shadow-sm">
                    Auto-Detection UI
                </h1>
                <p className="mt-4 text-slate-400 text-lg font-light tracking-wide">Your intelligent workout companion</p>
            </div>

            <button
                onClick={onPlay}
                className="relative group flex items-center justify-center w-52 h-52 rounded-full bg-emerald-500 hover:bg-emerald-400 shadow-[0_0_50px_rgba(52,211,153,0.3)] hover:shadow-[0_0_80px_rgba(52,211,153,0.6)] transition-all duration-500 transform hover:scale-105 active:scale-95"
            >
                {/* Outer glowing ring */}
                <div className="absolute -inset-4 rounded-full border border-emerald-500/30 group-hover:border-emerald-400/50 animate-pulse"></div>
                {/* Inner pulsating ring */}
                <div className="absolute inset-0 rounded-full border-4 border-emerald-300/30 animate-ping group-hover:animate-none"></div>

                <svg className="relative w-20 h-20 text-emerald-950 ml-3 drop-shadow-md" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                </svg>
            </button>

            <div className="mt-16 text-emerald-400/80 font-medium tracking-[0.3em] uppercase text-sm animate-pulse">
                Tap to Start
            </div>
        </div>
    );
}

function CameraView({
    onStop,
    reps, setReps,
    exerciseStage, setExerciseStage,
    feedback, setFeedback,
    feedbackColor, setFeedbackColor
}) {
    const videoRef = useRef(null);
    const canvasRef = useRef(null); // Overlay canvas for Phase 3 drawing
    const [detectionMode, setDetectionMode] = useState(null);
    const [activeExercise, setActiveExercise] = useState(null);
    const [session, setSession] = useState(null);

    // Refs for state to use inside MediaPipe onResults safely
    const activeExerciseRef = useRef(activeExercise);
    const repsRef = useRef(reps);
    const stageRef = useRef(exerciseStage);
    const feedbackRef = useRef(feedback);
    const feedbackColorRef = useRef(feedbackColor);

    // Plank Timer Refs
    const plankAccumulatedTime = useRef(0);
    const lastFrameTime = useRef(0);
    const previousHipY = useRef(0);

    useEffect(() => { activeExerciseRef.current = activeExercise; }, [activeExercise]);
    useEffect(() => { repsRef.current = reps; }, [reps]);
    useEffect(() => { stageRef.current = exerciseStage; }, [exerciseStage]);
    useEffect(() => { feedbackRef.current = feedback; }, [feedback]);
    useEffect(() => { feedbackColorRef.current = feedbackColor; }, [feedbackColor]);

    // Exercise initialization
    useEffect(() => {
        if (activeExercise) {
            setReps(0);
            plankAccumulatedTime.current = 0;
            lastFrameTime.current = 0;
            previousHipY.current = 0;
            if (activeExercise === 'Squat' || activeExercise === 'Lunge') {
                setExerciseStage('up');
            } else {
                setExerciseStage('down');
            }
        }
    }, [activeExercise, setReps, setExerciseStage]);

    // 1. Initialize camera
    useEffect(() => {
        let stream = null;
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
            .then(s => {
                stream = s;
                if (videoRef.current) {
                    videoRef.current.srcObject = s;
                }
            })
            .catch(err => console.error("Camera error:", err));

        return () => {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
        };
    }, []);

    // 2. Load ONNX Model
    useEffect(() => {
        let isSubscribed = true;
        ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/';

        const loadModel = async () => {
            try {
                const sess = await ort.InferenceSession.create('/best_10.onnx', { executionProviders: ['wasm'] });
                if (isSubscribed) {
                    setSession(sess);
                    console.log("Model loaded successfully");
                }
            } catch (err) {
                console.error("Error loading ONNX model:", err);
            }
        };
        loadModel();

        return () => {
            isSubscribed = false;
        };
    }, []);

    // 3. Phase 2: YOLOv8 Inference Loop
    useEffect(() => {
        // Toggle Architecture: STOP ONNX SCANNER if activeExercise or detectionMode has fired
        if (detectionMode || activeExercise) return;

        let intervalId;
        const canvas = document.createElement('canvas');
        canvas.width = 416;
        canvas.height = 416;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        let isInferencing = false;
        let hasLoggedDims = false;

        const runInference = async () => {
            if (isInferencing) return;
            if (!session || !videoRef.current || videoRef.current.readyState !== 4) return;

            isInferencing = true;

            const video = videoRef.current;
            const vw = video.videoWidth;
            const vh = video.videoHeight;

            const scale = Math.min(416 / vw, 416 / vh);
            const newWidth = vw * scale;
            const newHeight = vh * scale;

            const xOffset = (416 - newWidth) / 2;
            const yOffset = (416 - newHeight) / 2;

            ctx.fillStyle = '#808080';
            ctx.fillRect(0, 0, 416, 416);
            ctx.drawImage(video, 0, 0, vw, vh, xOffset, yOffset, newWidth, newHeight);

            const imageData = ctx.getImageData(0, 0, 416, 416);
            const data = imageData.data;

            const inputElements = 3 * 416 * 416;
            const inputArray = new Float32Array(inputElements);

            let redOffset = 0;
            let greenOffset = 416 * 416;
            let blueOffset = 2 * 416 * 416;

            for (let i = 0; i < data.length; i += 4) {
                inputArray[redOffset++] = data[i] / 255.0;
                inputArray[greenOffset++] = data[i + 1] / 255.0;
                inputArray[blueOffset++] = data[i + 2] / 255.0;
            }

            try {
                const tensor = new ort.Tensor('float32', inputArray, [1, 3, 416, 416]);
                const feeds = { images: tensor };
                const results = await session.run(feeds);

                const outputTensor = results[Object.keys(results)[0]];
                const outputData = outputTensor.data;

                if (!hasLoggedDims) {
                    console.log('Output Tensor Dims:', outputTensor.dims);
                    hasLoggedDims = true;
                }

                let maxDumbbellConf = 0;
                let maxKettlebellConf = 0;

                const numBoxes = outputTensor.dims[2] || 8400;

                for (let boxIdx = 0; boxIdx < numBoxes; boxIdx++) {
                    const dumbbellConf = outputData[4 * numBoxes + boxIdx];
                    const kettlebellConf = outputData[5 * numBoxes + boxIdx];

                    if (dumbbellConf > maxDumbbellConf) maxDumbbellConf = dumbbellConf;
                    if (kettlebellConf > maxKettlebellConf) maxKettlebellConf = kettlebellConf;
                }

                console.log(`Max DB Conf: ${maxDumbbellConf.toFixed(3)} | Max KB Conf: ${maxKettlebellConf.toFixed(3)}`);

                if (maxDumbbellConf > 0.35) {
                    setDetectionMode('Dumbbell');
                } else if (maxKettlebellConf > 0.35) {
                    setDetectionMode('Kettlebell');
                }

            } catch (err) {
                console.error("Inference error:", err);
            } finally {
                isInferencing = false;
            }
        };

        if (session) {
            intervalId = setInterval(runInference, 500);
        }

        const timer = setTimeout(() => {
            setDetectionMode('Bodyweight');
        }, 5000);

        return () => {
            clearTimeout(timer);
            if (intervalId) clearInterval(intervalId);
        };
    }, [detectionMode, activeExercise, session]);

    // 4. Phase 3: MediaPipe Pose Loop
    useEffect(() => {
        // Toggle Architecture: STOP MEDIAPIPE if no active exercise
        if (!activeExercise) return;

        const pose = new Pose({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
            }
        });

        pose.setOptions({
            modelComplexity: 1,
            smoothLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        pose.onResults((results) => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');

            ctx.save();
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const vw = results.image.width;
            const vh = results.image.height;
            const scale = Math.min(canvas.width / vw, canvas.height / vh);
            const newWidth = vw * scale;
            const newHeight = vh * scale;
            const xOffset = (canvas.width - newWidth) / 2;
            const yOffset = (canvas.height - newHeight) / 2;

            // Strict Letterboxing identical to YOLOv8 background pad
            ctx.fillStyle = '#808080';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Draw Video Frame accurately sized
            ctx.drawImage(results.image, 0, 0, vw, vh, xOffset, yOffset, newWidth, newHeight);

            // Draw Landmarks dynamically scaled onto the letterboxed feed
            if (results.poseLandmarks && activeExerciseRef.current) {
                ctx.translate(xOffset, yOffset);
                ctx.scale(newWidth / canvas.width, newHeight / canvas.height);

                drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS, { color: '#00FF00', lineWidth: 4 });
                drawLandmarks(ctx, results.poseLandmarks, { color: '#FF0000', lineWidth: 2 });

                // Process Custom Math Logic
                const ex = activeExerciseRef.current;
                const landmarks = results.poseLandmarks;

                let newReps = repsRef.current;
                let newStage = stageRef.current;
                let newFeedback = feedbackRef.current;
                let newColor = feedbackColorRef.current;

                if (ex === 'Bicep Curl') {
                    // Right side: 12 (Shoulder), 14 (Elbow), 16 (Wrist)
                    const shoulder = landmarks[12];
                    const elbow = landmarks[14];
                    const wrist = landmarks[16];

                    const angle = calculateAngle(shoulder, elbow, wrist);
                    const upperArmAngle = calculateVerticalAngle(shoulder, elbow);

                    if (upperArmAngle > 20) {
                        newFeedback = "Keep upper arm still!";
                        newColor = "#FF0000";
                    } else {
                        if (angle > 140) {
                            if (newStage === 'up') newReps += 1;
                            newStage = 'down';
                            newFeedback = "Good Form";
                            newColor = "#00FF00";
                        } else if (angle < 50) {
                            newStage = 'up';
                            newFeedback = "Good Form";
                            newColor = "#00FF00";
                        }
                    }
                } else if (ex === 'Squat') {
                    // Right: 24, 26, 28 | Left: 23, 25, 27
                    const rHip = landmarks[24], rKnee = landmarks[26], rAnkle = landmarks[28];
                    const lHip = landmarks[23], lKnee = landmarks[25], lAnkle = landmarks[27];

                    const rAngle = calculateAngle(rHip, rKnee, rAnkle);
                    const lAngle = calculateAngle(lHip, lKnee, lAnkle);
                    const avgAngle = (rAngle + lAngle) / 2;

                    if (Math.abs(rAngle - lAngle) > 20) {
                        newFeedback = "Balance your weight!";
                        newColor = "#FFA500";
                    } else {
                        if (avgAngle < 115) {
                            newStage = 'down';
                            newFeedback = "Good Form";
                            newColor = "#00FF00";
                        } else if (avgAngle > 150) {
                            if (newStage === 'down') newReps += 1;
                            newStage = 'up';
                            newFeedback = "Good Form";
                            newColor = "#00FF00";
                        }
                    }
                } else if (ex === 'Jumping Jack') {
                    // Left: 11 (Shoulder), 15 (Wrist), 27 (Ankle)
                    // Right: 12 (Shoulder), 16 (Wrist), 28 (Ankle)
                    const lShoulder = landmarks[11], rShoulder = landmarks[12];
                    const lWrist = landmarks[15], rWrist = landmarks[16];
                    const lAnkle = landmarks[27], rAnkle = landmarks[28];

                    // 1. Distance calculation on x-axis
                    const ankleDist = Math.abs(lAnkle.x - rAnkle.x);
                    const shoulderDist = Math.abs(lShoulder.x - rShoulder.x);

                    // 2. Pose Conditions
                    // Note: smaller y means "higher" visually on canvas
                    const armsUp = (rWrist.y < rShoulder.y) && (lWrist.y < lShoulder.y);
                    const legsApart = ankleDist > (shoulderDist * 1.5);

                    // 3 & 4. State Machine & Form Feedback
                    if (armsUp && legsApart) {
                        newStage = 'up';
                        newFeedback = "Good Pace!";
                        newColor = "#00FF00";
                    } else if (!armsUp && !legsApart) {
                        if (newStage === 'up') {
                            newReps += 1;
                            newStage = 'down';
                        }
                        newFeedback = "Good Pace!";
                        newColor = "#00FF00";
                    } else if (newStage === 'up' && !armsUp) {
                        newFeedback = "WARNING: Raise hands higher!";
                        newColor = "#FFA500";
                    }
                } else if (ex === 'Lunge') {
                    // Right: 24 (Hip), 26 (Knee), 28 (Ankle)
                    // Left: 23 (Hip), 25 (Knee), 27 (Ankle)
                    // Torso (Right side): 12 (Right Shoulder), 24 (Right Hip)

                    const rHip = landmarks[24], rKnee = landmarks[26], rAnkle = landmarks[28];
                    const lHip = landmarks[23], lKnee = landmarks[25], lAnkle = landmarks[27];
                    const rShoulder = landmarks[12];

                    // 1. Angle Calculations
                    const rightKneeAngle = calculateAngle(rHip, rKnee, rAnkle);
                    const leftKneeAngle = calculateAngle(lHip, lKnee, lAnkle);
                    const minKneeAngle = Math.min(rightKneeAngle, leftKneeAngle);
                    const torsoAngle = calculateVerticalAngle(rShoulder, rHip);

                    // 3. Form Feedback (Evaluated before state update to ensure defaults are set)
                    if (torsoAngle > 30.0) {
                        newFeedback = "WARNING: Keep your chest up!";
                        newColor = "#FF0000";
                    } else {
                        newFeedback = "Good Form";
                        newColor = "#00FF00";
                    }

                    // 2. State Machine & Rep Counting
                    if (minKneeAngle < 100.0) {
                        newStage = 'down';
                    } else if (rightKneeAngle > 150.0 && leftKneeAngle > 150.0) {
                        if (newStage === 'down') {
                            newReps += 1;
                            newStage = 'up';
                        }
                    }
                } else if (ex === 'Push-up') {
                    // Right side: 12 (Shoulder), 24 (Hip), 28 (Ankle)
                    const rShoulder = landmarks[12];
                    const rHip = landmarks[24];
                    const rAnkle = landmarks[28];

                    // Smart Push-up Logic (No Elbow Reliance)
                    const bodyAngle = calculateAngle(rShoulder, rHip, rAnkle);

                    if (bodyAngle < 140.0) {
                        newFeedback = "WARNING: Keep your back straight!";
                        newColor = "#FF0000";
                    } else {
                        newFeedback = "Good Form";
                        newColor = "#00FF00";

                        // Depth Calculation
                        // Normalized Canvas: smaller y is higher up screen.
                        const verticalDist = rHip.y - rShoulder.y;

                        if (verticalDist < 0.05) {
                            newStage = 'down';
                        } else if (verticalDist > 0.15 && newStage === 'down') {
                            newReps += 1;
                            newStage = 'up';
                        }
                    }
                } else if (ex === 'Plank') {
                    // Right side: 12 (Shoulder), 14 (Elbow), 16 (Wrist), 24 (Hip), 28 (Ankle)
                    const rShoulder = landmarks[12], rElbow = landmarks[14], rWrist = landmarks[16];
                    const rHip = landmarks[24], rAnkle = landmarks[28];
                    // Left side: 11 (Shoulder), 13 (Elbow), 15 (Wrist)
                    const lShoulder = landmarks[11], lElbow = landmarks[13], lWrist = landmarks[15];

                    const currentTime = performance.now();
                    const deltaTime = lastFrameTime.current === 0 ? 0 : currentTime - lastFrameTime.current;
                    lastFrameTime.current = currentTime;

                    // Support Calculations (Arms)
                    const leftElbowAngle = calculateAngle(lShoulder, lElbow, lWrist);
                    const rightElbowAngle = calculateAngle(rShoulder, rElbow, rWrist);

                    const areElbowsBent = (leftElbowAngle > 65.0 && leftElbowAngle < 120.0) &&
                        (rightElbowAngle > 65.0 && rightElbowAngle < 120.0);
                    // Canvas: smaller y is visually higher
                    const areShouldersElevated = (lShoulder.y < lElbow.y) && (rShoulder.y < rElbow.y);

                    // Body Calculations
                    const bodyAngle = calculateAngle(rShoulder, rHip, rAnkle);
                    const torsoAngle = calculateVerticalAngle(rShoulder, rHip);
                    const movementDelta = previousHipY.current === 0 ? 0 : Math.abs(rHip.y - previousHipY.current);
                    previousHipY.current = rHip.y;

                    // Combined Strict Rulebase
                    const isStraight = bodyAngle > 145.0;
                    const isHorizontal = torsoAngle > 65.0 && torsoAngle < 115.0;
                    const isStill = movementDelta <= 0.008;

                    // Update Timer Conditions
                    if (!areElbowsBent || !areShouldersElevated) {
                        newFeedback = "WARNING: Rest on both forearms!";
                        newColor = "#FFA500";
                    } else if (!isHorizontal) {
                        newFeedback = "WARNING: Get into a horizontal plank position!";
                        newColor = "#FFA500";
                    } else if (isHorizontal && !isStraight) {
                        newFeedback = "WARNING: Keep your back straight!";
                        newColor = "#FF0000";
                    } else if (isHorizontal && isStraight && !isStill) {
                        newFeedback = "WARNING: Hold still!";
                        newColor = "#FFA500";
                    } else if (isHorizontal && isStraight && isStill) {
                        plankAccumulatedTime.current += deltaTime;
                        newReps = Math.floor(plankAccumulatedTime.current / 1000);
                        newFeedback = "Good Plank! Hold it.";
                        newColor = "#00FF00";
                    }
                }

                // Batch updates
                if (newReps !== repsRef.current) setReps(newReps);
                if (newStage !== stageRef.current) setExerciseStage(newStage);
                if (newFeedback !== feedbackRef.current) setFeedback(newFeedback);
                if (newColor !== feedbackColorRef.current) setFeedbackColor(newColor);
            }
            ctx.restore();
        });

        // Loop via requestAnimationFrame so we don't break the base videoFeed manually
        let animationFrameId;
        const processPose = async () => {
            if (!activeExerciseRef.current) return;
            try {
                if (videoRef.current && videoRef.current.readyState >= 2) {
                    await pose.send({ image: videoRef.current });
                }
            } catch (e) {
                console.error("Pose inference error:", e);
            }
            if (activeExerciseRef.current) {
                animationFrameId = requestAnimationFrame(processPose);
            }
        };
        processPose();

        return () => {
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
            pose.close();
        };

    }, [activeExercise, setReps, setExerciseStage, setFeedback, setFeedbackColor]);


    const handleDevTrigger = (mode) => {
        setDetectionMode(mode);
    };

    const handleReset = () => {
        setDetectionMode(null);
        setActiveExercise(null);
        setReps(0);
        setExerciseStage('down');
        setFeedback('Good Form');
        setFeedbackColor('#00FF00');
    };

    const currentExercises = detectionMode ? EXERCISES[detectionMode] : [];
    const isSidebarOpen = detectionMode !== null && activeExercise === null;

    return (
        <div className="absolute inset-0 bg-black overflow-hidden bg-gradient-to-tr from-slate-900/40 to-black">
            {/* Raw Video Feed (Hidden completely during MediaPipe track to stop z-index overlap, but kept alive) */}
            <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`absolute inset-0 w-full h-full object-cover transform scale-x-[-1] z-0 ${activeExercise ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
            />

            {/* MediaPipe Phase 3 Visual Canvas */}
            {activeExercise && (
                <canvas
                    ref={canvasRef}
                    width={1024}
                    height={1024}
                    className="absolute inset-0 w-full h-full object-contain transform scale-x-[-1] z-10"
                />
            )}

            {/* Scanning status (top overlay) */}
            {!activeExercise && !detectionMode && (
                <div className="absolute top-12 left-1/2 -translate-x-1/2 z-20 flex items-center gap-4 py-3 px-8 rounded-full bg-black/40 backdrop-blur-md border border-white/5 shadow-2xl transition-all duration-500 ease-in-out font-medium">
                    <div className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span>
                    </div>
                    <span className="text-white tracking-widest text-sm uppercase opacity-90">Scanning for equipment...</span>
                </div>
            )}

            {/* Dev Buttons (bottom overlay) */}
            {!activeExercise && (
                <div className="absolute bottom-10 left-0 w-full z-40 flex flex-wrap justify-center items-center gap-3 px-4">
                    <button
                        onClick={() => handleDevTrigger('Dumbbell')}
                        className="px-6 py-3 bg-white/5 text-slate-300 backdrop-blur-lg border border-white/10 rounded-2xl text-xs font-bold tracking-widest uppercase hover:bg-white/10 hover:border-emerald-500/50 hover:text-white transition-all transform hover:-translate-y-1 active:scale-95 shadow-xl"
                    >
                        [Detect Dumbbell]
                    </button>
                    <button
                        onClick={() => handleDevTrigger('Kettlebell')}
                        className="px-6 py-3 bg-white/5 text-slate-300 backdrop-blur-lg border border-white/10 rounded-2xl text-xs font-bold tracking-widest uppercase hover:bg-white/10 hover:border-emerald-500/50 hover:text-white transition-all transform hover:-translate-y-1 active:scale-95 shadow-xl"
                    >
                        [Detect Kettlebell]
                    </button>
                    <button
                        onClick={handleReset}
                        className="px-6 py-3 bg-red-500/10 text-red-300 backdrop-blur-lg border border-red-500/20 rounded-2xl text-xs font-bold tracking-widest uppercase hover:bg-red-500/20 hover:text-white transition-all transform hover:-translate-y-1 active:scale-95 shadow-xl"
                    >
                        [Reset]
                    </button>
                </div>
            )}

            {/* Full screen backdrop for Sidebar */}
            <div
                className={`absolute inset-0 z-20 bg-black/60 backdrop-blur-sm transition-opacity duration-700 pointer-events-none ${isSidebarOpen ? 'opacity-100' : 'opacity-0'}`}
            ></div>

            {/* Sidebar Panel */}
            <div
                className={`absolute top-0 left-0 h-full w-full sm:w-96 bg-zinc-950/90 backdrop-blur-xl border-r border-white/5 z-30 transform transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] flex flex-col shadow-[30px_0_50px_rgba(0,0,0,0.7)] ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
            >
                <div className="p-10 pb-8 flex-shrink-0 bg-gradient-to-b from-white/5 to-transparent">
                    <h3 className="text-emerald-500 text-xs font-black tracking-[0.3em] uppercase mb-4 opacity-80">Mode Verified</h3>
                    <h2 className="text-4xl lg:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-300 drop-shadow-md">
                        {detectionMode}
                    </h2>
                    <div className="w-12 h-1 bg-gradient-to-r from-emerald-500 to-transparent mt-6 mb-4 rounded-full"></div>
                    <p className="text-slate-400 text-sm font-light leading-relaxed">
                        Select an exercise program below to begin tracking your reps.
                    </p>
                </div>

                <div className="flex-1 overflow-y-auto w-full p-6 space-y-3">
                    {currentExercises.map((ex, idx) => (
                        <button
                            key={idx}
                            onClick={() => setActiveExercise(ex)}
                            className="w-full flex items-center justify-between p-6 bg-white/[0.02] hover:bg-emerald-500/10 border border-white/5 hover:border-emerald-500/40 rounded-2xl transition-all duration-300 group shadow-lg"
                        >
                            <span className="text-lg font-bold text-slate-300 group-hover:text-white transition-colors tracking-wide">{ex}</span>
                            <div className="text-emerald-400 opacity-0 group-hover:opacity-100 transform -translate-x-6 group-hover:translate-x-0 transition-all duration-300 ease-out flex items-center justify-center w-10 h-10 rounded-full bg-emerald-500/20 shadow-[0_0_15px_rgba(52,211,153,0.3)]">
                                <svg className="w-5 h-5 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                                </svg>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Active Exercise Interactive View & Rep Counters */}
            {activeExercise && (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-between pointer-events-none">
                    {/* Top Stats Overlay */}
                    <div className="w-full flex justify-between items-start p-8">
                        <div className="bg-black/60 backdrop-blur-xl border border-white/20 px-8 py-5 rounded-3xl shadow-[0_0_30px_rgba(0,0,0,0.5)]">
                            <h3 className="text-emerald-400 text-xs font-black tracking-[0.2em] uppercase mb-1">
                                {activeExercise === 'Plank' ? 'Timer' : 'Total Reps'}
                            </h3>
                            <p className="text-6xl md:text-7xl font-black text-white leading-none tracking-tighter">
                                {reps}
                                {activeExercise === 'Plank' && <span className="text-2xl ml-2 text-emerald-400">sec</span>}
                            </p>
                        </div>
                        <div
                            className="bg-black/60 backdrop-blur-xl border px-8 py-5 rounded-3xl shadow-[0_0_30px_rgba(0,0,0,0.5)] transition-all duration-300 flex flex-col justify-center items-end"
                            style={{ borderColor: `${feedbackColor}50` }}
                        >
                            <h3 className="text-xs font-black tracking-[0.2em] uppercase mb-1" style={{ color: feedbackColor }}>Form Status</h3>
                            <p className="text-xl md:text-2xl font-black text-white uppercase tracking-wide text-right">{feedback}</p>
                            <h2 className="text-sm font-bold text-gray-400 mt-2">{activeExercise}</h2>
                        </div>
                    </div>

                    <div className="absolute bottom-16 left-1/2 -translate-x-1/2 pointer-events-auto">
                        <button
                            onClick={onStop}
                            className="group flex items-center gap-4 px-10 py-5 bg-gradient-to-br from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-bold text-lg tracking-wide rounded-full shadow-[0_10px_40px_rgba(220,38,38,0.4)] hover:shadow-[0_20px_60px_rgba(220,38,38,0.6)] transition-all transform hover:scale-105 active:scale-95 border border-red-400/30"
                        >
                            <div className="w-5 h-5 bg-white rounded flex-shrink-0 flex items-center justify-center">
                                <div className="w-2 h-2 bg-red-600 rounded-sm"></div>
                            </div>
                            Stop Workout
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
