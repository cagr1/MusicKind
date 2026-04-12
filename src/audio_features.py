import numpy as np
import librosa


def extract_features(file_path, duration=None):
    y, sr = librosa.load(file_path, sr=None, mono=True, duration=duration)

    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)

    rms = librosa.feature.rms(y=y)[0]
    energy = float(np.mean(rms)) if rms.size else 0.0

    centroid = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
    brightness = float(np.mean(centroid)) if centroid.size else 0.0

    stft = np.abs(librosa.stft(y))
    freqs = librosa.fft_frequencies(sr=sr)
    bass_mask = (freqs >= 20) & (freqs <= 150)
    bass_energy = float(np.mean(stft[bass_mask])) if np.any(bass_mask) else 0.0

    y_harm, y_perc = librosa.effects.hpss(y)
    perc_energy = np.mean(np.abs(y_perc))
    harm_energy = np.mean(np.abs(y_harm))
    percussiveness = float(perc_energy / (perc_energy + harm_energy + 1e-9))

    vocal_presence = float(harm_energy / (perc_energy + harm_energy + 1e-9))

    return {
        "bpm": float(tempo),
        "energy": energy,
        "brightness": brightness,
        "bass_weight": bass_energy,
        "percussiveness": percussiveness,
        "vocal_presence": vocal_presence,
    }


def detect_key(file_path):
    y, sr = librosa.load(file_path, sr=None, mono=True)
    chroma = librosa.feature.chroma_stft(y=y, sr=sr)
    chroma_mean = np.mean(chroma, axis=1)
    pitch_class = int(np.argmax(chroma_mean))
    return pitch_class
