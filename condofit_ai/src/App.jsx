import React, { useState, useRef, useEffect } from 'react';
import html2canvas from 'html2canvas';
import * as ort from 'onnxruntime-web';
import { Pose, POSE_CONNECTIONS } from '@mediapipe/pose';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';
import { Camera } from '@mediapipe/camera_utils';

const EXERCISES = {
    Dumbbell: ['Bicep Curl', 'Side Lateral', 'Dumbbell Press'],
    Kettlebell: ['Single-Arm Row', 'Sumo Squat', 'Goblet Squat'],
    Bodyweight: ['Squat', 'Plank', 'Push-up', 'Lunge', 'Jumping Jack']
};

export const VIDEO_PATHS = {
    'Bicep Curl': '/videos/Bicep curl.mp4',
    'Side Lateral': '/videos/Side lateral.mp4',
    'Dumbbell Press': '/videos/Dumbbell press.mp4',
    'Single-Arm Row': '/videos/Single arm row.mp4',
    'Sumo Squat': '/videos/Sumo squat.mp4',
    'Goblet Squat': '/videos/Goblet squat.mp4',
    'Squat': '/videos/squat.mp4',
    'Plank': '/videos/plank.mp4',
    'Push-up': '/videos/pushup.mp4',
    'Lunge': '/videos/lunge.mp4',
    'Jumping Jack': '/videos/jumping-jack.mp4'
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
    const [sets, setSets] = useState(1);
    const [isResting, setIsResting] = useState(false);
    const [exerciseStage, setExerciseStage] = useState('down');
    const [feedback, setFeedback] = useState('Good Form');
    const [feedbackColor, setFeedbackColor] = useState('#00FF00');

    // Workout Timer & Summary States
    const [workoutStartTime, setWorkoutStartTime] = useState(null);
    const [workoutElapsed, setWorkoutElapsed] = useState(0);
    const [showSummary, setShowSummary] = useState(false);
    const [summaryData, setSummaryData] = useState(null); // { exercises: [{exercise, sets, reps}], elapsed }
    const summaryCardRef = useRef(null);

    // Workout Timer Effect
    useEffect(() => {
        if (!workoutStartTime || showSummary) return;
        const interval = setInterval(() => {
            setWorkoutElapsed(Math.floor((Date.now() - workoutStartTime) / 1000));
        }, 1000);
        return () => clearInterval(interval);
    }, [workoutStartTime, showSummary]);

    const formatTime = (totalSeconds) => {
        const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
        const s = (totalSeconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    const handleCloseSummary = () => {
        setShowSummary(false);
        setSummaryData(null);
        setView('home');
        setReps(0);
        setSets(1);
        setIsResting(false);
        setExerciseStage('down');
        setFeedback('Good Form');
        setFeedbackColor('#00FF00');
        setWorkoutStartTime(null);
        setWorkoutElapsed(0);
    };

    const handleDownloadStat = async () => {
        if (!summaryCardRef.current) return;
        try {
            const canvas = await html2canvas(summaryCardRef.current, {
                backgroundColor: null,
                scale: 2,
                useCORS: true,
            });
            const link = document.createElement('a');
            link.download = `workout-summary-${Date.now()}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        } catch (err) {
            console.error('Download failed:', err);
        }
    };

    const handleDownloadTransparent = async () => {
        if (!summaryData) return;
        const container = document.createElement('div');
        container.style.cssText = `
            position: fixed; left: -9999px; top: -9999px;
            width: 540px; padding: 48px 32px;
            font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
            color: white;
        `;
        const exerciseRows = summaryData.exercises.map(e => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 0; border-bottom:1px solid rgba(255,255,255,0.08);">
                <div style="font-size:18px; font-weight:800; color:white;">${e.exercise}</div>
                <div style="display:flex; gap:24px;">
                    <div style="text-align:center;"><div style="font-size:10px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:rgba(255,255,255,0.4); margin-bottom:2px;">Sets</div><div style="font-size:20px; font-weight:900; color:white;">${e.sets}</div></div>
                    <div style="text-align:center;"><div style="font-size:10px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:rgba(255,255,255,0.4); margin-bottom:2px;">Reps</div><div style="font-size:20px; font-weight:900; color:white;">${e.reps}</div></div>
                </div>
            </div>
        `).join('');
        container.innerHTML = `
            <div style="text-align:center; margin-bottom:28px;">
                <div style="font-size:11px; font-weight:900; letter-spacing:0.3em; text-transform:uppercase; color:#34d399; margin-bottom:6px;">Workout Complete</div>
                <div style="font-size:36px; font-weight:900; color:white;">${formatTime(summaryData.elapsed)}</div>
                <div style="font-size:11px; font-weight:700; letter-spacing:0.15em; text-transform:uppercase; color:rgba(255,255,255,0.4); margin-top:4px;">Total Time</div>
            </div>
            <div style="margin-bottom:20px;">${exerciseRows}</div>
            <div style="text-align:center;">
                <div style="font-size:10px; font-weight:600; letter-spacing:0.2em; text-transform:uppercase; color:rgba(255,255,255,0.25);">CondoFit AI</div>
            </div>
        `;
        document.body.appendChild(container);
        try {
            const canvas = await html2canvas(container, {
                backgroundColor: null,
                scale: 3,
            });
            const link = document.createElement('a');
            link.download = `workout-transparent-${Date.now()}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        } catch (err) {
            console.error('Transparent download failed:', err);
        } finally {
            document.body.removeChild(container);
        }
    };

    return (
        <div className="min-h-screen bg-black text-white font-sans overflow-hidden">
            {view === 'home' && <HomeScreen onPlay={() => setView('camera')} />}
            {view === 'camera' && (
                <CameraView
                    onStop={(exerciseLog) => {
                        setSummaryData({
                            exercises: exerciseLog,
                            elapsed: workoutElapsed,
                        });
                        setShowSummary(true);
                    }}
                    reps={reps} setReps={setReps}
                    sets={sets} setSets={setSets}
                    isResting={isResting} setIsResting={setIsResting}
                    exerciseStage={exerciseStage} setExerciseStage={setExerciseStage}
                    feedback={feedback} setFeedback={setFeedback}
                    feedbackColor={feedbackColor} setFeedbackColor={setFeedbackColor}
                    workoutStartTime={workoutStartTime}
                    setWorkoutStartTime={setWorkoutStartTime}
                />
            )}

            {/* Post-Workout Summary Modal */}
            {showSummary && summaryData && (
                <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4 animate-fade-in overflow-y-auto">
                    <div className="flex flex-col items-center gap-6 max-w-lg w-full my-auto">

                        {/* Stats Card (captured for download) */}
                        <div
                            ref={summaryCardRef}
                            className="w-full rounded-3xl p-8 relative overflow-hidden"
                            style={{
                                background: 'linear-gradient(135deg, rgba(16,185,129,0.15) 0%, rgba(6,182,212,0.10) 50%, rgba(0,0,0,0) 100%)',
                                border: '1px solid rgba(255,255,255,0.1)',
                            }}
                        >
                            {/* Decorative accent */}
                            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-cyan-400 to-emerald-500 rounded-t-3xl"></div>

                            {/* Header */}
                            <div className="mb-6 text-center">
                                <p className="text-emerald-400 text-xs font-black tracking-[0.3em] uppercase mb-2">Workout Complete</p>
                                <p className="text-4xl md:text-5xl font-black text-white tracking-tight leading-none">{formatTime(summaryData.elapsed)}</p>
                                <p className="text-slate-400 text-[10px] font-bold tracking-[0.2em] uppercase mt-2">Total Time</p>
                            </div>

                            {/* Divider */}
                            <div className="w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent mb-5"></div>

                            {/* Per-Exercise Rows */}
                            <div className="space-y-3">
                                {summaryData.exercises.map((entry, idx) => (
                                    <div key={idx} className="bg-white/[0.04] backdrop-blur-sm border border-white/10 rounded-2xl px-5 py-4 flex items-center justify-between">
                                        <div>
                                            <p className="text-white font-bold text-base tracking-wide">{entry.exercise}</p>
                                        </div>
                                        <div className="flex gap-6">
                                            <div className="text-center">
                                                <p className="text-slate-400 text-[9px] font-bold tracking-[0.15em] uppercase">Sets</p>
                                                <p className="text-2xl font-black text-white leading-none mt-1">{entry.sets}</p>
                                            </div>
                                            <div className="text-center">
                                                <p className="text-slate-400 text-[9px] font-bold tracking-[0.15em] uppercase">Reps</p>
                                                <p className="text-2xl font-black text-white leading-none mt-1">{entry.reps}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Branding Footer */}
                            <div className="mt-6 text-center">
                                <p className="text-slate-600 text-[10px] font-medium tracking-[0.2em] uppercase">CondoFit AI</p>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="w-full flex flex-col gap-3">
                            <button
                                onClick={handleDownloadStat}
                                className="w-full py-4 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-emerald-500/50 text-white rounded-2xl text-base font-bold tracking-widest uppercase transition-all transform hover:-translate-y-0.5 active:scale-[0.98] flex items-center justify-center gap-3 shadow-xl"
                            >
                                <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                Download Stat
                            </button>
                            <button
                                onClick={handleDownloadTransparent}
                                className="w-full py-4 bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 hover:from-emerald-500/20 hover:to-cyan-500/20 border border-emerald-500/30 hover:border-emerald-400/60 text-white rounded-2xl text-base font-bold tracking-widest uppercase transition-all transform hover:-translate-y-0.5 active:scale-[0.98] flex items-center justify-center gap-3 shadow-xl"
                            >
                                <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                Download Transparent
                            </button>
                            <button
                                onClick={handleCloseSummary}
                                className="w-full py-5 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-white rounded-2xl text-xl font-black tracking-widest uppercase transition-all shadow-[0_10px_40px_rgba(52,211,153,0.3)] hover:shadow-[0_15px_60px_rgba(52,211,153,0.5)] transform hover:-translate-y-1 active:scale-95 flex items-center justify-center gap-3 border border-white/20"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
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
    sets, setSets,
    isResting, setIsResting,
    exerciseStage, setExerciseStage,
    feedback, setFeedback,
    feedbackColor, setFeedbackColor,
    workoutStartTime, setWorkoutStartTime
}) {
    const videoRef = useRef(null);
    const canvasRef = useRef(null); // Overlay canvas for Phase 3 drawing
    const [detectionMode, setDetectionMode] = useState(null);
    const [activeExercise, setActiveExercise] = useState(null);
    const [session, setSession] = useState(null);
    const [selectedVideo, setSelectedVideo] = useState(null);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    // Track total reps across all sets
    const totalRepsRef = useRef(0);

    // Track stats per exercise across the workout
    const workoutLogRef = useRef([]);
    const prevExerciseRef = useRef(null);

    // Refs for state to use inside MediaPipe onResults safely
    const activeExerciseRef = useRef(activeExercise);
    const repsRef = useRef(reps);
    const isRestingRef = useRef(isResting);
    const stageRef = useRef(exerciseStage);
    const feedbackRef = useRef(feedback);
    const feedbackColorRef = useRef(feedbackColor);

    // Plank Timer Refs
    const plankAccumulatedTime = useRef(0);
    const lastFrameTime = useRef(0);
    const previousHipY = useRef(0);
    const baselineHipY = useRef(0);

    useEffect(() => { activeExerciseRef.current = activeExercise; }, [activeExercise]);
    useEffect(() => { repsRef.current = reps; }, [reps]);
    useEffect(() => { isRestingRef.current = isResting; }, [isResting]);
    useEffect(() => { stageRef.current = exerciseStage; }, [exerciseStage]);
    useEffect(() => { feedbackRef.current = feedback; }, [feedback]);
    useEffect(() => { feedbackColorRef.current = feedbackColor; }, [feedbackColor]);

    // Exercise initialization
    useEffect(() => {
        if (activeExercise) {
            // Save previous exercise stats to the log if switching
            if (prevExerciseRef.current && prevExerciseRef.current !== activeExercise) {
                workoutLogRef.current.push({
                    exercise: prevExerciseRef.current,
                    sets: sets,
                    reps: totalRepsRef.current + reps,
                });
            }
            prevExerciseRef.current = activeExercise;
            setReps(0);
            setSets(1);
            setIsResting(false);
            totalRepsRef.current = 0;
            plankAccumulatedTime.current = 0;
            lastFrameTime.current = 0;
            previousHipY.current = 0;
            baselineHipY.current = 0;
            if (activeExercise === 'Squat' || activeExercise === 'Lunge' || activeExercise === 'Sumo Squat' || activeExercise === 'Goblet Squat') {
                setExerciseStage('up');
            } else if (activeExercise === 'Push-up') {
                setExerciseStage('setup');
            } else {
                setExerciseStage('down');
            }
            // Start the workout timer on first exercise
            if (!workoutStartTime) {
                setWorkoutStartTime(Date.now());
            }
        }
    }, [activeExercise, setReps, setExerciseStage, workoutStartTime, setWorkoutStartTime]);

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

                // Pause rep counting and form checking during rest
                if (isRestingRef.current) {
                    ctx.restore();
                    return;
                }

                // Process Custom Math Logic
                const ex = activeExerciseRef.current;
                const landmarks = results.poseLandmarks;

                let newReps = repsRef.current;
                let newStage = stageRef.current;
                let newFeedback = feedbackRef.current;
                let newColor = feedbackColorRef.current;

                if (ex === 'Bicep Curl') {
                    // Dynamic Side Detection (Visibility Check)
                    const leftVis = (landmarks[11].visibility + landmarks[13].visibility + landmarks[15].visibility + landmarks[23].visibility) / 4;
                    const rightVis = (landmarks[12].visibility + landmarks[14].visibility + landmarks[16].visibility + landmarks[24].visibility) / 4;

                    const isLeft = leftVis > rightVis;

                    const shoulder = isLeft ? landmarks[11] : landmarks[12];
                    const elbow = isLeft ? landmarks[13] : landmarks[14];
                    const wrist = isLeft ? landmarks[15] : landmarks[16];
                    const hip = isLeft ? landmarks[23] : landmarks[24];

                    // Strict Form Tracking (Geometry & Angles)
                    const elbowAngle = calculateAngle(shoulder, elbow, wrist);
                    const upperArmAngle = calculateAngle(hip, shoulder, elbow);

                    // Strict State Machine & Cheat Prevention
                    if (upperArmAngle > 35.0) {
                        newFeedback = "WARNING: Lock your elbow to your side!";
                        newColor = "#FF0000";
                    } else {
                        if (newStage === 'up' && elbowAngle > 150.0) {
                            newStage = 'down';
                            newFeedback = "Good! Now curl up.";
                            newColor = "#00FF00";
                        } else if (newStage === 'down' && elbowAngle < 40.0) {
                            newReps += 1;
                            newStage = 'up';
                            newFeedback = "Perfect Curl!";
                            newColor = "#00FF00";
                        }
                    }
                } else if (ex === 'Side Lateral') {
                    // Symmetrical Front-Facing Tracking (Both Arms)
                    const lShoulder = landmarks[11], lElbow = landmarks[13], lWrist = landmarks[15], lHip = landmarks[23];
                    const rShoulder = landmarks[12], rElbow = landmarks[14], rWrist = landmarks[16], rHip = landmarks[24];

                    // Calculate Angles
                    // Arm Straightness (T-Rex Arm Check)
                    const lArmAngle = calculateAngle(lShoulder, lElbow, lWrist);
                    const rArmAngle = calculateAngle(rShoulder, rElbow, rWrist);

                    // Lateral Raise Height (Angle between Hip, Shoulder, Elbow)
                    const lRaiseAngle = calculateAngle(lHip, lShoulder, lElbow);
                    const rRaiseAngle = calculateAngle(rHip, rShoulder, rElbow);

                    // Strict State Machine & Cheat Prevention
                    if (lArmAngle < 130.0 || rArmAngle < 130.0) {
                        newFeedback = "WARNING: Keep both arms straight!";
                        newColor = "#FFA500";
                    } else {
                        if (newStage === 'up' && lRaiseAngle < 35.0 && rRaiseAngle < 35.0) {
                            newStage = 'down';
                            newFeedback = "Good! Raise to shoulder height.";
                            newColor = "#00FF00";
                        } else if (newStage === 'down' && lRaiseAngle > 75.0 && rRaiseAngle > 75.0) {
                            newReps += 1;
                            newStage = 'up';
                            newFeedback = "Perfect Raise!";
                            newColor = "#00FF00";
                        }
                    }
                } else if (ex === 'Dumbbell Press') {
                    // Symmetrical Front-Facing Tracking
                    const lShoulder = landmarks[11], lElbow = landmarks[13], lWrist = landmarks[15];
                    const rShoulder = landmarks[12], rElbow = landmarks[14], rWrist = landmarks[16];

                    // Calculate Angles & Positions
                    const lElbowAngle = calculateAngle(lShoulder, lElbow, lWrist);
                    const rElbowAngle = calculateAngle(rShoulder, rElbow, rWrist);

                    const isOverhead = (lWrist.y < lShoulder.y) && (rWrist.y < rShoulder.y);
                    const armDifference = Math.abs(lElbowAngle - rElbowAngle);

                    // Strict State Machine & Cheat Prevention
                    if (!isOverhead) {
                        newFeedback = "WARNING: Keep weights above your shoulders!";
                        newColor = "#FF0000";
                    } else if (armDifference > 35.0) {
                        newFeedback = "WARNING: Press both arms evenly!";
                        newColor = "#FFA500";
                    } else {
                        if (newStage === 'up' && lElbowAngle < 90.0 && rElbowAngle < 90.0) {
                            newStage = 'down';
                            newFeedback = "Good! Push to the top.";
                            newColor = "#00FF00";
                        } else if (newStage === 'down' && lElbowAngle > 150.0 && rElbowAngle > 150.0) {
                            newReps += 1;
                            newStage = 'up';
                            newFeedback = "Perfect Press!";
                            newColor = "#00FF00";
                        }
                    }
                } else if (ex === 'Single-Arm Row') {
                    // Dynamic Side Detection (Visibility Check)
                    const leftVis = (landmarks[11].visibility + landmarks[13].visibility + landmarks[15].visibility + landmarks[23].visibility + landmarks[25].visibility) / 5;
                    const rightVis = (landmarks[12].visibility + landmarks[14].visibility + landmarks[16].visibility + landmarks[24].visibility + landmarks[26].visibility) / 5;

                    const isLeft = leftVis > rightVis;

                    const shoulder = isLeft ? landmarks[11] : landmarks[12];
                    const elbow = isLeft ? landmarks[13] : landmarks[14];
                    const wrist = isLeft ? landmarks[15] : landmarks[16];
                    const hip = isLeft ? landmarks[23] : landmarks[24];
                    const knee = isLeft ? landmarks[25] : landmarks[26];

                    // Calculate Metrics (The "True Lean" & Arm Extension)
                    const torsoDx = Math.abs(shoulder.x - hip.x);
                    const torsoDy = Math.abs(shoulder.y - hip.y);
                    const isBentOver = torsoDx > (torsoDy * 0.6); // Requires horizontal reach to prove they are bending forward, not just sitting.

                    const elbowAngle = calculateAngle(shoulder, elbow, wrist);

                    // Strict State Machine & Cheat Prevention
                    if (!isBentOver) {
                        newFeedback = "WARNING: Lean forward (back near parallel)!";
                        newColor = "#FF0000";
                    } else {
                        if (newStage === 'up' && elbowAngle > 140.0) {
                            newStage = 'down';
                            newFeedback = "Good! Now pull the weight up.";
                            newColor = "#00FF00";
                        } else if (newStage === 'down' && elbowAngle < 85.0) {
                            newReps += 1;
                            newStage = 'up';
                            newFeedback = "Perfect Row!";
                            newColor = "#00FF00";
                        }
                    }
                } else if (ex === 'Sumo Squat') {
                    // Symmetrical Front-Facing Tracking
                    const lShoulder = landmarks[11], lWrist = landmarks[15], lHip = landmarks[23], lKnee = landmarks[25], lAnkle = landmarks[27];
                    const rShoulder = landmarks[12], rWrist = landmarks[16], rHip = landmarks[24], rKnee = landmarks[26], rAnkle = landmarks[28];

                    // Calculate Metrics & Angles
                    // Stance Width (X-axis)
                    const shoulderWidth = Math.abs(lShoulder.x - rShoulder.x);
                    const ankleWidth = Math.abs(lAnkle.x - rAnkle.x);
                    const isWideStance = ankleWidth > (shoulderWidth * 1.5);

                    // Center Grip (Holding kettlebell in the middle)
                    const wristDist = Math.abs(lWrist.x - rWrist.x);
                    const isCenterGrip = (wristDist < shoulderWidth * 0.8) && (lWrist.y > lHip.y) && (rWrist.y > rHip.y);

                    // Posture (Torso Angle to prevent leaning too far forward)
                    const lBodyAngle = calculateAngle(lShoulder, lHip, lKnee);
                    const rBodyAngle = calculateAngle(rShoulder, rHip, rKnee);

                    // Squat Depth (Knee Angle)
                    const lKneeAngle = calculateAngle(lHip, lKnee, lAnkle);
                    const rKneeAngle = calculateAngle(rHip, rKnee, rAnkle);

                    // Strict State Machine & Cheat Prevention
                    if (!isWideStance) {
                        newFeedback = "WARNING: Stand wider for Sumo!";
                        newColor = "#FFA500";
                    } else if (!isCenterGrip) {
                        newFeedback = "WARNING: Hold weight in the center!";
                        newColor = "#FFA500";
                    } else if (lBodyAngle < 85.0 || rBodyAngle < 85.0) {
                        newFeedback = "WARNING: Keep your chest up!";
                        newColor = "#FF0000";
                    } else {
                        if (newStage === 'up' && lKneeAngle < 100.0 && rKneeAngle < 100.0) {
                            newStage = 'down';
                            newFeedback = "Good! Now stand up.";
                            newColor = "#00FF00";
                        } else if (newStage === 'down' && lKneeAngle > 160.0 && rKneeAngle > 160.0) {
                            newReps += 1;
                            newStage = 'up';
                            newFeedback = "Perfect Sumo Squat!";
                            newColor = "#00FF00";
                        }
                    }
                } else if (ex === 'Goblet Squat') {
                    // Symmetrical Front-Facing Tracking
                    const lShoulder = landmarks[11], lWrist = landmarks[15], lHip = landmarks[23], lKnee = landmarks[25], lAnkle = landmarks[27];
                    const rShoulder = landmarks[12], rWrist = landmarks[16], rHip = landmarks[24], rKnee = landmarks[26], rAnkle = landmarks[28];

                    // Calculate Metrics & Angles
                    // Body & Torso Verticals (for grip check)
                    const avgShoulderY = (lShoulder.y + rShoulder.y) / 2;
                    const avgHipY = (lHip.y + rHip.y) / 2;
                    const avgWristY = (lWrist.y + rWrist.y) / 2;
                    const torsoVerticalSpan = avgHipY - avgShoulderY;
                    const chestZoneBottomBoundaryY = avgShoulderY + (torsoVerticalSpan * 0.4);

                    // Stance Width Check (for differentiation)
                    const shoulderWidth = Math.abs(lShoulder.x - rShoulder.x);
                    const ankleWidth = Math.abs(lAnkle.x - rAnkle.x);

                    // Posture (Torso Angle)
                    const lBodyAngle = calculateAngle(lShoulder, lHip, lKnee);
                    const rBodyAngle = calculateAngle(rShoulder, rHip, rKnee);

                    // Squat Depth (Knee Angle)
                    const lKneeAngle = calculateAngle(lHip, lKnee, lAnkle);
                    const rKneeAngle = calculateAngle(rHip, rKnee, rAnkle);

                    // Strict State Machine & Cheat Prevention (Strict Order)
                    if (ankleWidth > (shoulderWidth * 1.5)) {
                        newFeedback = "WARNING: Stance too wide for Goblet!";
                        newColor = "#FFA500";
                    } else if (avgWristY > chestZoneBottomBoundaryY) {
                        newFeedback = "WARNING: Hold weight at chest level!";
                        newColor = "#FFA500";
                    } else if (lBodyAngle < 90.0 || rBodyAngle < 90.0) {
                        newFeedback = "WARNING: Keep your chest up!";
                        newColor = "#FF0000";
                    } else {
                        if (newStage === 'up' && lKneeAngle < 100.0 && rKneeAngle < 100.0) {
                            newStage = 'down';
                            newFeedback = "Good! Now stand up.";
                            newColor = "#00FF00";
                        } else if (newStage === 'down' && lKneeAngle > 160.0 && rKneeAngle > 160.0) {
                            newReps += 1;
                            newStage = 'up';
                            newFeedback = "Perfect Goblet Squat!";
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
                    // Left: 11 (Shoulder), 15 (Wrist), 27 (Ankle), 23 (Hip)
                    // Right: 12 (Shoulder), 16 (Wrist), 28 (Ankle), 24 (Hip)
                    const lShoulder = landmarks[11], rShoulder = landmarks[12];
                    const lWrist = landmarks[15], rWrist = landmarks[16];
                    const lAnkle = landmarks[27], rAnkle = landmarks[28];
                    const lHip = landmarks[23], rHip = landmarks[24];

                    // 1. Distance calculation on x-axis
                    const ankleDist = Math.abs(lAnkle.x - rAnkle.x);
                    const shoulderDist = Math.abs(lShoulder.x - rShoulder.x);

                    // 2. Pose Conditions
                    // Note: smaller y means "higher" visually on canvas
                    const armsUp = (rWrist.y < rShoulder.y) && (lWrist.y < lShoulder.y);
                    const legsApart = ankleDist > (shoulderDist * 1.5);

                    // 3. Baseline Tracking & Jump Validation
                    const currentHipY = (lHip.y + rHip.y) / 2;

                    if (!armsUp && !legsApart) {
                        baselineHipY.current = currentHipY;
                    }

                    const jumpHeight = baselineHipY.current > 0 ? (baselineHipY.current - currentHipY) : 0;
                    const isJumping = jumpHeight > 0.005;

                    // 4. Update State Machine
                    if (armsUp && legsApart) {
                        if (isJumping) {
                            newStage = 'up';
                            newFeedback = "Good Pace!";
                            newColor = "#00FF00";
                        } else {
                            newFeedback = "WARNING: Give it a little bounce!";
                            newColor = "#FFA500";
                        }
                    } else if (!armsUp && !legsApart) {
                        if (newStage === 'up') {
                            newReps += 1;
                            newStage = 'down';
                        }
                        baselineHipY.current = currentHipY;
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
                    // Dynamic Side Selection (Visibility Check)
                    const leftVis = (landmarks[11].visibility + landmarks[13].visibility + landmarks[15].visibility + landmarks[23].visibility) / 4;
                    const rightVis = (landmarks[12].visibility + landmarks[14].visibility + landmarks[16].visibility + landmarks[24].visibility) / 4;

                    const isLeft = leftVis > rightVis;

                    const shoulder = isLeft ? landmarks[11] : landmarks[12];
                    const elbow = isLeft ? landmarks[13] : landmarks[14];
                    const wrist = isLeft ? landmarks[15] : landmarks[16];
                    const hip = isLeft ? landmarks[23] : landmarks[24];
                    const ankle = isLeft ? landmarks[27] : landmarks[28];

                    // 1. Horizontal Torso Requirement
                    const torsoAngle = calculateVerticalAngle(shoulder, hip);

                    if (torsoAngle <= 60.0) {
                        newFeedback = "WARNING: Get into a horizontal push-up position!";
                        newColor = "#FFA500";
                        newStage = 'setup';
                    } else {
                        // 2. The Starting Pose Gate
                        const bodyAngle = calculateAngle(shoulder, hip, ankle);
                        const elbowAngle = calculateAngle(shoulder, elbow, wrist);
                        const isArmVisible = (elbow.visibility > 0.5 && wrist.visibility > 0.5);

                        if (bodyAngle < 140.0) {
                            newFeedback = "WARNING: Keep your back straight!";
                            newColor = "#FF0000";
                            newStage = 'setup';
                        } else {
                            if (newStage === 'setup') {
                                if (isArmVisible && elbowAngle > 150.0) {
                                    newStage = 'up';
                                    newFeedback = "Ready! Go down.";
                                    newColor = "#00FF00";
                                } else {
                                    newFeedback = "Extend arms to start.";
                                    newColor = "#FFA500";
                                }
                            } else if (newStage === 'up' || newStage === 'down') {
                                newFeedback = "Good Form";
                                newColor = "#00FF00";

                                // 3. Rep Counting Flow
                                if (newStage === 'up' && ((isArmVisible && elbowAngle < 90.0) || !isArmVisible)) {
                                    newStage = 'down';
                                } else if (newStage === 'down' && isArmVisible && elbowAngle > 150.0) {
                                    newReps += 1;
                                    newStage = 'up';
                                }
                            }
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
        setSets(1);
        setIsResting(false);
        setExerciseStage('down');
        setFeedback('Good Form');
        setFeedbackColor('#00FF00');
        totalRepsRef.current = 0;
        workoutLogRef.current = [];
        prevExerciseRef.current = null;
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
                    {currentExercises.map((ex, idx) => {
                        const isJumpingJack = ex === 'Jumping Jack';
                        return (
                            <div key={idx} className="w-full flex items-center gap-2">
                                <button
                                    onClick={() => {
                                        setActiveExercise(ex);
                                        if (isJumpingJack) setDetectionMode(null);
                                    }}
                                    className="flex-1 flex items-center justify-between p-6 bg-white/[0.02] hover:bg-emerald-500/10 border border-white/5 hover:border-emerald-500/40 rounded-2xl transition-all duration-300 group shadow-lg"
                                >
                                    <span className="text-lg font-bold text-slate-300 group-hover:text-white transition-colors tracking-wide">{ex}</span>
                                    <div className="text-emerald-400 opacity-0 group-hover:opacity-100 transform -translate-x-6 group-hover:translate-x-0 transition-all duration-300 ease-out flex items-center justify-center w-10 h-10 rounded-full bg-emerald-500/20 shadow-[0_0_15px_rgba(52,211,153,0.3)]">
                                        <svg className="w-5 h-5 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                                        </svg>
                                    </div>
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedVideo({ name: ex, path: VIDEO_PATHS[ex] });
                                    }}
                                    className="flex-shrink-0 flex items-center justify-center w-16 h-[76px] bg-white/[0.02] hover:bg-cyan-500/20 border border-white/5 hover:border-cyan-500/40 rounded-2xl transition-all duration-300 shadow-lg text-cyan-400 group"
                                    title={`Play ${ex} tutorial`}
                                >
                                    <svg className="w-7 h-7 transform group-hover:scale-110 transition-transform" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M8 5v14l11-7z" />
                                    </svg>
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Active Exercise Interactive View & Rep Counters */}
            {activeExercise && (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-between pointer-events-none">
                    {/* Top Stats Overlay */}
                    <div className="w-full flex justify-between items-start p-8">
                        {/* Top Left Stats (Reps & Sets) */}
                        <div className="bg-black/60 backdrop-blur-xl border border-white/20 px-8 py-5 rounded-3xl shadow-[0_0_30px_rgba(0,0,0,0.5)] flex gap-8">
                            <div>
                                <h3 className="text-emerald-400 text-xs font-black tracking-[0.2em] uppercase mb-1">
                                    {activeExercise === 'Plank' ? 'Timer' : 'Total Reps'}
                                </h3>
                                <p className="text-6xl md:text-7xl font-black text-white leading-none tracking-tighter">
                                    {reps}
                                    {activeExercise === 'Plank' && <span className="text-2xl ml-2 text-emerald-400">sec</span>}
                                </p>
                            </div>
                            {activeExercise !== 'Plank' && (
                                <div className="pl-8 border-l border-white/10">
                                    <h3 className="text-cyan-400 text-xs font-black tracking-[0.2em] uppercase mb-1">
                                        Sets
                                    </h3>
                                    <p className="text-6xl md:text-7xl font-black text-white leading-none tracking-tighter opacity-90">
                                        {sets}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Top Right Form Status */}
                        <div className="flex flex-col gap-4">
                            <div
                                className="bg-black/60 backdrop-blur-xl border px-8 py-5 rounded-3xl shadow-[0_0_30px_rgba(0,0,0,0.5)] transition-all duration-300 flex flex-col justify-center items-end"
                                style={{ borderColor: `${feedbackColor}50` }}
                            >
                                <h3 className="text-xs font-black tracking-[0.2em] uppercase mb-1" style={{ color: feedbackColor }}>Form Status</h3>
                                <p className="text-xl md:text-2xl font-black text-white uppercase tracking-wide text-right">{feedback}</p>
                            </div>
                        </div>
                    </div>

                    {/* Left Sidebar Controls */}
                    <div className="absolute left-8 top-1/2 -translate-y-1/2 flex flex-col gap-4 pointer-events-auto bg-black/60 backdrop-blur-xl border border-white/10 p-6 rounded-3xl shadow-[0_0_40px_rgba(0,0,0,0.5)]">
                        <h3 className="text-emerald-400 text-xs font-black tracking-[0.2em] uppercase mb-2">Controls</h3>

                        {/* Change Exercise Dropdown */}
                        <div className="mb-4">
                            <label className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2 block">Current Exercise</label>
                            {/* Premium Change Exercise Dropdown */}
                            <div className="mt-4 relative group w-full max-w-[200px]">
                                <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 rounded-xl blur-md transition-all opacity-50 group-hover:opacity-100"></div>

                                {/* Custom Dropdown Trigger */}
                                <div
                                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                    className="relative flex items-center justify-between w-full bg-black/80 hover:bg-black text-white font-bold text-sm py-2.5 px-4 rounded-xl cursor-pointer transition-colors border border-white/10 group-hover:border-emerald-500/50 shadow-xl"
                                >
                                    <span className="truncate">{activeExercise}</span>
                                    <svg
                                        className={`fill-current h-4 w-4 text-emerald-400 transition-transform duration-300 ${isDropdownOpen ? 'rotate-180' : ''}`}
                                        xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"
                                    >
                                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                                    </svg>
                                </div>

                                {/* Custom Dropdown Menu */}
                                {isDropdownOpen && currentExercises && (
                                    <div className="absolute top-full left-0 right-0 mt-2 bg-zinc-900/95 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden shadow-[0_10px_40px_rgba(0,0,0,0.8)] z-50 animate-fade-in-down origin-top">
                                        {currentExercises.map((ex) => (
                                            <div
                                                key={ex}
                                                onClick={() => {
                                                    setActiveExercise(ex);
                                                    setIsDropdownOpen(false);
                                                }}
                                                className={`px-4 py-3 cursor-pointer text-sm font-medium transition-colors hover:bg-white/10 ${activeExercise === ex ? 'text-emerald-400 bg-white/5' : 'text-slate-300'}`}
                                            >
                                                {ex}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Action Buttons */}
                        {activeExercise !== 'Plank' && !isResting && (
                            <button
                                onClick={() => {
                                    totalRepsRef.current += reps;
                                    setSets(prev => prev + 1);
                                    setReps(0);
                                    setIsResting(true);
                                }}
                                className="w-full group flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-br from-cyan-600 to-cyan-700 hover:from-cyan-500 hover:to-cyan-600 text-white font-bold text-base tracking-wide rounded-xl shadow-[0_5px_20px_rgba(6,182,212,0.3)] hover:shadow-[0_10px_30px_rgba(6,182,212,0.5)] transition-all transform hover:-translate-y-1 active:scale-95 border border-cyan-400/30"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Rest Set
                            </button>
                        )}

                        <button
                            onClick={() => {
                                // Push current exercise into the log
                                const finalLog = [...workoutLogRef.current, {
                                    exercise: activeExercise,
                                    sets: sets,
                                    reps: totalRepsRef.current + reps,
                                }];
                                onStop(finalLog);
                            }}
                            className="w-full group flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-br from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-bold text-base tracking-wide rounded-xl shadow-[0_5px_20px_rgba(220,38,38,0.3)] hover:shadow-[0_10px_30px_rgba(220,38,38,0.5)] transition-all transform hover:-translate-y-1 active:scale-95 border border-red-400/30"
                        >
                            <div className="w-4 h-4 bg-white rounded flex-shrink-0 flex items-center justify-center">
                                <div className="w-1.5 h-1.5 bg-red-600 rounded-sm"></div>
                            </div>
                            Stop Workout
                        </button>
                    </div>
                </div>
            )}

            {/* Rest Mode Popup */}
            {isResting && (
                <div className="absolute inset-0 z-[110] bg-black/90 backdrop-blur-lg flex items-center justify-center p-4 animate-fade-in">
                    <div className="flex flex-col items-center justify-center max-w-lg w-full">
                        <div className="w-32 h-32 rounded-full bg-cyan-500/10 border-4 border-cyan-500/30 flex items-center justify-center mb-8 animate-pulse shadow-[0_0_100px_rgba(6,182,212,0.4)]">
                            <span className="text-5xl font-black text-cyan-400">{sets - 1}</span>
                        </div>
                        <h2 className="text-4xl font-black text-white tracking-widest uppercase mb-2">Sets Completed</h2>
                        <p className="text-slate-400 text-lg mb-12 text-center">Take a breather. Drink some water. Get ready for Set {sets}.</p>

                        <button
                            onClick={() => setIsResting(false)}
                            className="w-full py-6 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-white rounded-3xl text-2xl font-black tracking-widest uppercase transition-all shadow-[0_10px_40px_rgba(52,211,153,0.3)] hover:shadow-[0_15px_60px_rgba(52,211,153,0.5)] transform hover:-translate-y-1 active:scale-95 flex items-center justify-center gap-4 border border-white/20"
                        >
                            <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                            </svg>
                            Start Set {sets}
                        </button>
                    </div>
                </div>
            )}

            {/* Modal for Video Playback */}
            {selectedVideo && (
                <div className="absolute inset-0 z-[100] bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-4 transition-opacity duration-300 gap-6">
                    <div className="relative w-full max-w-4xl bg-zinc-900 border border-white/10 rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.8)] animate-fade-in-down">
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 bg-black/40 border-b border-white/5">
                            <h3 className="text-xl font-bold text-white tracking-wide">
                                {selectedVideo.name} <span className="text-slate-500 font-light ml-2">Tutorial</span>
                            </h3>
                            <button
                                onClick={() => setSelectedVideo(null)}
                                className="w-10 h-10 flex items-center justify-center rounded-full bg-white/5 hover:bg-red-500/20 hover:text-red-400 text-slate-400 transition-colors"
                            >
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        {/* Video Container */}
                        <div className="w-full aspect-video bg-black relative flex items-center justify-center">
                            {/* The actual video element */}
                            <video
                                src={selectedVideo.path}
                                controls
                                autoPlay
                                className="w-full h-full object-contain"
                                onError={(e) => {
                                    e.target.style.display = 'none';
                                    e.target.nextElementSibling.style.display = 'flex';
                                }}
                            >
                                Your browser does not support the video tag.
                            </video>

                            {/* Fallback Display if video is missing */}
                            <div className="hidden flex-col items-center justify-center absolute inset-0 text-slate-500 pt-10">
                                <svg className="w-16 h-16 mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                                <p className="text-lg text-white">Video not available yet</p>
                                <p className="text-sm mt-2 opacity-60">Add video to: <span className="text-cyan-400 font-mono tracking-wider">{selectedVideo.path}</span></p>
                                <p className="text-xs mt-1 opacity-40">(in your public/videos folder)</p>
                            </div>
                        </div>
                    </div>

                    {/* Start Tracking Floating Button */}
                    <div className="w-full max-w-4xl animate-fade-in-up">
                        <button
                            onClick={() => {
                                setActiveExercise(selectedVideo.name);
                                if (selectedVideo.name === 'Jumping Jack') setDetectionMode(null);
                                setSelectedVideo(null);
                            }}
                            className="w-full py-5 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-white border border-white/20 rounded-3xl text-xl font-black tracking-widest uppercase transition-all shadow-[0_10px_40px_rgba(52,211,153,0.3)] hover:shadow-[0_15px_60px_rgba(52,211,153,0.5)] transform hover:-translate-y-1 active:scale-95 flex items-center justify-center gap-3"
                        >
                            <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                            </svg>
                            Start Tracking
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
