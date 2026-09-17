// script.js
document.addEventListener('DOMContentLoaded', () => {
    const startButton = document.getElementById('startButton');
    const stopButton = document.getElementById('stopButton');
    const saveButton = document.getElementById('saveButton');

    let synth;
    let loop;
    let recorder;
    let audioChunks = [];

    startButton.addEventListener('click', async () => {
        if (!synth) {
            synth = new Tone.Synth().toDestination();
        }

        if (!loop) {
            loop = new Tone.Loop(time => {
                synth.triggerAttackRelease("C4", "8n", time);
                synth.triggerAttackRelease("E4", "8n", "+0.5");
                synth.triggerAttackRelease("G4", "8n", "+1");
                synth.triggerAttackRelease("B4", "8n", "+1.5");
            }, "2n").start(0);
        }

        if (!recorder) {
            await Tone.start();  // 确保在用户交互后启动AudioContext
            const dest = Tone.context.createMediaStreamDestination();
            Tone.Master.connect(dest);

            recorder = new Recorder({
                encoderPath: 'opus-recorder.wasm.js',
                encoderSampleRate: 48000,
                maxFramesPerPage: 960
            });
            recorder.initRecording();
        }

        Tone.Transport.start();
    });

    stopButton.addEventListener('click', () => {
        if (loop) {
            loop.stop();
        }
        Tone.Transport.stop();
        recorder.stop();
    });

    saveButton.addEventListener('click', () => {
        recorder.exportWAV(blob => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            document.body.appendChild(a);
            a.style = 'display: none';
            a.href = url;
            a.download = 'composition.wav';
            a.click();
            window.URL.revokeObjectURL(url);
        });
    });
});
